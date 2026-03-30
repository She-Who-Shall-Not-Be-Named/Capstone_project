"use server";

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { analyzeJob } from '@/app/orchestrator/analyzeJob';


// The function that runs on the server and handles the database work
export async function saveJobCheck(jobUrl: string) {
    // 1. Get User
    const supabaseUserClient = await createClient(); 
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
        console.error("DEBUG: Authentication Failed. Session invalid or user not logged in.");
        return { success: false, error: "Authentication required." };
    }
    const userId = user.id;

    // 2. Create ADMIN CLIENT
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Call orchestrator to analyze job
    const result = await analyzeJob(jobUrl, userId, supabaseAdmin);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      jobId: result.jobId,
      score: result.score,
      features: result.features,
      nlpAnalysis: result.nlpAnalysis
    };
}