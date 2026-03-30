import { z } from "zod";
import { extractSalaryFromTextCore, htmlToPlainText } from "@/app/api/data-ingestion/adapters/util";
export type GHCanon = {
  time_type?: string | null;
  salary_min?: number | null;
  salary_mid?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  department?: string | null;
  salary_source?: "metadata" | "content" | "jsonld" | "text" | null;
  comp_period?: "hour" | "year" | null;
};

/** Zod guard for GH metadata array (kept permissive). */
const ZGHCurrency = z
  .object({
    unit: z.string().optional(),
    amount: z.string(),
  })
  .strict();

const ZGHMetadataItem = z
  .object({
    name: z.string().nullable().optional(),
    value_type: z.string().nullable().optional(),
    value: z.union([ZGHCurrency, z.string(), z.null()]).optional(),
  })
   .catchall(z.unknown());

const ZMaybeMetadata = z
  .object({
    metadata: z.array(ZGHMetadataItem).optional(),
  })
  .catchall(z.unknown());

/** Defensive normalize to a metadata[] view. */
function asMetadataArray(raw: unknown): Array<z.infer<typeof ZGHMetadataItem>> {
  const parsed = ZMaybeMetadata.safeParse(raw);
  if (parsed.success && Array.isArray(parsed.data.metadata)) {
    return parsed.data.metadata;
  }
  if (Array.isArray(raw)) {
    const coerced = z.array(ZGHMetadataItem).safeParse(raw);
    return coerced.success ? coerced.data : [];
    }
  return [];
}

export function finalizeSalary(features: GHCanon) {
  const has = (n: unknown) => typeof n === "number" && Number.isFinite(n);

  let min = features.salary_min;
  let mid = features.salary_mid;
  let max = features.salary_max;

  // Handle invalid ordering: if mid < min, treat mid as the new min
  if (has(min) && has(mid) && (mid as number) < (min as number)) {
    min = mid as number;
    mid = undefined;
  }

  // Handle invalid ordering: if mid > max, treat mid as the new max
  if (has(mid) && has(max) && (mid as number) > (max as number)) {
    max = mid as number;
    mid = undefined;
  }

  // Keep ordering sane if both min and max provided
  if (has(min) && has(max) && (min as number) > (max as number)) {
    const t = min as number;
    min = max as number;
    max = t;
  }

  // Only compute midpoint when both bounds exist and no midpoint
  if (!has(mid) && has(min) && has(max)) {
    mid = Math.round(((min as number) + (max as number)) / 2 * 100) / 100;
  }

  // Update features with validated values
  features.salary_min = has(min) ? min as number : undefined;
  features.salary_mid = has(mid) ? mid as number : undefined;
  features.salary_max = has(max) ? max as number : undefined;
}


/**
 * Extract salary & related fields from Greenhouse metadata.
 * Rules:
 *   - Use only base salary labels (ignore OTE/on-target and any equity/RSU).
 *   - Do not invent a max from a mid.
 *   - If only min exists, leave max unset.
 *   - Heuristic for comp period: <= 300 → "hour", otherwise "year".        
 */
export function extractGhFeaturesFromMetadata(raw: unknown): GHCanon {
  const features: GHCanon = {};
  const meta = asMetadataArray(raw);

  type SalaryKey = "salary_min" | "salary_mid" | "salary_max";

  function setSalary(features: GHCanon, key: SalaryKey, value: number) {
    features[key] = value;
  }

  // Use Zod to validate the currency object shape expected from GH
  type GHCur = z.infer<typeof ZGHCurrency>;
  const setCurrencyAmt = (field: SalaryKey, val: unknown, _label: string) => {
    const cur = z.object({
      unit: z.string().optional(),
      amount: z.string(),
    }).strict().safeParse(val);

    if (!cur.success) return;

    const num = parseFloat(cur.data.amount);
    if (!Number.isFinite(num)) return;

    const period: "hour" | "year" = num <= 300 ? "hour" : "year";
    setSalary(features, field, num);

    const unit = cur.data.unit?.toUpperCase();
    if (unit) features.currency ??= unit;

    features.salary_source ??= "metadata";
    features.comp_period ??= period;
  };

  for (const m of meta) {
    const name = String(m.name ?? "");
    const label = name.toLowerCase();
    const vt = (m.value_type ?? "").toLowerCase();

    // Skip equity-like fields entirely
    if (/equity|stock|rsu/.test(label)) continue;

    // Distinguish base vs OTE (do not want OTE in base salary_* fields)
    const isOTE = /\bote\b|on[-\s]?target/.test(label);
    const looksLikeBase = /salary|pay|compensation|base/.test(label) && !isOTE;

        if (vt === "currency" && looksLikeBase) {
      if (/minimum|min\b/.test(label)) {
        setCurrencyAmt("salary_min", m.value, label);
      } else if (/maximum|max\b/.test(label)) {
        setCurrencyAmt("salary_max", m.value, label);
      } else if (/midpoint|median/.test(label)) {
        setCurrencyAmt("salary_mid", m.value, label);
      }
    }

    

    // Time type
    if (name === "Time Type" && typeof m.value === "string") {
      features.time_type = m.value;
    }

    // Department
    if (
      (name === "Job Family" || name === "Careers Page Sorting: Department") &&
      typeof m.value === "string"
    ) {
      features.department = m.value;
    }
  }

  finalizeSalary(features);
  return features;
}

/** Text fallback: only fills fields that metadata didn't already populate. */
export function extractSalaryFromText(text: string, features: GHCanon) {
  if (!text) return;

  const result = extractSalaryFromTextCore(text);
  
  if (!result.found) {
    return; // nothing to set
  }

  let changed = false;
  if (features.salary_min == null) {
    features.salary_min = result.salary_min!;
    changed = true;
  }
  if (features.salary_max == null) {
    features.salary_max = result.salary_max!;
    changed = true;
  }
  if (!features.currency && result.currency) {
    features.currency = result.currency;
    changed = true;
  }

  // Set compensation period based on detection
  if (changed && !features.comp_period) {
    features.comp_period = result.comp_period;
  }

  if (changed && features.salary_source !== "metadata") {
    features.salary_source = "text";
  }
  finalizeSalary(features);
}