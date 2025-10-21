// lib/normalizers/greenhouse.ts
import { z } from "zod";

export type GHCanon = {
  time_type?: string | null;
  salary_min?: number | null;
  salary_mid?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  department?: string | null;
  salary_source?: "metadata" | "text" | null;
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

    // --- NEW LOGIC ADDED HERE TO CORRECT MISASSIGNED MAX/MID ---
    // If we have a Min, a Mid, but NO Max, and Mid > Min, Mid is likely the Max.
    if (has(min) && has(mid) && !has(max) && (mid as number) > (min as number)) {
        max = mid; 
        mid = undefined; // Clear midpoint to recalculate later
        features.salary_mid = undefined;
    }

  // Keep ordering sane if both provided
  if (has(min) && has(max) && (min as number) > (max as number)) {
    const t = min as number;
    min = max as number;
    max = t;
  }

  // Only compute midpoint when BOTH bounds exist
  if (!has(mid) && has(min) && has(max)) {
    mid = ((min as number) + (max as number)) / 2;
  }

  // Do not infer missing max from mid, and don’t mirror singletons.
  if (has(min)) features.salary_min = min as number;
  if (has(mid)) features.salary_mid = mid as number;
  if (has(max)) features.salary_max = max as number;
}

/** Convert (possibly entity-escaped) HTML to readable plain text. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";

  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  const decodeEntities = (s: string) =>
    s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_m, g1: string) => {
      if (g1[0] === "#") {
        const hex = g1[1]?.toLowerCase() === "x";
        const code = parseInt(hex ? g1.slice(2) : g1.slice(1), hex ? 16 : 10);
        if (Number.isFinite(code)) return String.fromCodePoint(code);
        return _m;
      }
      return Object.prototype.hasOwnProperty.call(named, g1) ? named[g1] : _m;
    });

  let text = decodeEntities(String(html));

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n");

  text = text.replace(/<[^>]+>/g, "");

  text = text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
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

/** Text fallback: only fills fields that metadata didn’t already populate. */
export function extractSalaryFromText(text: string, features: GHCanon) {
  if (!text) return;

  const s = String(text);

  // 1) "$170,000 - $250,000" (or "170,000 to 250,000")
  const dollarsRange = /\$?\s?(\d{2,3}(?:,\d{3})?)\s*(?:-|–|to)\s*\$?\s?(\d{2,3}(?:,\d{3})?)/i;
  // 2) "170k - 250k"
  const kRange = /(\d{2,3})\s*k\s*(?:-|–|to)\s*(\d{2,3})\s*k/i;
  // 3) single-point "$19.30" used for hourly roles
  const singleDollar = /\$\s?(\d{1,3}(?:,\d{3})?(?:\.\d{1,2})?)/;

  let loNum: number | null = null;
  let hiNum: number | null = null;
  let sawDollarSymbol = false;

  const m1 = s.match(dollarsRange);
  if (m1) {
    loNum = parseFloat(m1[1].replace(/,/g, ""));
    hiNum = parseFloat(m1[2].replace(/,/g, ""));
    sawDollarSymbol = /\$/.test(m1[0]);
  } else {
    const m2 = s.match(kRange);
    if (m2) {
      const lo = parseFloat(m2[1]);
      const hi = parseFloat(m2[2]);
      if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
        loNum = lo * 1000;
        hiNum = hi * 1000;
      }
    } else {
      const m3 = s.match(singleDollar);
      if (m3) {
        const v = parseFloat(m3[1].replace(/,/g, ""));
        if (Number.isFinite(v)) {
          loNum = v;
          hiNum = v;
          sawDollarSymbol = true;
        }
      }
    }
  }

  if (loNum == null || hiNum == null || Number.isNaN(loNum) || Number.isNaN(hiNum)) {
    return; // nothing to set
  }

  let changed = false;
  if (features.salary_min == null) {
    features.salary_min = loNum;
    changed = true;
  }
  if (features.salary_max == null) {
    features.salary_max = hiNum;
    changed = true;
  }
  if (!features.currency && sawDollarSymbol) {
    features.currency = "USD";
    changed = true;
  }

  if (changed && features.salary_source !== "metadata") {
    features.salary_source = "text";
  }
  finalizeSalary(features);
}