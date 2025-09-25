import { NextResponse } from "next/server";
import { collectDailyDigest } from "@/lib/agents/collector";

export async function GET() {
  try {
    const digest = await collectDailyDigest();
    return NextResponse.json(digest);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
