import { NextResponse } from "next/server";
import { updateInterestProfile } from "@/lib/agents/interestTracker";

export async function POST(req: Request) {
  try {
    const { userId, topic } = await req.json();

    if (!userId || !topic) {
      return NextResponse.json({ error: "Missing userId or topic" }, { status: 400 });
    }

    const updated = await updateInterestProfile(userId, topic);

    return NextResponse.json({
      message: "Interest profile updated successfully",
      updatedInterests: updated
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to update interest profile";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
