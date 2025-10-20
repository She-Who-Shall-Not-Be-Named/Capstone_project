// lib/db/jobFeatures.ts

// Upsert job features from NLP to the database 


// fields in jobFeatures table
export type dbJobFeatures = {
  time_type: string | null;
  salary_min: number | null;
  salary_mid: number | null;
  salary_max: number | null;
  currency: string | null;
  department: string | null;
  salary_source: "metadata" | "text" | "both" | null;
};

// return fields for database insertion 
export function insertJobFeatures(x: Partial<dbJobFeatures>) : dbJobFeatures
{
  return {
    time_type: x.time_type ?? null,
    salary_min: x.salary_min ?? null,
    salary_mid: x.salary_mid ?? null,
    salary_max: x.salary_max ?? null,
    currency: x.currency ?? null,
    department: x.department ?? null,
    salary_source: x.salary_source ?? null
  };
};

// only "update" or fill in fields that are not already defined, not defined vs null bc null changes the meaning 
export function updateJobFeatures(x: Partial<dbJobFeatures>): Partial<dbJobFeatures> {
  return Object.fromEntries(
    Object.entries(x).filter(([, v]) => v !== undefined)
  ) as Partial<dbJobFeatures>;
}




/*
// Strict insert: fill all unspecified fields with nulls.
// Use this only when you're creating a brand new row.//
//export const upsertJobFeatures = async (jobId: string, features: any) => {
  // call supabase 
  //insert corresponding fields into database 
// Writes to Supabase 
export async function upsertJobFeatures(jobId: string, features: Partial<dbJobFeatures>) {
  const supabase = await createClient();

  // check existence
  const { data: existing, error: selErr } = await supabase
    .from("job_features")
    .select("job_id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (selErr) return { error: selErr };

  if (!existing) {
    // INSERT
    const row = insertJobFeatures(features);
    const { data, error } = await supabase
      .from("job_features")
      .insert({ job_id: jobId, ...row })
      .select("*")
      .single();
    return error ? { error } : { success: true, data };
  }

  // 
  const updateSet = updateJobFeatures(features);
  if (!Object.keys(updateSet).length) return { success: true, data: existing };
  const { data, error } = await supabase
    .from("job_features")
    .update({ ...updateSet, updated_at: new Date().toISOString() })
    .eq("job_id", jobId)
    .select("*")
    .single();
  return error ? { error } : { success: true, data };
}
*/