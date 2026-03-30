import { z } from "zod";
import type { AdapterJob } from "./types";
import { fetchWithRetry, sha1Hex } from "./util";
import { extractGhFeaturesFromMetadata, extractSalaryFromText, type GHCanon } from "@/lib/normalizers/greenhouse";

/** Some tenants put placeholder text in requisition_id. Normalize to null. */
const isPlaceholderReqId = (v?: string | null): boolean => {
  if (!v) return true;
  const s = v.trim().toLowerCase().replace(/[.:]+$/g, "");

  // Known placeholder patterns
  const placeholders = [
    "see opening id",
    "see job id",
    "see req id",
    "n/a",
    "na",
    "none",
    "null",
    "tbd",
    "not applicable"
  ];

  return placeholders.includes(s);
};

/** Zod schema for the GH payload (keep permissive). */
const ZGHCurrency = z
  .object({
    unit: z.string().optional(),
    amount: z.string(), // GH sends amounts as strings
  })
  .strict();

const ZGHMetadataItem = z
  .object({
    id: z.number().optional(),
    name: z.string().nullable().optional(),
    value: z.union([ZGHCurrency, z.string(), z.null(), z.array(z.any())]).optional(),
    value_type: z.string().nullable().optional(),
  })
  .catchall(z.unknown());

const ZGreenhouseJob = z
  .object({
    id: z.number(),
    title: z.string().default(""),
    company_name: z.string().default(""),
    absolute_url: z.string().url().optional(),
    first_published: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
    requisition_id: z.string().nullable().optional(),
    location: z.object({ name: z.string().default("") }).partial().optional(),
    content: z.string().nullable().optional(),
    // allow null here; some tenants send `metadata: null`
    metadata: z.array(ZGHMetadataItem).nullish().optional(),
  })
  .catchall(z.unknown());

export async function greenhouseAdapter(
  tenant_slug: string,
  external_job_id: string
): Promise<AdapterJob | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${tenant_slug}/jobs/${external_job_id}`;

  const started = new Date();
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": "jobbusters/0.1 (+https://example.com)",
        Accept: "application/json",
      },
    },
    {
      retries: 2,
      baseDelayMs: 300,
      timeoutMs: 12_000,
    }
  );
  const finished = new Date();

  if (!res.ok) return null;

  const payloadUnknown: unknown = await res.json();
  const parsed = ZGreenhouseJob.safeParse(payloadUnknown);

  // If parse fails, preserve raw_json, but be defensive pulling fields
  const p = parsed.success ? parsed.data : ({} as z.infer<typeof ZGreenhouseJob>);

  // Prefer parsed content; if that’s empty but raw payload has a string, use it.
  let contentHtml =
    typeof p.content === "string" ? p.content : "";

  type MaybeHasContent = { content?: unknown };

if (!contentHtml) {
  const maybe = payloadUnknown as MaybeHasContent;
  if (typeof maybe?.content === "string") {
    contentHtml = maybe.content;
  }
}
  const buf = Buffer.from(contentHtml ?? "", "utf8");

  const normalized: AdapterJob = {
    ats_provider: "greenhouse",
    tenant_slug,
    external_job_id: String(p.id ?? external_job_id),

    title: p.title ?? "",
    company_name: p.company_name ?? tenant_slug,
    location: p.location?.name ?? "",
    absolute_url:
      p.absolute_url ??
      `https://boards.greenhouse.io/${tenant_slug}/jobs/${external_job_id}`,

    first_published: p.first_published ?? p.updated_at ?? null,
    updated_at: p.updated_at ?? finished.toISOString(),

    requisition_id: isPlaceholderReqId(p.requisition_id) ? null : (p.requisition_id ?? null),

    content: contentHtml || null,

    raw_json: {
      ...(payloadUnknown as object),

      canonical_candidate: {
        ats: "greenhouse",
        tenant_slug,
        external_job_id: String(p.id ?? external_job_id),
        absolute_url:
          p.absolute_url ??
          `https://boards.greenhouse.io/${tenant_slug}/jobs/${external_job_id}`,
        provenance: "api",
      },

      fetch: {
        status: res.status,
        ok: res.ok,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        elapsed_ms: Math.max(0, finished.getTime() - started.getTime()),
      },

      content_metrics: {
        length_bytes: buf.byteLength,
        sha1: sha1Hex(buf),
      },

      _ingest: { needsnlp: true },
    },
  };

  // Extract features from Greenhouse metadata
  try {
    const extractedFeatures = extractGhFeaturesFromMetadata(p.metadata);
    
    // Mark all extracted features as coming from ATS metadata (highest priority)
    const featuresWithSource = { ...extractedFeatures };
    if (featuresWithSource.salary_source) {
      featuresWithSource.salary_source = "metadata"; // Override to indicate ATS metadata source
    }
    
    // If no salary found in metadata, try content extraction as fallback
    if (!featuresWithSource.salary_min && !featuresWithSource.salary_max && contentHtml) {
      try {
        const contentFeatures: GHCanon = {};
        extractSalaryFromText(contentHtml, contentFeatures);
        if (contentFeatures.salary_min || contentFeatures.salary_max) {
          // Merge content features, but mark as content source (lower priority)
          Object.assign(featuresWithSource, contentFeatures);
          featuresWithSource.salary_source = "content"; // Mark as ATS content source
        }
      } catch (contentErr) {
        console.warn("Failed to extract salary from content:", contentErr);
      }
    }
    
    normalized.features = featuresWithSource;
  } catch (err) {
    console.warn("Failed to extract Greenhouse features:", err);
    // Continue without features - NLP layer will handle fallback
  }

  return normalized;
}
