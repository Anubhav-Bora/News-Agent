import { NextResponse } from "next/server";
import { generateDigestPDF } from "@/lib/agents/pdfGenerator";
import { supabase } from "@/lib/supabaseClient";


export async function POST(req: Request) {
  try {
    console.log("📝 PDF Generation request received");

    const body = await req.json();
    console.log("📦 Request body:", {
      articlesCount: body.articles?.length,
      hasHistorical: !!body.historicalDigests,
    });

    let { articles, historicalDigests, userId } = body;

    if (!articles || !Array.isArray(articles)) {
      console.error("❌ Invalid articles:", articles);
      return NextResponse.json(
        { error: "Missing or invalid articles array" },
        { status: 400 }
      );
    }

    if (!userId) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (user?.id) {
          userId = user.id;
        }
      }

      if (!userId) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (session?.user?.id) {
          userId = session.user.id;
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for PDF storage" },
        { status: 400 }
      );
    }

    const historical = historicalDigests || {};

    console.log("🎬 Starting PDF generation...");
    const publicUrl = await generateDigestPDF(articles, historical, userId);
    console.log("✅ PDF generated and uploaded successfully:", publicUrl);

    return NextResponse.json({
      publicUrl: publicUrl,
      message: "PDF generated and stored in Supabase successfully",
    });
  } catch (err: any) {
    console.error("❌ Error in PDF generation:", err);
    console.error("Stack trace:", err.stack);

    return NextResponse.json(
      {
        error: err.message,
        details: err.stack,
      },
      { status: 500 }
    );
  }
}
