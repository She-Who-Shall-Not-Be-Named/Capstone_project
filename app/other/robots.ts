/**
 * Minimal robots.txt fetcher + parser + evaluator.
 * Implements "longest-match wins" with Allow beating Disallow on ties (Google behavior).
 *
 * - No external deps (uses built-in fetch).
 * - Picks best User-agent group: exact match > "*" (wildcard).
 * - Default allow when no applicable rules match.
 */

export type RobotsGroup = {
  agents: string[];     // e.g., ["*", "googlebot"]
  allows: string[];     // path prefixes
  disallows: string[];  // path prefixes
  sitemaps: string[];   // optional, ignored for allow checks
};

export type RobotsProfile = {
  origin: string;       // "https://example.com"
  fetchedAt: string;    // ISO timestamp
  groups: RobotsGroup[];
  // The group used for UA (materialized at fetch/parse time)
  effective: { allows: string[]; disallows: string[] };
};

// ----------------------------------------------------------------------------
// Fetching (with timeout) + caching
// ----------------------------------------------------------------------------

const robotsCache = new Map<string, RobotsProfile>();

/**
 * Fetch a URL with a timeout (ms). Uses AbortController.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Normalize a scheme+host (no path). */
function originOf(u: URL): string {
  // Deliberately exclude port normalization edge cases; URL handles it.
  return `${u.protocol}//${u.host}`;
}

/** Normalize path prefixes: ensure they start with "/" and drop trailing whitespace. */
function normPathPrefix(raw: string): string {
  let s = raw.trim();
  if (!s) return "/"; // Treat blank "Allow:" as "/" (allow all)
  if (!s.startsWith("/")) s = "/" + s;
  return s;
}

/**
 * Choose the best-matching group for our user-agent:
 *  - exact UA (case-insensitive) wins
 *  - else wildcard "*"
 *  - else (no UA sections at all) -> empty fallback
 */
function pickAgentGroup(groups: RobotsGroup[], ua: string): RobotsGroup | null {
  const needle = ua.toLowerCase();

  // 1) exact match wins
  for (const g of groups) {
    if (g.agents.some(a => a.toLowerCase() === needle)) return g;
  }
  // 2) wildcard
  for (const g of groups) {
    if (g.agents.some(a => a.trim() === "*")) return g;
  }
  // 3) nothing applicable
  return null;
}

// ----------------------------------------------------------------------------
// Parser
// ----------------------------------------------------------------------------

/**
 * Parse robots.txt text into groups:
 * - Supports: User-agent, Allow, Disallow, Sitemap (case-insensitive)
 * - Ignores comments (# ...)
 * - Empty "Disallow:" means "no disallow added" (per classic behavior).
 * - Empty "Allow:" is treated as "/" (allow all) so it participates in matching.
 */
export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let cur: RobotsGroup | null = null;

  const lines = text.split(/\r?\n/);
  for (let rawLine of lines) {
    // Strip comments
    const hash = rawLine.indexOf("#");
    if (hash >= 0) rawLine = rawLine.slice(0, hash);
    const line = rawLine.trim();
    if (!line) continue;

    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;

    const key = m[1].toLowerCase();
    const val = m[2].trim();

    switch (key) {
      case "user-agent": {
        // Start a new group if none exists or if we already had one with UA lines
        if (!cur || cur.agents.length > 0) {
          cur = { agents: [], allows: [], disallows: [], sitemaps: [] };
          groups.push(cur);
        }
        if (val) cur.agents.push(val);
        break;
      }

      case "allow": {
        if (!cur) {
          // Spec allows Allow/Disallow before any UA; create implicit group
          cur = { agents: ["*"], allows: [], disallows: [], sitemaps: [] };
          groups.push(cur);
        }
        // Treat empty Allow as "/" so it can win over disallows (Google behavior)
        cur.allows.push(normPathPrefix(val || "/"));
        break;
      }

      case "disallow": {
        if (!cur) {
          cur = { agents: ["*"], allows: [], disallows: [], sitemaps: [] };
          groups.push(cur);
        }
        // Empty Disallow means "no disallow"; skip adding a rule
        if (val) cur.disallows.push(normPathPrefix(val));
        break;
      }

      case "sitemap": {
        if (!cur) {
          cur = { agents: ["*"], allows: [], disallows: [], sitemaps: [] };
          groups.push(cur);
        }
        if (val) cur.sitemaps.push(val);
        break;
      }

      default:
        // ignore unknown directives
        break;
    }
  }

  return groups;
}

// ----------------------------------------------------------------------------
// Policy evaluation
// ----------------------------------------------------------------------------

/**
 * Apply Google-style precedence:
 *  - Find the longest matching Allow and Disallow prefix.
 *  - If neither matches -> ALLOW (default).
 *  - If only one side matched -> that side wins.
 *  - If both matched and have equal length -> ALLOW wins.
 */
export function isAllowedByRobots(pageUrl: URL, profile: RobotsProfile): boolean {
  const path = pageUrl.pathname || "/";

  let longestAllow = -1;
  for (const a of profile.effective.allows) {
    if (path.startsWith(a) && a.length > longestAllow) longestAllow = a.length;
  }

  let longestDisallow = -1;
  for (const d of profile.effective.disallows) {
    if (path.startsWith(d) && d.length > longestDisallow) longestDisallow = d.length;
  }

  // No rules matched -> allow
  if (longestAllow < 0 && longestDisallow < 0) return true;

  // Longer match wins
  if (longestAllow > longestDisallow) return true;
  if (longestDisallow > longestAllow) return false;

  // Tie -> Allow wins
  return true;
}

/**
 * Convenience wrapper: returns true if robots ALLOW fetching this URL.
 * If robots.txt fetch fails (network, 404, etc.), default to ALLOW
 * (many crawlers default this way; adjust if fail-closed is preferred).
 */
export async function canFetchUrl(
  pageUrl: URL,
  opts: { userAgent?: string; timeoutMs?: number } = {}
): Promise<boolean> {
  const profile = await fetchRobots(pageUrl, opts);
  return isAllowedByRobots(pageUrl, profile);
}

// ----------------------------------------------------------------------------
// Fetch + build profile
// ----------------------------------------------------------------------------

/**
 * Fetch + parse robots.txt, pick an effective group for the given UA,
 * and cache the result by origin.
 */
export async function fetchRobots(
  pageUrl: URL,
  opts: { userAgent?: string; timeoutMs?: number } = {}
): Promise<RobotsProfile> {
  const ua = opts.userAgent ?? "jobbusters";
  const origin = originOf(pageUrl);

  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const robotsUrl = `${origin}/robots.txt`;
  let text = "";
  try {
    const res = await fetchWithTimeout(robotsUrl, {
      headers: {
        // Mildly realistic UA to avoid some naive blocks
        "User-Agent": `${ua} (+https://example.com)`,
        "Accept": "text/plain, */*;q=0.1",
      },
      timeoutMs: opts.timeoutMs ?? 8_000,
    });
    if (res.ok) {
      text = await res.text();
    } else {
      // Non-200: default to allow (empty profile)
      const profile: RobotsProfile = {
        origin,
        fetchedAt: new Date().toISOString(),
        groups: [],
        effective: { allows: [], disallows: [] },
      };
      robotsCache.set(origin, profile);
      return profile;
    }
  } catch {
    // Network/timeout errors: default to allow
    const profile: RobotsProfile = {
      origin,
      fetchedAt: new Date().toISOString(),
      groups: [],
      effective: { allows: [], disallows: [] },
    };
    robotsCache.set(origin, profile);
    return profile;
  }

  const groups = parseRobotsTxt(text);
  const chosen = pickAgentGroup(groups, ua);

  const effective =
    chosen != null
      ? { allows: chosen.allows.slice(), disallows: chosen.disallows.slice() }
      : { allows: [], disallows: [] };

  const profile: RobotsProfile = {
    origin,
    fetchedAt: new Date().toISOString(),
    groups,
    effective,
  };

  robotsCache.set(origin, profile);
  return profile;
}
