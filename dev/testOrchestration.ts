// dev/testOrchestration.ts

/*
 Orchestrates end-to-end checks for the scraper pipeline:
  - Denylist enforcement (e.g., LinkedIn)
  - robots.txt block handling (e.g., Dropbox listings)
  - Normal success path on a plain job page (JSON-LD and/or text parsing)

 Usage:
   npx tsx dev/testOrchestration.ts
   npx tsx dev/testOrchestration.ts "<url to try>"

 Notes:
  - These tests do real network requests. Run sparingly.
  - Outcomes are checked by substrings in error messages to keep it simple.
*/


import scrapeJobFromUrl from "../lib/scoring/scraper";

type Expected =
  | "denylist"
  | "robots-block"
  | "success";

type Case = {
  name: string;
  url: string;
  expect: Expected;
};

// --- Small assert helpers ---
function ok(cond: any, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function has(obj: unknown, key: string) {
  return obj && typeof obj === "object" && key in (obj as any);
}

function looksLikeFeatures(x: unknown) {
  // Very loose: only check it’s an object and may have a salary_* or currency/comp_period
  if (!x || typeof x !== "object") return false;
  const o = x as any;
  return (
    "salary_min" in o ||
    "salary_mid" in o ||
    "salary_max" in o ||
    "currency" in o ||
    "comp_period" in o
  );
}

// --- Test runner ---
async function runCase(c: Case) {
  process.stdout.write(`\nCase: ${c.name}\nURL: ${c.url}\n`);
  try {
    const result = await scrapeJobFromUrl(c.url);

    if (c.expect === "success") {
      ok(looksLikeFeatures(result), "expected features-like object on success");
      console.log("PASS (success)");
      console.dir(result, { depth: 2 });
      return;
    }

    // If failure is expected but got here, that’s a fail
    console.error("FAIL (expected an error, got success)");
    console.dir(result, { depth: 2 });
  } catch (err) {
    const msg = (err as Error).message || String(err);

    if (c.expect === "denylist") {
      ok(
        /aggregator\/marketing page|paste the direct job link/i.test(msg),
        `expected denylist message, got: ${msg}`
      );
      console.log("PASS (denylist blocked)");
      return;
    }

    if (c.expect === "robots-block") {
      ok(/robots\.txt/i.test(msg), `expected robots block message, got: ${msg}`);
      console.log("PASS (robots block)");
      return;
    }

    // Expected success but errored
    console.error("FAIL (unexpected error on success case)");
    console.error(msg);
  }
}

async function main() {
  const cliUrl = process.argv.slice(2).join(" ").trim();

  if (cliUrl) {
    // Smoke test a single URL (no expected outcome enforced)
    // E.g., code to run as npx tsx dev/testOrchestration.ts "<url to try>"
    console.log("Single URL mode\n");
    try {
      const res = await scrapeJobFromUrl(cliUrl);
      console.log("Success");
      console.dir(res, { depth: 2 });
    } catch (err) {
      console.error("Error");
      console.error((err as Error).message || String(err));
      process.exitCode = 1;
    }
    return;
  }

  // Batch mode with a few representative scenarios.
  // Feel free to swap these for different cases/sites.
  // E.g., npx tsx dev/testOrchestration.ts usage
  const cases: Case[] = [
    {
      name: "Denylist: LinkedIn collection",
      url: "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4288352532",
      expect: "denylist",
    },
    {
      name: "robots block: Dropbox job listing",
      url: "https://jobs.dropbox.com/listing/717796",
      expect: "robots-block",
    },
    {
      name: "Success: Disney careers job page (JSON-LD or text)",
      url: "https://www.disneycareers.com/en/job/new-york/executive-assistant/391/86974045840",
      expect: "success",
    },
  ];

  for (const c of cases) {
    await runCase(c);
  }

  console.log("\nDone.\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
