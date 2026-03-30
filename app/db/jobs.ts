import type { AdapterJob } from "@/app/api/data-ingestion/adapters/types";
import {
  insertIntoJobTable,
  InsertToJobUpdatesTable,
  InsertIntoUserJobCheckTable,
  InsertStructuredJobFeatures,
} from "@/utils/supabase/action";
import type { SupabaseClient } from '@supabase/supabase-js';


type IngestResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

export async function ingestUserJobPosting(
  supabase: SupabaseClient, 
  jobDetails: AdapterJob, 
  user_id: string
): Promise<IngestResult> {
  "use server";
  try {
    const jobId = await insertIntoJobTable(supabase, jobDetails);
    if (!jobId) return { success: false, error: "Failed to establish job ID." };

    await InsertToJobUpdatesTable(supabase, jobId, jobDetails);
    await InsertStructuredJobFeatures(supabase, jobId, jobDetails);
    
    const linked = await InsertIntoUserJobCheckTable(supabase, user_id, jobId, jobDetails.updated_at);
    if (!linked) return { success: false, error: "Failed to link user to job." };

    return { success: true, jobId };
  } catch (e: any) {
    console.error(e);
    return { success: false, error: `Unexpected error during ingestion: ${e.message}` };
  }
}