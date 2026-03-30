// app/api/user/route.ts


import { NextResponse } from "next/server";
import { getUser } from "@/utils/supabase/action"; 


type SupabaseUser = {
    id: string;
    email: string | null;
    user_metadata?: { [key: string]: any };
};

// expected return type of getUser()
type GetUserResult = SupabaseUser | { error: string };


export async function GET() {

  const user_object = (await getUser()) as GetUserResult;

  // error check
    if ("error" in user_object || !user_object) {
        return NextResponse.json(
        { success: false, error: user_object?.error || "Not authenticated" }, 
        { status: 401 }
        );
    }

  // extract the data needed for the client
    const fullNameFromMeta =
        (user_object.user_metadata?.full_name as string | undefined) ??
        (user_object.user_metadata?.name as string | undefined) ??
        null;

    return NextResponse.json({
        success: true,
        user: {
        id: user_object.id,
        email: user_object.email,
      fullName: fullNameFromMeta,
    },
  });
}