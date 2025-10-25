import { z } from "zod";
import { load } from "cheerio";
import fetch from "node-fetch";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { analyzeSentimentsBatch } from "./sentiment";

// Enhanced schemas with sentiment included
export const NewsItemSchema = z.object({
  title: z.string(),
  link: z.string().nullable(),
  summary: z.string(),
  source: z.string().nullable(),
  pubDate: z.string().nullable(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  sentimentScore: z.number().min(0).max(1),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const WeatherSchema = z.object({
  location: z.string(),
  temperature: z.number(),
  condition: z.string(),
  humidity: z.number().optional(),
  windSpeed: z.number().optional(),
  forecast: z.array(z.object({
    day: z.string(),
    high: z.number(),
    low: z.number(),
    condition: z.string(),
  })).optional(),
});
export type Weather = z.infer<typeof WeatherSchema>;

export const DigestSchema = z.object({
  date: z.string(),
  language: z.string(),
  topic: z.string(),
  weather: WeatherSchema.optional(),
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
  ],
  state: [
    // Default state feeds - will be filtered by location
    "https://www.thehindu.com/news/national/feeder/default.rss",
    "https://indianexpress.com/section/india/feed/",
    "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    "https://www.hindustantimes.com/feeds/rss/india-news/index.xml"
  ]
};

async function fetchRssItems(feedUrl: string) {
  try {
    const res = await fetch(feedUrl, { headers: { "User-Agent": "NewsAgent/1.0" } });
    if (!res.ok) return [];
    
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
  } catch (err) {
    console.error(`Error fetching feed ${feedUrl}:`, err);
    return [];
  }
}

interface RSSItem {
  link?: string | null;
  title: string;
  description: string;
  pubDate?: string | null;
  source?: string | null;
}

function uniqueByLink(items: RSSItem[]): RSSItem[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.link || it.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchWeatherData(location: string = "New York"): Promise<Weather | null> {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      console.warn("⚠️ OPENWEATHER_API_KEY not configured, skipping weather data");
      return null;
    }

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );

    if (!response.ok) {
      console.warn(`⚠️ Failed to fetch weather for ${location}`);
      return null;
    }

    const data = await response.json() as {
      name: string;
      sys: { country: string };
      main: { temp: number; humidity: number };
      weather: Array<{ main: string }>;
      wind: { speed: number };
    };

    return {
      location: `${data.name}, ${data.sys?.country}`,
      temperature: Math.round(data.main.temp),
      condition: data.weather[0]?.main || "Unknown",
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6),
    };
  } catch (err) {
    console.error("Error fetching weather data:", err);
    return null;
  }
}

export async function collectDailyDigest(
  topic = "all",
  language = "en",
  location?: string
): Promise<DailyDigest> {
  const feeds = FEEDS[topic] ?? FEEDS["all"];
  
  console.log(`📰 Collecting digest for topic: ${topic}`);
  
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

  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.2,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const jsonExample = JSON.stringify({
    date: new Date().toISOString().split("T")[0],
    language,
    topic,
    items: Array(15).fill({ title: "", link: "", summary: "", source: "", pubDate: "" })
  });

  const promptContent = `You are a precise multilingual news curator. IMPORTANT: Return ONLY valid JSON, no markdown or extra text.

Today's date is ${new Date().toISOString().split("T")[0]}. 
User requested topic: ${topic}
Language: ${language}

From the articles below, select the 15 most important and recent headlines.
For each article, provide these fields EXACTLY:
- title: brief headline (${language})
- link: original URL or null
- summary: 100-150 words (${language})  
- source: news source name or null
- pubDate: publication date or null

RETURN ONLY THIS JSON STRUCTURE, NO OTHER TEXT:
{
  "date": "${new Date().toISOString().split("T")[0]}",
  "language": "${language}",
  "topic": "${topic}",
  "items": [array of 15 articles]
}

Raw Articles to Process:
${articlesText}`;

  const chain = model.pipe(new StringOutputParser());
  const output = await chain.invoke([{ role: "user", content: promptContent }]);
  
  // Clean the output - remove markdown code blocks
  let cleanedOutput = output
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  
  // Extract JSON from text if wrapped
  const jsonMatch = cleanedOutput.match(/\{\s*"[^"]*"[\s\S]*?\}\s*$/);
  if (jsonMatch) {
    cleanedOutput = jsonMatch[0];
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(cleanedOutput);
  } catch (initialError) {
    // Try to fix common issues
    try {
      // Remove newlines that aren't in strings
      const lines = cleanedOutput.split('\n');
      let inString = false;
      let fixedOutput = '';
      
      for (const line of lines) {
        for (const char of line) {
          if (char === '"' && fixedOutput.charAt(fixedOutput.length - 1) !== '\\') {
            inString = !inString;
          }
          fixedOutput += char;
        }
        // Add space instead of newline if we're in a string
        if (!inString) {
          fixedOutput += ' ';
        }
      }
      
      // Remove trailing commas
      fixedOutput = fixedOutput.replace(/,(\s*[}\]])/g, '$1');
      
      parsedJson = JSON.parse(fixedOutput);
    } catch (fixError) {
      // Create a minimal valid response
      console.error('JSON parse error - attempting fallback:', initialError);
      parsedJson = {
        date: new Date().toISOString().split("T")[0],
        language,
        topic,
        items: []
      };
      console.warn(`⚠️ Could not parse model output. Returning empty digest. Model output length: ${output.length}`);
    }
  }

  const baseDigest = DigestSchema.safeParse({
    ...parsedJson,
    items: (parsedJson.items || []).map((item: Record<string, unknown>) => ({
      ...item,
      sentiment: "neutral",
      sentimentScore: 0.5
    }))
  });

  if (!baseDigest.success) throw new Error(`Schema validation failed: ${JSON.stringify(baseDigest.error.errors)}`);

  // Analyze sentiments in batch using sentiment agent
  console.log(`🔍 Analyzing sentiments for ${baseDigest.data.items.length} articles...`);
  const articlesForSentiment = baseDigest.data.items.map(i => ({
    title: i.title,
    summary: i.summary
  }));
  const sentimentResults = await analyzeSentimentsBatch(articlesForSentiment);

  // Enrich items with context and sentiments
  const itemsWithContext = baseDigest.data.items.map((it, idx) => {
    const match: RSSItem | undefined =
      rawArticles.find((r) => {
        const titleMatch = r.title && it.title && r.title.toLowerCase().includes(it.title.toLowerCase().slice(0, 20));
        const linkMatch = r.link && it.link && r.link === it.link;
        return linkMatch || titleMatch;
      });
    
    const sentimentData = sentimentResults[idx] || { sentiment: "neutral", score: 0.5, reasoning: "" };
    
    return {
      title: it.title,
      link: it.link ?? match?.link ?? null,
      summary: it.summary,
      source: it.source ?? match?.source ?? null,
      pubDate: it.pubDate ?? match?.pubDate ?? null,
      sentiment: sentimentData.sentiment as "positive" | "negative" | "neutral",
      sentimentScore: sentimentData.score
    };
  });

  let weather: Weather | undefined;
  if (location) {
    const weatherData = await fetchWeatherData(location);
    if (weatherData) {
      weather = weatherData;
      console.log(`✅ Weather data collected for ${location}`);
    }
  }

  console.log(`✅ Digest collected with ${itemsWithContext.length} articles`);

  return {
    date: baseDigest.data.date,
    language: baseDigest.data.language,
    topic: baseDigest.data.topic,
    weather,
    items: itemsWithContext
  };
}