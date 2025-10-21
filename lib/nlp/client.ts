// lib/nlp/client.ts

// Take a unified AdapterJob (from any source: Greenhouse or generic web), extract reliable structured fields using deterministic rules first, 
// then LLM for the fuzzy stuff, and return a single merged object ready for DB insertion/scoring.

import OpenAI from "openai";
import { z } from "zod";
import type { AdapterJob } from "../adapters/types";
import { dbJobFeatures } from "../db/jobFeatures";
import { extractGhFeaturesFromMetadata, extractSalaryFromText, htmlToPlainText, finalizeSalary } from "../normalizers/greenhouse";

// ---- OpenAI client ----
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY missing. Put it in .env/.env.local.");
const client = new OpenAI({ apiKey });

// Types
type DBFeatures = dbJobFeatures;

// Contains all fields that are fuzzy to extract and that we don't mind the LLM touching 
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

function pickMetadata(job: AdapterJob): unknown {
  // Find the raw metadata value within the AdapterJob object.
  return (job as any)?.raw_json?.metadata ?? (job as any)?.metadata ?? null;
}

export function pickContent(job: AdapterJob): string {
  // Retrieves the job.content string for raw content
  return typeof job?.content === "string" ? job.content : "";
}

function pickLocationName(job: AdapterJob): string | null {
  if (typeof job?.location === "string" && job.location) return job.location;
  const name = (job as any)?.raw_json?.location?.name; // use any bc AdapterRawJson type cannot list every possible variable name a vendor might use
  return typeof name === "string" && name ? name : null;
}

// ensures the deterministic value always overrides the LLM value if it exists (v !== undefined && v !== null).
function mergePreferDeterministic<T extends object, U extends object>(det: T, ai: U): T & U {
  const out: any = { ...ai };
  for (const [k, v] of Object.entries(det)) {
    if (v !== undefined && v !== null) out[k] = v; // deterministic wins if defined
  }
  return out;
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
    // 1) Start with deterministic features (from GH metadata only if GH)
    // If this job came from Greenhouse, try to pull the structured fields from their metadata array.
    let features: Partial<DBFeatures> = {};
    
    if (job.ats_provider === "greenhouse") {
        try {
        features = extractGhFeaturesFromMetadata(pickMetadata(job));
        } catch(err) {
            console.warn("Failed to extract Greenhouse metadata:", err);
            features = {};
        }
    }

    // 2) Convert the adapter’s HTML/content into plain text.
    const rawText = htmlToPlainText(pickContent(job));
    const plainText = rawText.slice(0, 20_000);

    const f2 = { ...features }; //shallow copy to keep top features 
    //If there’s enough text, run heuristics to find salary ranges and set salary_min/max
    extractSalaryFromText(plainText, f2);

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
        delete f2.salary_source;
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
        const resp = await client.responses.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        input: [
            {
            role: "system",
            content:
                "You are a structured information extractor for job postings. " +
                "Return ONLY valid JSON that matches the provided JSON Schema. " +
                "If a value is not explicitly stated, return null. Never invent values. " +
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
            const combinedError = new Error("LLM analysis failed after 2 retries.");
            (combinedError as any).firstAttemptError = firstError;
            (combinedError as any).secondAttemptError = e2;
            throw combinedError; 
        }
    }

    // If the LLM didn’t give a location, try to pull a deterministic one from the adapter.
    aiData.location ??= pickLocationName(job); 

    // Merge features and aiData with a rule that deterministic values are priority if they’re defined.
    const merged = mergePreferDeterministic(features, aiData);

    // compute salary_mid if we have min/max.
    finalizeSalary(merged as any); 

    return merged;
}