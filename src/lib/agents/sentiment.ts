import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  reasoning: string;
}

export interface ArticleWithSentiment {
  title: string;
  link: string | null;
  summary: string;
  source: string | null;
  pubDate: string | null;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  topic: string;
}

// Single sentiment analysis (used as fallback)
export async function analyzeSentiment(text: string): Promise<SentimentResult> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.1,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const promptTemplate = ChatPromptTemplate.fromTemplate(
    `Analyze the sentiment of the following news article and respond with ONLY a JSON object (no markdown):

Article Text:
"{text}"

Respond with this exact JSON format:
{{"sentiment": "positive"|"negative"|"neutral", "score": 0.0-1.0, "reasoning": "brief 1-2 sentence explanation"}}

Consider:
- Positive: optimistic, beneficial, improvements, growth, success
- Negative: concerning, harmful, decline, crisis, losses
- Neutral: factual, balanced, informative without strong sentiment

Return ONLY the JSON object, nothing else.`
  );

  const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

  const response = await chain.invoke({ text });

  const cleanedResponse = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsed: SentimentResult;
  try {
    parsed = JSON.parse(cleanedResponse);
  } catch {
    console.error("Failed to parse sentiment for text:", text.substring(0, 50));
    return {
      sentiment: "neutral",
      score: 0.5,
      reasoning: "Analysis failed, defaulting to neutral"
    };
  }

  return {
    sentiment: (["positive", "negative", "neutral"].includes(parsed.sentiment)
      ? parsed.sentiment
      : "neutral") as "positive" | "negative" | "neutral",
    score: Math.min(1, Math.max(0, parsed.score || 0.5)),
    reasoning: parsed.reasoning || "Sentiment analyzed successfully"
  };
}

// Batch sentiment analysis optimized for multiple articles
export async function analyzeSentimentsBatch(
  articles: Array<{ title: string; summary: string }>
): Promise<SentimentResult[]> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  if (articles.length === 0) {
    return [];
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.1,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  // Create batch prompt with all articles
  const articlesList = articles
    .map((a, i) => `[Article ${i + 1}]\nTitle: ${a.title}\nSummary: ${a.summary}`)
    .join("\n\n");

  const promptTemplate = ChatPromptTemplate.fromTemplate(
    `Analyze the sentiment of each news article and respond with ONLY a JSON array (no markdown):

{articlesList}

Respond with this exact JSON array format:
[
  {{"sentiment": "positive"|"negative"|"neutral", "score": 0.0-1.0, "reasoning": "brief reason"}},
  {{"sentiment": "positive"|"negative"|"neutral", "score": 0.0-1.0, "reasoning": "brief reason"}}
]

Consider:
- Positive: optimistic, beneficial, improvements, growth, success
- Negative: concerning, harmful, decline, crisis, losses
- Neutral: factual, balanced, informative

Return ONLY the JSON array, nothing else. Must have exactly ${articles.length} objects.`
  );

  const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

  const response = await chain.invoke({ articlesList });

  const cleanedResponse = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsedArray: unknown[];
  try {
    parsedArray = JSON.parse(cleanedResponse);
  } catch {
    console.error("Failed to parse batch sentiments, falling back to individual analysis");
    return articles.map(() => ({
      sentiment: "neutral" as const,
      score: 0.5,
      reasoning: "Batch analysis failed"
    }));
  }

  // Validate and normalize results
  if (!Array.isArray(parsedArray)) {
    return articles.map(() => ({
      sentiment: "neutral" as const,
      score: 0.5,
      reasoning: "Invalid response format"
    }));
  }

  return parsedArray.map((item) => {
    const itemObj = item as Record<string, unknown>;
    return {
      sentiment: (["positive", "negative", "neutral"].includes(itemObj.sentiment as string)
        ? itemObj.sentiment
        : "neutral") as "positive" | "negative" | "neutral",
      score: Math.min(1, Math.max(0, (itemObj.score as number) || 0.5)),
      reasoning: (itemObj.reasoning as string) || "Sentiment analyzed"
    };
  }).slice(0, articles.length);
}

// Process articles and enrich with sentiment
export async function enrichArticlesWithSentiment(
  articles: Array<{
    title: string;
    link: string | null;
    summary: string;
    source: string | null;
    pubDate: string | null;
    topic: string;
  }>
): Promise<ArticleWithSentiment[]> {
  console.log(`🔍 Enriching ${articles.length} articles with sentiment analysis...`);

  if (articles.length === 0) {
    return [];
  }

  // Batch analyze sentiments
  const sentiments = await analyzeSentimentsBatch(
    articles.map(a => ({ title: a.title, summary: a.summary }))
  );

  // Combine articles with sentiments
  const enriched = articles.map((article, idx) => ({
    ...article,
    sentiment: sentiments[idx]?.sentiment || "neutral",
    sentimentScore: sentiments[idx]?.score || 0.5
  }));

  console.log(`Sentiment analysis complete`);

  return enriched;
}

// Get sentiment statistics
export async function getSentimentStatistics(
  articles: ArticleWithSentiment[]
): Promise<{
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  positivePercent: number;
  negativePercent: number;
  neutralPercent: number;
  averageScore: number;
}> {
  const total = articles.length;
  const positive = articles.filter(a => a.sentiment === "positive").length;
  const negative = articles.filter(a => a.sentiment === "negative").length;
  const neutral = articles.filter(a => a.sentiment === "neutral").length;
  const averageScore = articles.length > 0
    ? articles.reduce((sum, a) => sum + a.sentimentScore, 0) / articles.length
    : 0;

  return {
    total,
    positive,
    negative,
    neutral,
    positivePercent: total > 0 ? (positive / total) * 100 : 0,
    negativePercent: total > 0 ? (negative / total) * 100 : 0,
    neutralPercent: total > 0 ? (neutral / total) * 100 : 0,
    averageScore
  };
}

// Categorize articles by sentiment
export async function categorizeByTopic(
  articles: ArticleWithSentiment[]
): Promise<Record<string, ArticleWithSentiment[]>> {
  const categorized: Record<string, ArticleWithSentiment[]> = {};

  for (const article of articles) {
    if (!categorized[article.topic]) {
      categorized[article.topic] = [];
    }
    categorized[article.topic].push(article);
  }

  return categorized;
}