// dev/testScraper.ts

/*
 Usage:
   npx tsx dev/testScraper.ts "<url to try>"

 Notes:
  - DEPRECATED: 
  - DO NOT USE UNLESS CHANGES ARE MADE TO THE GUARDRAIL LOGIC IN SCRAPER/ROBOTS
  - Use testOrchestration.ts instead, but note to use it sparingly
  - Keep as legacy for now, however a version of scraper that does not ingest
    data will need to be created 
*/

// if using (see above), will need to change import path and possibly
// function name if changed
import { scrapeJobFromUrl } from "../lib/scoring/scraper";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: tsx dev/testScraper.ts <job-url>");
    process.exit(1);
  }

  try {
    const job = await scrapeJobFromUrl(url);
    console.log(JSON.stringify(job, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
