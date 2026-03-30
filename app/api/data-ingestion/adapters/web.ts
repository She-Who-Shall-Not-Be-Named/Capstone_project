import { z } from "zod";
import type { AdapterJob } from "./types";
import { fetchWithRetry, sha1Hex } from "./util";
import { extractWebFeaturesFromJsonLd, extractWebFeaturesFromText } from "@/lib/normalizers/web";

/** Tiny helper to decode a few common HTML entities in <script> contents. */
function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Extract all <script type="application/ld+json">...</script> blocks. */
function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? "").trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

/** Best-effort JSON parse with very light cleanup. Returns undefined if it can’t parse. */
function safeParseJsonLd(s: string): unknown | undefined {
  try {
    // Some sites HTML-escape the JSON text inside the script tag.
    const de = decodeBasicEntities(s.trim());
    return JSON.parse(de);
  } catch {
    return undefined;
  }
}

/** Zod: Don’t assume a specific JSON-LD shape; just ensure it’s JSON. */
const ZJsonLdAny = z.unknown();

/** Narrow provenance to the allowed union used elsewhere. */
type Provenance = "jsonld" | "api" | "text_only" | "mixed";

export async function webAdapter(url: string): Promise<AdapterJob | null> {
  // Validate URL early (throws if invalid)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const started = new Date();
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": "jobbusters/0.1 (+https://example.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

  const html = await res.text();
  const htmlBuf = Buffer.from(html ?? "", "utf8");

  // ---- JSON-LD discovery ----
  const ldScriptBlocks = extractJsonLdBlocks(html);
  const parsedBlocks = ldScriptBlocks
    .map(safeParseJsonLd)
    .filter((v): v is unknown => v !== undefined);

  // Flatten simple arrays like: <script>[{..},{..}]</script>
  // but otherwise keep as “mixed bag of unknowns”
  const jsonld: unknown[] = [];
  for (const blk of parsedBlocks) {
    if (Array.isArray(blk)) {
      for (const item of blk) jsonld.push(item);
    } else {
      jsonld.push(blk);
    }
  }

  // Validate the parsed JSON-LD array elements (keep them as unknown, but validated JSON)
  const validatedJsonLd: unknown[] = [];
  for (const item of jsonld) {
    const v = ZJsonLdAny.safeParse(item);
    if (v.success) validatedJsonLd.push(v.data);
  }

  // Decide provenance from what was actually found
  const provenance: Provenance =
    validatedJsonLd.length > 0 ? "jsonld" : "text_only";

  // Build the normalized job
  const normalized: AdapterJob = {
    ats_provider: "web",
    tenant_slug: parsedUrl.hostname, // e.g., "boards.greenhouse.io" or site host
    external_job_id: sha1Hex(Buffer.from(url, "utf8")),

    // Don’t parse title/company/location here; leave that to the normalizer/web step
    title: "",
    company_name: parsedUrl.hostname,
    location: "",
    absolute_url: url,

    first_published: null,
    updated_at: finished.toISOString(),

    requisition_id: null,

    // Keep the raw HTML so the normalizer can extract text & features
    content: html || null,

    raw_json: {
      jsonld: validatedJsonLd,

      canonical_candidate: {
        ats: "web",
        tenant_slug: parsedUrl.hostname,
        external_job_id: sha1Hex(Buffer.from(url, "utf8")),
        absolute_url: url,
        provenance,
      },

      fetch: {
        status: res.status,
        ok: res.ok,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        elapsed_ms: Math.max(0, finished.getTime() - started.getTime()),
      },

      content_metrics: {
        length_bytes: htmlBuf.byteLength,
        sha1: sha1Hex(htmlBuf),
      },

      _ingest: { needsnlp: true },
    },
  };

  // Extract features from web content with priority-based override logic
  try {
    // 1. Try JSON-LD extraction first (highest priority for web)
    const jsonldFeatures = extractWebFeaturesFromJsonLd(html);
    const featuresWithSource = { ...jsonldFeatures };
    
    // Mark JSON-LD features with highest priority
    if (featuresWithSource.salary_source) {
      featuresWithSource.salary_source = "jsonld";
    }
    
    // 2. If no salary found in JSON-LD, try text extraction as fallback
    if (!featuresWithSource.salary_min && !featuresWithSource.salary_max) {
      const textFeatures = extractWebFeaturesFromText(html);
      if (textFeatures.salary_min || textFeatures.salary_max) {
        // Merge text features, but mark as text source (lower priority)
        Object.assign(featuresWithSource, textFeatures);
        featuresWithSource.salary_source = "text"; // Mark as text source
      }
    }
    
    normalized.features = featuresWithSource;
  } catch (err) {
    console.warn("Failed to extract web features:", err);
    // Continue without features - NLP layer will handle fallback
  }

  return normalized;
}

export default webAdapter;
