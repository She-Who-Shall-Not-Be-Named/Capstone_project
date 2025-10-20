// dev/testAdapter.ts

/**
 * INTEGRATION TEST
 * USAGE:
    ** ATS: npx tsx dev/testAdapter.ts <ATS>> <tenant> <jobid>
    ** WEB: npx tsx dev/testAdapter.ts web <url>
 */

import { adapters } from "../lib/scoring/adapters";

type AtsProvider = keyof typeof adapters;

// ---- WEB normalizer ----
import {
  htmlToPlainText as webHtmlToPlainText,
  extractWebFeaturesFromText,
  extractWebFeaturesFromJsonLd,
  mergeWebFeatures,
  type WebFeatures,
} from "../lib/normalizers/web";

// ---- GREENHOUSE normalizer ----
import {
  htmlToPlainText as ghHtmlToPlainText,
  extractGhFeaturesFromMetadata,
  extractSalaryFromText,
} from "../lib/normalizers/greenhouse";

function usageAndExit(): never {
  console.error(
    "Usage:\n" +
      "  greenhouse: tsx dev/testAdapter.ts greenhouse <tenant> <jobId>\n" +
      "  web:        tsx dev/testAdapter.ts web '<url>'"
  );
  process.exit(1);
}

async function main() {
  const [arg1, arg2, arg3] = process.argv.slice(2);
  if (!arg1) usageAndExit();

  let job: any;

  if (arg1 === "web") {
    const url = arg2;
    if (!url) usageAndExit();
    if (!adapters.web) throw new Error("Web adapter not registered");

    job = await adapters.web(url);

    const text = webHtmlToPlainText(job?.content ?? "");
    const textFeatures = extractWebFeaturesFromText(text) as WebFeatures;
    const jsonldFeatures = extractWebFeaturesFromJsonLd(job?.raw_json?.jsonld) as WebFeatures;

    const features = mergeWebFeatures(jsonldFeatures, textFeatures);
    console.log({ ...job, features });
    return;
  }

  // greenhouse
  if (arg1 === "greenhouse") {
    const tenant = arg2;
    const jobId = arg3;
    if (!tenant || !jobId) usageAndExit();
    if (!adapters.greenhouse) throw new Error("Greenhouse adapter not registered");

    job = await adapters.greenhouse(tenant, jobId);

    // run metadata + text extraction
    let features: Record<string, any> = {};

    const meta = extractGhFeaturesFromMetadata(job?.raw_json);
    if (meta && typeof meta === "object") {
      features = { ...features, ...meta };
    }

    const toText = (html: string) => ghHtmlToPlainText(html);
    const text = toText(job?.content ?? job?.raw_json?.content ?? "");
    extractSalaryFromText(text, features);

    console.log({ ...job, features });
    return;
  }

  // fallback: assume greenhouse <tenant> <jobId>
  {
    const tenant = arg1;
    const jobId = arg2;
    if (!tenant || !jobId) usageAndExit();
    if (!adapters.greenhouse) throw new Error("Greenhouse adapter not registered");

    job = await adapters.greenhouse(tenant, jobId);

    let features: Record<string, any> = {};
    const meta = extractGhFeaturesFromMetadata(job?.raw_json);
    if (meta && typeof meta === "object") {
      features = { ...features, ...meta };
    }
    const text = ghHtmlToPlainText(job?.content ?? job?.raw_json?.content ?? "");
    extractSalaryFromText(text, features);

    console.log({ ...job, features });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});