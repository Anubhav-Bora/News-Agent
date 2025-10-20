import { NextResponse } from "next/server";
import { generateAudio } from "@/lib/agents/audioGenerator";

export async function POST(req: Request) {
  const { text, lang } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  try {
    const mp3 = await generateAudio(text, lang || "en");
    return new NextResponse(Buffer.from(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="digest.mp3"',
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to generate audio";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
