// lib/scraper.ts
import type { AdapterJob } from "../lib/adapters/types";
import { greenhouseAdapter } from "../lib/adapters/greenhouse";
import {
  extractWebFeaturesFromJsonLd,
  extractWebFeaturesFromText,
} from "../lib/normalizers/web";
import { canFetchUrl } from "./robots";

/**
 * Strict denylist for aggregator/marketing boards; add as needed
 */
const DENYLIST_HOSTS = new Set<string>([
  "indeed.com",
  "www.indeed.com",
  "ziprecruiter.com",
  "www.ziprecruiter.com",
  "glassdoor.com",
  "www.glassdoor.com",
  "linkedin.com",
  "www.linkedin.com",
  "monster.com",
  "www.monster.com",
  "careerbuilder.com",
  "www.careerbuilder.com",
]);

/** Normalize to lowercase host (strip a trailing dot if any). */
function hostOf(u: URL): string {
  return u.hostname.toLowerCase().replace(/\.$/, "");
}

/**
 * Quick host-level deny check (MVP).
 * Denies if the hostname or any parent domain matches a denylisted host
 * (e.g., m.linkedin.com → linkedin.com).
 */
function isDeniedHost(u: URL): boolean {
  const h = hostOf(u);
  if (DENYLIST_HOSTS.has(h)) return true;

  for (const bad of DENYLIST_HOSTS) {
    if (h === bad) return true;
    if (h.endsWith("." + bad)) return true;
  }
  return false;
}

/** True if this URL is clearly a Greenhouse boards URL. */
function isGreenhouseBoards(url: URL): boolean {
  const h = hostOf(url);
  return (
    h === "boards.greenhouse.io" ||
    h.endsWith(".boards.greenhouse.io") ||
    h === "job-boards.greenhouse.io" ||
    h.endsWith(".job-boards.greenhouse.io")
  );
}

/**
 * Parse tenant + job ID from common Greenhouse board URL forms:
 *   - /{tenant}/jobs/{jobId}
 *   - /{tenant}/jobs/{jobId}/... (extra segments ok)
 * Returns null if not matched.
 */
function parseGreenhouseTenantAndJob(url: URL): { tenant: string; jobId: string } | null {
  // Examples:
  //   https://boards.greenhouse.io/stripe/jobs/7233420
  //   https://job-boards.greenhouse.io/doordashusa/jobs/7315613#app
  const m = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)(?:\/|$)/);
  if (!m) return null;
  return { tenant: m[1], jobId: m[2] };
}

/**
 * The orchestrator:
 * 1) Parse URL
 * 2) Denylist host check
 * 3) robots.txt compliance
 * 4) Detect + delegate to Greenhouse adapter when applicable
 * 5) Otherwise, single fetch + generic web extraction (JSON-LD + text)
 */
export async function scrapeJobFromUrl(
  urlStr: string
): Promise<AdapterJob | Record<string, unknown> | null> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error(`Invalid URL: ${urlStr}`);
  }

  const host = hostOf(url);

  // 1) denylist
  if (isDeniedHost(url)) {
    throw new Error(
      "This site is a job aggregator/marketing page we don't fetch directly. " +
        "For best results, click “Apply” on that site and paste the direct job link here. " +
        "Note that the direct job links may still be within the job aggregator/marketing page's domain, and thus will not be fetched. "
    );
  }

  // 2) robots
  const allowed = await canFetchUrl(url);
  if (!allowed) {
    throw new Error(
      `robots.txt for ${host} disallows fetching this path. ` +
        `If the job has an “Apply” button, open it and paste the direct job link instead.`
    );
  }

  // 3) ATS delegation — Greenhouse
  //    Only when the URL is a GH boards URL we can parse for tenant + job ID.
  if (isGreenhouseBoards(url)) {
    const parsed = parseGreenhouseTenantAndJob(url);
    if (parsed) {
      const { tenant, jobId } = parsed;
      console.log(`Using Greenhouse adapter for tenant=${tenant}, jobId=${jobId}`);
      return await greenhouseAdapter(tenant, jobId);
    }
    // If it's a GH host but not a parsable path, fall through to generic fetch.
  }

  // 4) Generic one-shot fetch + web adapter extraction
  let html: string;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; JobBustersBot/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
    html = await res.text();
  } catch (err) {
    throw new Error(`Fetch failed (${(err as Error).message})`);
  }

  // Prefer structured data, then fill from text.
  const jsonldFeatures = extractWebFeaturesFromJsonLd(html);
  const textFeatures = extractWebFeaturesFromText(html);
  const features = { ...textFeatures, ...jsonldFeatures };

  return features;
}

export default scrapeJobFromUrl;
