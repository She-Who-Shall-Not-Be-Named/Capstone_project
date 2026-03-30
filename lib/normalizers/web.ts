import { z } from "zod";
import { asNum, extractSalaryFromTextCore, htmlToPlainText } from "@/app/api/data-ingestion/adapters/util";

export type WebCompPeriod = "hour" | "year";
export type WebFeatures = {
  salary_min?: number;
  salary_mid?: number;
  salary_max?: number;
  currency?: string;
  comp_period?: WebCompPeriod;
  salary_source?: "jsonld" | "text";
};


/* ------------------------------ Zod Schemas ------------------------------ */
/** https://schema.org/QuantitativeValue */
const ZQuantitativeValue = z
  .object({
    "@type": z.string().optional(),
    minValue: z.union([z.number(), z.string()]).optional(),
    maxValue: z.union([z.number(), z.string()]).optional(),
    value: z.union([z.number(), z.string()]).optional(),
    unitText: z.string().optional(), // e.g., HOUR, YEAR
  })
  .catchall(z.unknown());

/** https://schema.org/MonetaryAmount */
const ZMonetaryAmount = z
  .object({
    "@type": z.string().optional(),
    currency: z.string().optional(), // e.g., USD
    value: z
      .union([
        ZQuantitativeValue, // object
        z.number(), // simple number
        z.string(), // sometimes stringy number
      ])
      .optional(),
  })
  .catchall(z.unknown());

/** Minimal JobPosting subset of concern */
const ZJobPosting = z
  .object({
    "@type": z.string().optional(), // "JobPosting"
    title: z.string().optional(),
    hiringOrganization: z
      .object({
        name: z.string().optional(),
      })
      .catchall(z.unknown())
      .optional(),
    baseSalary: ZMonetaryAmount.optional(),
  })
  .catchall(z.unknown());

/** Accept an object or array of objects; only care about JobPosting items */
const ZJsonLdTop = z.union([ZJobPosting, z.array(z.union([ZJobPosting, z.unknown()]))]);

/* ----------------------- Salary helpers / finalization -------------------- */
function finalizeSalary(features: WebFeatures) {
  const has = (n: unknown) => typeof n === "number" && Number.isFinite(n);

  let min = features.salary_min;
  let mid = features.salary_mid;
  let max = features.salary_max;

  // Keep ordering sane if both provided
  if (has(min) && has(max) && (min as number) > (max as number)) {
    const t = min as number;
    min = max as number;
    max = t;
  }

  // Only compute midpoint when both bounds exist
  if (!has(mid) && has(min) && has(max)) {
    mid = Math.round(((min as number) + (max as number)) / 2 * 100) / 100;
  }

  // Do not infer a missing bound from midpoint
  // Do not mirror a single bound into the other
  // Do not clamp mid to [min, max]

  if (has(min)) features.salary_min = min as number;
  if (has(mid)) features.salary_mid = mid as number;
  if (has(max)) features.salary_max = max as number;
}

/* ------------------------------ JSON-LD parse ----------------------------- */
export function extractWebFeaturesFromJsonLd(jsonld: unknown): WebFeatures {
  const features: WebFeatures = {};

  const parsed = ZJsonLdTop.safeParse(jsonld);
  if (!parsed.success) return features;

  type UnknownObj = { [k: string]: unknown };
  const isJobPostingLite = (u: unknown): u is UnknownObj =>
    !!u && typeof u === "object" && "@type" in (u as UnknownObj);

const items: Array<z.infer<typeof ZJobPosting>> = Array.isArray(parsed.data)
  ? parsed.data.filter((it): it is z.infer<typeof ZJobPosting> =>
      isJobPostingLite(it) && it["@type"] === "JobPosting")
  : [parsed.data];


  for (const jp of items) {
    const ma = jp.baseSalary;
    if (!ma) continue;

    let currency = (ma.currency ?? "").toString().trim().toUpperCase() || undefined;

    let min: number | undefined;
    let mid: number | undefined;
    let max: number | undefined;
    let period: WebCompPeriod | undefined;

   type Quantitative = z.infer<typeof ZQuantitativeValue>;

  if (ma.value && typeof ma.value === "object" && !Array.isArray(ma.value)) {
    const qv = ma.value as Quantitative;
    const minV = asNum(qv.minValue);
    const maxV = asNum(qv.maxValue);
    const valV = asNum(qv.value);

    const unitText = (qv.unitText ?? "").toString().toUpperCase();
      if (unitText.includes("HOUR")) period = "hour";
      else if (unitText.includes("YEAR") || unitText.includes("ANNUAL")) period = "year";

      if (minV !== undefined) min = minV;
      if (maxV !== undefined) max = maxV;
      if (valV !== undefined) mid = valV; // treat lone value as midpoint
    } else {
      const flat = asNum(ma.value as unknown);
      if (flat !== undefined) {
        mid = flat;
      }
    }

    // Heuristic fallback for comp period if still unknown:
    if (!period && (min ?? mid ?? max) !== undefined) {
      const probe = (min ?? mid ?? max)!;
      period = probe <= 300 ? "hour" : "year";
    }

    // Commit into features (don't overwrite existing if already set)
    if (min !== undefined && features.salary_min == null) features.salary_min = min;
    if (mid !== undefined && features.salary_mid == null) features.salary_mid = mid;
    if (max !== undefined && features.salary_max == null) features.salary_max = max;
    if (currency && !features.currency) features.currency = currency;
    if (period && !features.comp_period) features.comp_period = period;

    if (min !== undefined || mid !== undefined || max !== undefined) {
      features.salary_source ??= "jsonld";
    }
  }

  finalizeSalary(features);
  return features;
}

/* ------------------------------ Text fallback ---------------------------- */
export function extractWebFeaturesFromText(text: string): WebFeatures {
  const features: WebFeatures = {};
  if (!text) return features;

  const result = extractSalaryFromTextCore(text);
  
  if (!result.found) {
    return features;
  }

  features.salary_min = result.salary_min!;
  features.salary_max = result.salary_max!;
  if (result.currency) features.currency = result.currency;
  features.salary_source = "text";
  features.comp_period = result.comp_period;

  finalizeSalary(features);
  return features;
}

/* ------------------------------ Merge helper ----------------------------- */

const MERGE_KEYS = [
  "salary_min",
  "salary_mid",
  "salary_max",
  "currency",
  "comp_period",
  "salary_source",
] as const satisfies readonly (keyof WebFeatures)[];

// helper to keep TS happy per-key
function setIfMissing<K extends keyof WebFeatures>(
  target: WebFeatures,
  source: WebFeatures,
  key: K
) {
  if (target[key] == null && source[key] != null) {
    // TS: source[key] is compatible with target[key] by construction
    target[key] = source[key] as WebFeatures[K];
  }
}

export function mergeWebFeatures(a: WebFeatures, b: WebFeatures): WebFeatures {
  // b fills gaps; a wins on conflicts
  const out: WebFeatures = { ...a };
  for (const k of MERGE_KEYS) setIfMissing(out, b, k);
  return out;
}