// dev/testNLP.ts

// nlp.ts
// Wrapper function that calls both database fields and extra fields for backend scoring logic 
// input -  url 
//output - json of combined data


 // lib/scoring/nlp.ts
/** 
import { scrapeJobFromUrl } from '../scoring/scraper';
import { analyzeAdapterJob, Combined, pickContent, JobNLP } from "../nlp/client"; // Assumed pickContent and JobNLP are imported/available
import { htmlToPlainText } from "../normalizers/greenhouse";
import { dbJobFeatures } from "../db/jobFeatures"; 
import { analysis, analysisWithLLM } from "../nlp/index"; 
import type { AdapterJob } from "../adapters/types"; 
// Note: Assuming `pickContent` is either exported from client.ts or imported directly
// If not, you must import the pickContent helper from client.ts or a shared helpers file.

export type scoringTypes = {
    featuresNormalized: Partial<Combined>; 
    analysis: analysis;                     
};


const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);


export async function scoreItems(
  url: string,
): Promise<scoringTypes> {

    const job = await scrapeJobFromUrl(url);
    if (!job) throw new Error("Failed to fetch/dispatch adapter for URL.");

    // The scraper's return type is loose, so we cast it to the expected AdapterJob type.
    const jobData = job as AdapterJob;
        
    
    // 1) DB-ish fields (Contains deterministic + LLM results)
    const features: Combined = await analyzeAdapterJob(jobData);
       
    if (!features) {
        throw new Error("Failed to extract features (analyzeAdapterJob returned null).");
    }

    // 2) Use the robust content retrieval helper from client.ts
    const html = pickContent(jobData); // Use the robust helper and jobData object
    const plainText = htmlToPlainText(html).slice(0, 20_000);

    // 3) Scoring-only analysis (one extra LLM call)
    const analysis = await analysisWithLLM({
        text: plainText,
        metadata: {
        time_type: features.time_type ?? null,
        currency: (features.currency ?? null) as string | null,
        },
    });

    // --- 4) Normalizes DB-ish into a patch (with salary corrections) ---
    
    let min = features.salary_min;
    let mid = features.salary_mid;
    let max = features.salary_max;
    
    // CORRECTION: Calculate Max if Min and Midpoint are known (as was the case with the DoorDash job)
    if (isNum(min) && isNum(mid) && !isNum(max)) {
        // If Midpoint D = (Max + Min) / 2, then Max = 2D - Min
        max = (2 * mid) - min;
    }

    const featuresNormalized: Partial<Combined> = {
        time_type: features.time_type ?? null,
        salary_min: min ?? null,
        salary_mid: mid ?? null,
        salary_max: max ?? null,
        currency: (features.currency ?? null)?.toUpperCase()?.slice(0, 3) ?? null,
        
        // NOTE: These fields must be part of dbJobFeatures or JobNLP for this to be valid access.
        // Assuming they are part of dbJobFeatures (via Combined type).
        department: (features as any).department ?? null, 
        salary_source: (features as any).salary_source ?? null,
    };

    return {
        featuresNormalized,
        analysis,
  };
}

export default scoreItems;

*/

/** 

import { scoreItems } from "../lib/scoring/nlp";

(async () => {
  try{
  const data = await scoreItems(
   //"https://jobs.nyulangone.org/job/22543655/ultrasound-technician-fgp-brooklyn-brooklyn-ny/?utm_campaign=google_jobs_apply&utm_source=google_jobs_apply&utm_medium=organic"
    //"https://www.disneycareers.com/en/job/lake-buena-vista/senior-manager-electric-operations/391/87376529808"
   // "https://explore.jobs.netflix.net/careers?pid=790304901333&domain=netflix.com&sort_by=relevance"
     "https://job-boards.greenhouse.io/doordashusa/jobs/7258239"
    //"https://job-boards.greenhouse.io/havenly/jobs/8217150002?gh_src=my.greenhouse.search"
  );

  if (!data) {
    console.log("not fetched :(");
    return;
  }

  console.log("Combined features:");
  console.dir(data, { depth: null });

  // upsert `data` into job_features here
} catch (error) {
    console.error("Test failed to score item.");
    console.error(error);
  }
})();
*/


// dev/testNLP.ts (FIXED)

import { analyzeAndScoreJob } from "../lib/scoring/nlp"; // 1. Use the new function
import { scrapeJobFromUrl } from "../lib/scoring/scraper"; // 2. Need the scraper
import type { AdapterJob } from "../lib/adapters/types";

(async () => {
  const url = "https://job-boards.greenhouse.io/doordashusa/jobs/7258239";
  
  try {
    // 1. Fetch the job data using the scraper
    const job = await scrapeJobFromUrl(url);

    if (!job) {
      console.log("Job not fetched by scraper.");
      return;
    }

    // 2. Pass the fetched AdapterJob object to the new analysis function
    //    We cast it to AdapterJob as the scraper's type may be loose.
    const data = await analyzeAndScoreJob(job as AdapterJob);

    if (!data) {
      console.log("Analysis returned null.");
      return;
    }

    console.log("Combined features:");
    console.dir(data, { depth: null });

  } catch (error) {
    console.error("Test failed to score item.");
    console.error(error);
  }
})();