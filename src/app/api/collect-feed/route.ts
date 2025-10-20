import { NextResponse } from "next/server";
import { collectDailyDigest } from "@/lib/agents/collector";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || "all";
    const language = url.searchParams.get("language") || "en";

    const digest = await collectDailyDigest(topic, language);

    return NextResponse.json(digest, { status: 200 });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to collect news digest";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
