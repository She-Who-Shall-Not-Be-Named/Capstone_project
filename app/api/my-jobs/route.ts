// app/api/my-jobs/route.ts

import { NextResponse } from "next/server";
import { getSavedJobsForCurrentUser, unsaveJobForCurrentUser, saveJobForCurrentUser } from "@/utils/supabase/action";

// fetch all jobs for user
export async function GET() {
  const result = await getSavedJobsForCurrentUser();

  if (!result.success) {
    const status = result.error === "Not authenticated" ? 401 : 500;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}


// save a job for current user
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const jobId = body?.jobId as string | undefined;

    if (!jobId) {
        return NextResponse.json(
        { success: false, error: "Missing jobId" },
        { status: 400 }
      );
    }

    const result = await saveJobForCurrentUser(jobId);

    if (!result.success) {
      const status = result.error === "Not authenticated" ? 401 : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
        console.error("[POST /api/my-jobs] error parsing request:", err);
        return NextResponse.json(
            { success: false, error: "Invalid request" },
            { status: 400 }
    );
  }
}


// unsave a job for the current user
export async function DELETE(req: Request) {
    let jobId: string | undefined;
  
    try {
        const body = await req.json();
        jobId = body?.jobId as string | undefined; 
    } 
    catch (err) {
        console.error("[DELETE /api/my-jobs] error parsing request:", err);     // Handle JSON parsing error
        return NextResponse.json(
            { success: false, error: "Invalid request body" },
            { status: 400 }
        );
    }

    if (!jobId) {
        return NextResponse.json(
        { success: false, error: "Missing jobId" },
        { status: 400 }
        );
    }

  const result = await unsaveJobForCurrentUser(jobId);

  if (!result.success) {
    const status = result.error === "Not authenticated" ? 401 : 500;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}