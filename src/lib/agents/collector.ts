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
  source: z.string().nullable(),
  pubDate: z.string().nullable(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const DigestSchema = z.object({
  date: z.string(),
  language: z.string(),
  topic: z.string(),
  items: z.array(NewsItemSchema),
});
export type DailyDigest = z.infer<typeof DigestSchema>;

const FEEDS: Record<string, string[]> = {
  all: [
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.thehindu.com/news/national/feeder/default.rss",
    "https://www.thehindu.com/news/international/feeder/default.rss",
    "https://indianexpress.com/section/india/feed/",
    "https://www.ndtv.com/world-news/rss",
    "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    "https://www.hindustantimes.com/feeds/rss/india-news/index.xml"
  ],
  national: [
    "https://www.thehindu.com/news/national/feeder/default.rss",
    "https://indianexpress.com/section/india/feed/",
    "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    "https://www.hindustantimes.com/feeds/rss/india-news/index.xml"
  ],
  international: [
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.reuters.com/tools/rss"
  ],
  sports: [
    "https://www.espncricinfo.com/rss/content/story/feeds/0.xml",
    "https://www.espn.com/espn/rss/news",
    "https://timesofindia.indiatimes.com/rssfeeds/4719148.cms"
  ],
  technology: [
    "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    "https://feeds.feedburner.com/TechCrunch/",
    "https://www.wired.com/feed/rss"
  ]
};

async function fetchRssItems(feedUrl: string) {
  const res = await fetch(feedUrl, { headers: { "User-Agent": "NewsAgent/1.0" } });
  const xml = await res.text();
  const $ = load(xml, { xmlMode: true });
  const items = $("item")
    .map((_, el) => ({
      title: $(el).find("title").text().trim(),
      link: $(el).find("link").text().trim() || null,
      description: $(el).find("description").text().trim() || $(el).find("summary").text().trim() || "",
      pubDate: $(el).find("pubDate").text().trim() || null,
      source: $(el).find("source").text().trim() || null
    }))
    .get();
  return items.slice(0, 20);
}

function uniqueByLink(items: Array<any>) {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.link || it.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function collectDailyDigest(topic = "all", language = "en"): Promise<DailyDigest> {
  const feeds = FEEDS[topic] ?? FEEDS["all"];
  const rawGroups = await Promise.all(feeds.map((f) => fetchRssItems(f).catch(() => [])));
  const rawArticles = uniqueByLink(rawGroups.flat())
    .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
    .slice(0, 50);

  const articlesText = rawArticles
    .map(
      (a, idx) =>
        `${idx + 1}. Title: ${a.title}\nLink: ${a.link ?? ""}\nSource: ${a.source ?? ""}\nPubDate: ${
          a.pubDate ?? ""
        }\nDescription: ${a.description}`
    )
    .join("\n\n");

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    temperature: 0.2,
    apiKey: process.env.GOOGLE_API_KEY!
  });

  const jsonExample = JSON.stringify({
    date: new Date().toISOString().split("T")[0],
    language,
    topic,
    items: Array(15).fill({ title: "", link: "", summary: "", source: "", pubDate: "" })
  });

  
  const promptContent = `You are a precise multilingual news curator.

Today's date is ${new Date().toISOString().split("T")[0]}. The user requested topic: ${topic} and language: ${language}.
From the list below, choose the 15 most important and recent headlines relevant to the user's topic. 
For each chosen article, provide:
- title: a concise informative headline in the requested language
- link: the exact original link from the article data (if missing, set to null)
- summary: a 150 words factual summary in the requested language
- source: the source name if available
- pubDate: use the pubDate from the feed if available

Return STRICTLY valid JSON and nothing else. Format exactly as:
${jsonExample}

Raw Articles:
${articlesText}`;

  const chain = model.pipe(new StringOutputParser());
  const output = await chain.invoke([{ role: "user", content: promptContent }]);
  const cleanedOutput = output.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let parsedJson;
  try {
    parsedJson = JSON.parse(cleanedOutput);
  } catch (e) {
    throw new Error(`Failed to parse JSON from model output: ${e}`);
  }

  const parsed = DigestSchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.errors)}`);

  const itemsWithContext = parsed.data.items.map((it) => {
    const match =
      rawArticles.find((r) => {
        const titleMatch = r.title && it.title && r.title.toLowerCase().includes(it.title.toLowerCase().slice(0, 20));
        const linkMatch = r.link && it.link && r.link === it.link;
        return linkMatch || titleMatch;
      }) || {};
    return {
      title: it.title,
      link: it.link ?? match.link ?? null,
      summary: it.summary,
      source: it.source ?? match.source ?? null,
      pubDate: it.pubDate ?? match.pubDate ?? null
    };
  });

  return {
    date: parsed.data.date,
    language: parsed.data.language,
    topic: parsed.data.topic,
    items: itemsWithContext
  };
}