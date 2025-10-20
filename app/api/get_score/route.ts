import { NextResponse } from "next/server";
import { safe } from "@/lib/scoring/safe";
import {
  getUser,
  request_lock_and_tokens,
  set_request_lock,
  release_request_lock,
} from "@/utils/supabase/action";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let userId: string | null = null;
  let lockHeld = false;

  try {
    // get user
    const user = await getUser();
    if ("error" in user || !user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    // check lock + tokens
    const lockInit = await safe(() => request_lock_and_tokens(userId!));
    if (!lockInit.success)
      return NextResponse.json({ error: "Lock failed" }, { status: 500 });

    const { is_available, tokens } = lockInit.data;
    if (tokens <= 0)
      return NextResponse.json({ error: "Out of tokens" }, { status: 429 });
    if (!is_available)
      return NextResponse.json(
        { error: "Already processing" },
        { status: 409 }
      );

    // set lock
    const gotLock = await set_request_lock(userId!);
    if (!gotLock)
      return NextResponse.json(
        { error: "Already processing" },
        { status: 409 }
      );
    lockHeld = true;

    // ---------------------- MAIN DATA LOGIC ----------------------
    

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  } finally {
    // release lock
    if (lockHeld && userId) {
      const rel = await safe(() => release_request_lock(userId!));
      if (!rel.success) console.error("[lock release error]", rel.error);
    }
  }
}
