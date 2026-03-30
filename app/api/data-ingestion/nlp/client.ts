// Take a unified AdapterJob (from any source: Greenhouse or generic web), extract reliable structured fields using deterministic rules first, 
// then LLM for the fuzzy stuff, and return a single merged object ready for DB insertion/scoring.

import OpenAI from "openai";
import { z } from "zod";
import type { AdapterJob } from "../adapters/types";
import { dbJobFeatures } from "@/app/db/jobFeatures";
import { extractGhFeaturesFromMetadata, extractSalaryFromText, finalizeSalary } from "@/lib/normalizers/greenhouse";
import { htmlToPlainText } from "../adapters/util";

// ---- OpenAI client ----
let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY missing. Add it to .env.local for development or environment variables for production.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

// Types
type DBFeatures = dbJobFeatures;

// Custom error class for LLM analysis failures
class LLMAnalysisError extends Error {
  constructor(
    message: string,
    public firstAttemptError: unknown,
    public secondAttemptError: unknown
  ) {
    super(message);
    this.name = 'LLMAnalysisError';
  }
}

// Contains all fields that are difficult to extract
const ZJobNLP = z.object({
  time_type: z.enum(["full-time","part-time","contract"]).nullable(),
  location: z.string().nullable(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_mid: z.number().nullable(),
  remote_policy: z.enum(["onsite","hybrid","remote"]).nullable(),
  seniority: z.enum(["intern","junior","mid","senior","lead","manager"]).nullable(),
  department: z.string().nullable(),
  currency: z.string().nullable(),
  timezone_requirement: z.string().nullable(),
});

export type JobNLP = z.infer<typeof ZJobNLP>;
export type Combined = Partial<DBFeatures> & Partial<JobNLP>; 

const EmptyNLP: JobNLP = {
  time_type: null, location: null, salary_min: null, salary_max: null, salary_mid: null,
  remote_policy: null, seniority: null, currency: null, timezone_requirement: null, department: null
};

// ---- helpers (adapter-independent) ----

// Type guards for safe raw JSON access
function hasMetadata(obj: unknown): obj is { metadata: unknown } {
  return typeof obj === 'object' && obj !== null && 'metadata' in obj;
}

function hasLocation(obj: unknown): obj is { location: { name: string } } {
  if (typeof obj !== 'object' || obj === null) return false;
  const objRecord = obj as Record<string, unknown>;
  if (!('location' in objRecord)) return false;
  const location = objRecord.location;
  if (typeof location !== 'object' || location === null) return false;
  const locationRecord = location as Record<string, unknown>;
  return 'name' in locationRecord && typeof locationRecord.name === 'string';
}

function pickMetadata(job: AdapterJob): unknown {
  // Find the raw metadata value within the AdapterJob object.
  if (hasMetadata(job.raw_json)) {
    return job.raw_json.metadata;
  }
  if (hasMetadata(job)) {
    return (job as { metadata: unknown }).metadata;
  }
  return null;
}

export function pickContent(job: AdapterJob): string {
  // Retrieves the job.content string for raw content
  return typeof job?.content === "string" ? job.content : "";
}

function pickLocationName(job: AdapterJob): string | null {
  if (typeof job?.location === "string" && job.location) return job.location;
  if (hasLocation(job.raw_json)) {
    return job.raw_json.location.name;
  }
  return null;
}

// ensures the deterministic value always overrides the LLM value if it exists
function mergePreferDeterministic<T extends Record<string, unknown>, U extends Record<string, unknown>>(det: T, ai: U): T & U {
  const out: Record<string, unknown> = { ...ai };
  for (const [k, v] of Object.entries(det)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as T & U;
}

// check the job description text for strong signals regarding the salary compensation period (hourly vs. annual).
function unitHints(text: string): { hour: boolean; year: boolean } {
  const hour = /\b(hourly|per\s*hour|\/\s*(?:hr|hour)|\bhr\b)\b/i.test(text);
  const year =
    /\b(annual|per\s*(?:year|yr)|\/\s*(?:year|yr)|salary)\b/i.test(text) ||
    /\$\s*\d{2,3}\s*[kK]\b/.test(text) ||         // $170k, 150k
    /\$\s*\d{5,}/.test(text);                      // $170000
  return { hour, year };
}


// ---- Core: analyze an AdapterJob ----
export async function analyzeAdapterJob(job: AdapterJob): Promise<Combined> {
    // 1) Start with features from adapter (already extracted with proper source tracking)
    let features: Partial<DBFeatures> = job.features || {};
    
    // 2) If no features from adapter, try metadata extraction as fallback
    if (!features || Object.keys(features).length === 0) {
        if (job.ats_provider === "greenhouse") {
            try {
                features = extractGhFeaturesFromMetadata(pickMetadata(job));
                // Mark as metadata source
                if (features.salary_source) {
                    features.salary_source = "metadata";
                }
            } catch(err) {
                console.warn("Failed to extract Greenhouse metadata:", err);
                features = {};
            }
        }
    }

    // 2) Convert the adapter’s HTML/content into plain text.
    const rawText = htmlToPlainText(pickContent(job));
    const plainText = rawText.slice(0, 20_000);

    const f2 = { ...features }; //shallow copy to keep top features 
    
    // Priority-based override logic:
    // 1. ATS metadata (highest priority) - don't override
    // 2. Web JSON-LD (high priority) - don't override
    // 3. Web/NLP extraction (better parsing) - can override ATS content and web text
    // 4. ATS content / Web text (fallback) - can be overridden
    
    // Only run text extraction if missing salary from high-priority sources
    const hasSalaryFromHighPriority = (features.salary_source === "metadata" || 
                                      features.salary_source === "jsonld") && 
                                     (features.salary_min || features.salary_max);
    
    if (!hasSalaryFromHighPriority) {
        // Run text extraction (can override ATS content, web text, or fill gaps)
        extractSalaryFromText(plainText, f2);
        
        // Mark as text source if extracted from text
        if (f2.salary_min || f2.salary_max) {
            f2.salary_source = "text";
        }
    }

    const { hour} = unitHints(plainText);

    // If numbers are small but no explicit hourly words, delete
    if (f2.salary_min != null && f2.salary_max != null) {
    const min = Number(f2.salary_min);
    const max = Number(f2.salary_max);
    const tinyRange = max <= 100;

    if (tinyRange && !hour) {
        delete f2.salary_min;
        delete f2.salary_max;
        delete f2.salary_mid;
    }
    }
    
    features = f2;

    // 3) LLM Schema with fields
    const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
        location: { type: ["string","null"] },
        salary_min: { type: ["number","null"] },
        salary_max: { type: ["number","null"] },
        salary_mid: { type: ["number","null"] },
        remote_policy: { type: ["string","null"], enum: ["onsite","hybrid","remote"] },
        seniority: { type: ["string","null"], enum: ["intern","junior","mid","senior","lead","manager"] },
        time_type: { type: ["string","null"], enum: ["full-time","part-time","contract"] },
        currency: { type: ["string","null"] },
        department: {type: ["string","null"]},
        timezone_requirement: { type: ["string","null"] },
        },
        required: ["location","salary_max","salary_min","salary_mid","remote_policy","seniority","time_type","currency","timezone_requirement", "department"],
    } as const;
    // The schema enforces allowed keys and types; temperature is low for consistency; results are validated (and retried once) 
    const callOnce = async (): Promise<JobNLP> => {
        const resp = await getOpenAIClient().responses.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        input: [
            {
            role: "system",
            content:
                "You are a structured information extractor for job postings. " +
                "Return ONLY valid JSON that matches the provided JSON Schema. " +
                "All fields must be present in the output object. If a value is missing or unknown, set it to null. Do not omit any keys or return undefined " +
                "Extract location from content which must be a human-readable geography (city + state/province + country if present)). " +
                "Currency must be the three-letter ISO 4217 code (e.g., USD, CAD, GBP)." 
            },
            { role: "user", content: "Full job text: " + plainText },
        ],
        text: {
            format: { type: "json_schema", name: "job_info", schema, strict: true },
        },
        });

    const raw = resp.output_text ?? "{}";
    const obj = JSON.parse(raw);
    const parsed = ZJobNLP.safeParse(obj);
    if (!parsed.success) throw new Error("validation failed");
    return parsed.data;
  };

   let aiData: JobNLP;
   let firstError: unknown; // Store the first error
    try {
        aiData = await callOnce();
    } catch (e) {
        firstError = e;
        try {
            aiData = await callOnce();
        } catch (e2) {
            console.error("LLM failed twice:", e, e2);
            throw new LLMAnalysisError("LLM analysis failed after 2 retries.", firstError, e2);
        }
    }

    // If the LLM didn’t give a location, try to pull a deterministic one from the adapter.
    aiData.location ??= pickLocationName(job); 

    // Merge features and aiData with a rule that deterministic values are priority if they're defined.
    const merged = mergePreferDeterministic(features, aiData);

    // compute salary_mid if min/max exists.
    // Type the merged object to match GHCanon interface
    const salaryFeatures: Partial<DBFeatures> & Partial<JobNLP> = merged;
    finalizeSalary(salaryFeatures); 

    return merged;
}