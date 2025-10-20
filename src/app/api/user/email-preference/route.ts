import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export async function GET(req: Request) {
  try {
    const userId = req.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_preferences")
      .select("email_preference")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch email preference" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      email: data?.email_preference || null,
      found: !!data,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    console.error("Error fetching email preference:", err);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = req.headers.get("x-user-id");
    const body = await req.json();
    const { email } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("user_preferences")
      .select("id")
      .eq("user_id", userId)
      .single();

    let result;
    if (existing?.id) {
      result = await supabaseAdmin
        .from("user_preferences")
        .update({ email_preference: email, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    } else {
      result = await supabaseAdmin
        .from("user_preferences")
        .insert({
          user_id: userId,
          email_preference: email,
          created_at: new Date().toISOString(),
        });
    }

    if (result.error) {
      console.error("Database error:", result.error);
      return NextResponse.json(
        { error: "Failed to save email preference" },
        { status: 500 }
      );
    }

    console.log(`✅ Email preference saved for user ${userId}`);
    return NextResponse.json({
      success: true,
      message: "Email preference saved",
      email,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    console.error("Error saving email preference:", err);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
