// lib/adapters.ts
// lib/adapters.ts
/**

type GreenhouseFn = (tenant_slug: string, external_job_id: string) => Promise<any>;
type WebFn = (url: string) => Promise<any>;

export type AdaptersRegistry = {
  greenhouse?: GreenhouseFn;
  web?: WebFn;
};

export const adapters: AdaptersRegistry = {
  greenhouse: greenhouseAdapter,
  web: webAdapter,
};

export { greenhouseAdapter, webAdapter };
*/

import { greenhouseAdapter } from "../adapters/greenhouse";
import { webAdapter } from "../adapters/web";
import type { AdapterJob } from "../adapters/types";

type GreenhouseFn = (tenant_slug: string, external_job_id: string) => Promise<AdapterJob | null>;
type WebFn = (url: string) => Promise<AdapterJob | null>;

export type AdaptersRegistry = {
  greenhouse?: GreenhouseFn;
  web?: WebFn;
};

export const adapters: AdaptersRegistry = {
  greenhouse: greenhouseAdapter,
  web: webAdapter,
};

export { greenhouseAdapter, webAdapter };

/** Public: single entry point for “I have a link, fetch me the job.” */
export async function fetchJobFromUrl(rawUrl: string): Promise<AdapterJob | null> {
  const url = canonicalize(rawUrl);
  const gh = detectGreenhouseFromUrl(url);

  if (gh && adapters.greenhouse) {
    return adapters.greenhouse(gh.tenant_slug, gh.external_job_id);
  }
  if (adapters.web) {
    return adapters.web(url);
  }
  return null;
}

/** --- helpers --- */

function canonicalize(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    // Drop tracking noise
    u.searchParams.delete("gh_src");
    for (const k of Array.from(u.searchParams.keys())) {
      if (k.toLowerCase().startsWith("utm_")) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Detect Greenhouse URLs and extract (tenant_slug, external_job_id).
 * Supports:
 *  - https://boards.greenhouse.io/<tenant>/jobs/<id>
 *  - https://job-boards.greenhouse.io/<tenant>/jobs/<id>
 *  - https://boards.greenhouse.io/embed/job_app?for=<tenant>&token=<id>
 */
function detectGreenhouseFromUrl(input: string):
  | { tenant_slug: string; external_job_id: string }
  | null {
  let u: URL;
  try { u = new URL(input); } catch { return null; }

  const host = u.hostname.toLowerCase();

  const isGH =
    host === "boards.greenhouse.io" ||
    host === "job-boards.greenhouse.io" ||
    host.endsWith(".greenhouse.io");

  if (!isGH) return null;

  // /<tenant>/jobs/<id>
  const path = u.pathname.replace(/\/+$/,"");
  const m = path.match(/^\/([^/]+)\/jobs\/(\d+)$/);
  if (m) {
    return { tenant_slug: m[1], external_job_id: m[2] };
  }

  // /embed/job_app?for=<tenant>&token=<id>
  if (path === "/embed/job_app") {
    const tenant = u.searchParams.get("for") || "";
    const token = u.searchParams.get("token") || "";
    if (tenant && token) {
      return { tenant_slug: tenant, external_job_id: token };
    }
  }

  // Sometimes you’ll see /jobs/<id>?for=<tenant>
  const m2 = path.match(/^\/jobs\/(\d+)$/);
  if (m2) {
    const tenant = u.searchParams.get("for") || "";
    if (tenant) return { tenant_slug: tenant, external_job_id: m2[1] };
  }

  return null;
}
