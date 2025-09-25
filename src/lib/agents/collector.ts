
import { z } from "zod";
import { load } from "cheerio";
import fetch from "node-fetch";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export const NewsItemSchema = z.object({
  title: z.string(),
  link: z.string().nullable(),
  summary: z.string(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const DigestSchema = z.object({
  date: z.string(),
  items: z.array(NewsItemSchema),
});
export type DailyDigest = z.infer<typeof DigestSchema>;

async function fetchRssItems(feedUrl: string) {
  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'NewsAgent/1.0',
    },
  });
  const xml = await res.text();
  const $ = load(xml, { xmlMode: true });

  return $("item")
    .slice(0, 10) // Get more articles to have fresher content
    .map((_, el) => ({
      title: $(el).find("title").text(),
      link: $(el).find("link").text(),
      description: $(el).find("description").text(),
      pubDate: $(el).find("pubDate").text(),
    }))
    .get()
    .sort((a, b) => {
      // Sort by publication date (newest first)
      const dateA = new Date(a.pubDate || 0);
      const dateB = new Date(b.pubDate || 0);
      return dateB.getTime() - dateA.getTime();
    });
}

export async function collectDailyDigest(): Promise<DailyDigest> {
  const feeds = [
    // International sources
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    
    // Indian news sources
    "https://www.thehindu.com/news/national/feeder/default.rss",
    "https://www.thehindu.com/news/international/feeder/default.rss",
    "https://indianexpress.com/section/india/feed/",
    "https://www.ndtv.com/world-news/rss",
    "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    "https://www.hindustantimes.com/feeds/rss/india-news/index.xml",
  ];

  const rawArticles = (
    await Promise.all(feeds.map(fetchRssItems))
  ).flat();

  
  const articlesText = rawArticles
    .map((a, idx) => `${idx + 1}. Title: ${a.title}\nLink: ${a.link}\nDescription: ${a.description}`)
    .join("\n\n");

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    temperature: 0.4,
    apiKey: process.env.GOOGLE_API_KEY!,
  });

  const prompt = ChatPromptTemplate.fromTemplate(`
You are a news curator focusing on global and Indian news.
From the list below, pick 5 of the most important and RECENT headlines from today (${new Date().toISOString().split('T')[0]}).
Prioritize diverse geographical coverage including Indian news, international affairs, and global developments.
For each selected article, provide:
- A crisp, informative title
- A 2-3 sentence summary that captures the key points
- The EXACT original link provided in the article data

IMPORTANT: Use the exact link provided for each article. Do not set link to null.

Return ONLY valid JSON without any markdown formatting or code blocks:
{{{{ "date": "${new Date().toISOString().split('T')[0]}", "items": [ {{{{ "title": "", "link": "", "summary": "" }}}} ] }}}}

Raw Articles:
{articles}
  `);

  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  const output = await chain.invoke({ articles: articlesText });

  // Clean the output to extract JSON from markdown code blocks
  const cleanedOutput = output
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  console.log("Raw Gemini output:", output);
  console.log("Cleaned output:", cleanedOutput);

  let parsedJson;
  try {
    parsedJson = JSON.parse(cleanedOutput);
  } catch (jsonError) {
    console.error("JSON parse error:", jsonError);
    throw new Error(`Failed to parse JSON: ${jsonError}`);
  }

  const parsed = DigestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.error("Schema validation errors:", parsed.error.errors);
    console.error("Parsed JSON:", JSON.stringify(parsedJson, null, 2));
    throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.errors)}`);
  }

  return parsed.data;
}
