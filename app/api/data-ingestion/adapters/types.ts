export type AtsProvider = "greenhouse" | "web";

export type Provenance =
  | "api"      // fetched from a provider API
  | "jsonld"   // parsed from JSON-LD on a web page
  | "text_only"// parsed only from visible text/HTML
  | "mixed";   // combined/multiple sources

export type CanonicalCandidate = {
  ats: AtsProvider;
  tenant_slug: string;
  external_job_id: string;
  absolute_url: string;
  provenance: Provenance;
};

export type FetchMeta = {
  status: number;
  ok: boolean;
  started_at: string;  
  finished_at: string; 
  elapsed_ms: number;
};

export type ContentMetrics = {
  length_bytes: number;
  sha1: string;
};

/**
 * Raw JSON kept for provenance/debug/NLP.
 * Define known meta fields, allow arbitrary extras.
 */
export type AdapterRawJson = {
  /** Optional source tag to note the origin */
  source?: AtsProvider;

  /** Canonical candidate pointer for traceability */
  canonical_candidate?: CanonicalCandidate;

  /** HTTP fetch metadata for the adapter call */
  fetch?: FetchMeta;

  /** Size & hash of the content stored */
  content_metrics?: ContentMetrics;

  /** NLP ingestion flags, etc. */
  _ingest?: { needsnlp?: boolean };

  /** If present for web pages: the original JSON-LD block(s) */
  jsonld?: unknown;
} & Record<string, unknown>; // allow provider/site-specific fields

export type AdapterJob = {
  ats_provider: AtsProvider;
  tenant_slug: string;
  external_job_id: string;

  title: string;
  company_name: string;
  location: string;
  absolute_url: string;

  first_published: string | null; 
  updated_at: string;             

  requisition_id: string | null;

  /** Raw HTML (for web) or job content (for GH), or null if none */
  content: string | null;

  /** Provider/web-specific raw payload + standardized meta */
  raw_json: AdapterRawJson;

  /** Optional, normalized features extracted by normalizers */
  features?: Record<string, unknown>;
};

/** Concrete adapter function types */
export type GreenhouseAdapter = (
  tenant_slug: string,
  external_job_id: string
) => Promise<AdapterJob | null>;

export type WebAdapter = (url: string) => Promise<AdapterJob | null>;

/** Single “Adapter” union: */
export type Adapter = GreenhouseAdapter | WebAdapter;
