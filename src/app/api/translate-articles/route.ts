import { NextRequest, NextResponse } from "next/server";
import { translateArticles } from "@/lib/agents/languageTranslator";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { articles, targetLanguage } = await req.json();

    if (!articles || !Array.isArray(articles)) {
      return NextResponse.json(
        { error: "Invalid articles format" },
        { status: 400 }
      );
    }

    if (!targetLanguage) {
      return NextResponse.json(
        { error: "Target language is required" },
        { status: 400 }
      );
    }

    logger.info(`Translating ${articles.length} articles to ${targetLanguage}`);

    const translatedArticles = await translateArticles(articles, targetLanguage);

    return NextResponse.json(
      {
        success: true,
        articlesTranslated: translatedArticles.length,
        articles: translatedArticles,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Translation API error: ${errorMsg}`, error);

    return NextResponse.json(
      { error: `Translation failed: ${errorMsg}` },
      { status: 500 }
    );
  }
}
