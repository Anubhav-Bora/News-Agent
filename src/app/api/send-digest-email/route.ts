import { NextResponse } from "next/server";
import { sendDigestWithPdfAndAudio, getUserEmailPreference } from "@/lib/agents/emailer";

export async function POST(req: Request) {
  try {
    console.log("📧 Send Digest Email request received");

    const body = await req.json();
    const { articles, pdfUrl, audioUrl, userId, recipientEmail, userName } = body;

    if (!articles || !Array.isArray(articles)) {
      return NextResponse.json(
        { error: "Missing or invalid articles array" },
        { status: 400 }
      );
    }

    if (!pdfUrl || !audioUrl) {
      return NextResponse.json(
        { error: "PDF URL and Audio URL are required" },
        { status: 400 }
      );
    }

    let email = recipientEmail;
    const name = userName || "User";

    if (!email && userId) {
      const prefResult = await getUserEmailPreference(userId);
      if (!prefResult.success) {
        console.error(`Failed to get email preference: ${prefResult.error?.message}`);
        return NextResponse.json(
          {
            error: prefResult.error?.type === 'NOT_FOUND' 
              ? "User email not found. Please set email preference first."
              : "Failed to retrieve email preference. Please try again.",
            errorType: prefResult.error?.type
          },
          { status: prefResult.error?.type === 'NOT_FOUND' ? 400 : 500 }
        );
      }
      email = prefResult.email;
    }

    if (!email) {
      return NextResponse.json(
        { error: "Recipient email is required" },
        { status: 400 }
      );
    }

    console.log(`🎯 Sending digest to ${email}`);

    const pdfFileName = `digest_${new Date().toISOString().split("T")[0]}.pdf`;
    const audioFileName = `digest_${new Date().toISOString().split("T")[0]}.mp3`;

    const success = await sendDigestWithPdfAndAudio(
      email,
      articles,
      name,
      pdfUrl,
      audioUrl,
      pdfFileName,
      audioFileName
    );

    if (!success) {
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Email sent successfully to ${email}`,
      email,
      attachments: {
        pdf: pdfFileName,
        audio: audioFileName,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    const errorStack = err instanceof Error ? err.stack : "";
    console.error("❌ Error sending digest email:", err);
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorStack,
      },
      { status: 500 }
    );
  }
}
