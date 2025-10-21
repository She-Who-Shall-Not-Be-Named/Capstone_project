// lib/db/jobFeatures.ts

// Upsert job features to the database 


// fields in jobFeatures table
export type dbJobFeatures = {
  //job_id: string; // commented out until persistance layer 
  time_type: string | null;
  salary_min: number | null;
  salary_mid: number | null;
  salary_max: number | null;
  currency: string | null;
  department: string | null;
  salary_source: "metadata" | "text"  | null;
};

