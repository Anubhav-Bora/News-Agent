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
    "https://www.thehindu.com/news/national/feeder/default.rss",
    "https://indianexpress.com/section/india/feed/",
    "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    "https://www.hindustantimes.com/feeds/rss/india-news/index.xml"
  ]
};

// State-specific keywords mapping for filtering articles
const STATE_KEYWORDS: Record<string, string[]> = {
  "ap": ["Andhra Pradesh", "AP", "Hyderabad", "Vijayawada"],
  "ar": ["Arunachal Pradesh", "Itanagar"],
  "as": ["Assam", "Guwahati", "Assamese"],
  "br": ["Bihar", "Patna", "Bihari"],
  "cg": ["Chhattisgarh", "Raipur"],
  "ga": ["Goa", "Panaji"],
  "gj": ["Gujarat", "Ahmedabad", "Gujarati"],
  "hr": ["Haryana", "Chandigarh", "Gurugram"],
  "hp": ["Himachal Pradesh", "Shimla"],
  "jk": ["Jammu", "Kashmir", "Srinagar", "J&K"],
  "jh": ["Jharkhand", "Ranchi"],
  "ka": ["Karnataka", "Bangalore", "Bengaluru", "Kannada"],
  "kl": ["Kerala", "Thiruvananthapuram", "Kochi", "Malayalam"],
  "mp": ["Madhya Pradesh", "Bhopal"],
  "mh": ["Maharashtra", "Mumbai", "Pune", "Marathi"],
  "mn": ["Manipur", "Imphal"],
  "ml": ["Meghalaya", "Shillong"],
  "mz": ["Mizoram", "Aizawl"],
  "nl": ["Nagaland", "Kohima"],
  "od": ["Odisha", "Bhubaneswar", "Odia"],
  "pb": ["Punjab", "Chandigarh", "Punjabi"],
  "rj": ["Rajasthan", "Jaipur"],
  "sk": ["Sikkim", "Gangtok"],
  "tn": ["Tamil Nadu", "Chennai", "Tamil"],
  "tg": ["Telangana", "Hyderabad", "Telugu"],
  "tr": ["Tripura", "Agartala"],
  "up": ["Uttar Pradesh", "Lucknow"],
  "uk": ["Uttarakhand", "Dehradun"],
  "wb": ["West Bengal", "Kolkata", "Bengali"],
  "dl": ["Delhi", "New Delhi"],
  "ch": ["Chandigarh"],
  "ld": ["Lakshadweep"],
  "py": ["Puducherry", "Pondicherry"]
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
  location?: string,
  state?: string
): Promise<DailyDigest> {
  const feeds = FEEDS[topic] ?? FEEDS["all"];
  
  console.log(`📰 Collecting digest for topic: ${topic}${state ? ` (State: ${state})` : ""}`);
  
  const rawGroups = await Promise.all(feeds.map((f) => fetchRssItems(f).catch(() => [])));
  let rawArticles = uniqueByLink(rawGroups.flat())
    .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
    .slice(0, 50);

  // Filter articles by state if state is provided and topic is "state"
  if (topic === "state" && state && STATE_KEYWORDS[state]) {
    const stateKeywords = STATE_KEYWORDS[state];
    const keywordRegex = new RegExp(stateKeywords.join("|"), "i");
    
    rawArticles = rawArticles.filter(article => 
      keywordRegex.test(article.title) || keywordRegex.test(article.description)
    );
    
    console.log(`🔍 Filtered to ${rawArticles.length} articles for state: ${state}`);
    
    // If no articles found for the state, fall back to unfiltered results
    if (rawArticles.length === 0) {
      console.warn(`⚠️ No articles found for state: ${state}. Using general national news instead.`);
      rawArticles = uniqueByLink(rawGroups.flat())
        .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
        .slice(0, 50);
    }
  }

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

  const promptContent = `You are a precise multilingual news curator. IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, no extra text.

Today's date is ${new Date().toISOString().split("T")[0]}. 
User requested topic: ${topic}
Language: ${language}

From the articles below, select up to 15 most important and recent headlines.
For each article, STRICTLY provide these fields:
- title: brief headline string in ${language}
- link: original URL string or null
- summary: 100-150 word summary string in ${language}, WITHOUT newlines, with special characters properly escaped
- source: news source name string or null  
- pubDate: publication date string or null

CRITICAL JSON FORMATTING RULES:
1. Use ONLY double quotes for all strings
2. Escape ALL quotes inside strings with backslash: \"
3. Escape ALL newlines as \\n (not actual line breaks)
4. Escape ALL backslashes as \\\\
5. NO newlines inside any string values - convert to spaces
6. Remove special Unicode characters - use ASCII equivalents or transliterate
7. All numbers without quotes, booleans without quotes
8. NO trailing commas before ] or }
9. Return ONLY the JSON object, nothing else - no markdown, no code blocks

Valid JSON example format:
{"date":"YYYY-MM-DD","language":"${language}","topic":"${topic}","items":[{"title":"Example Title","link":null,"summary":"Example summary text without newlines or special chars.","source":"Example Source","pubDate":null}]}

Raw Articles to Process:
${articlesText}`;

  const chain = model.pipe(new StringOutputParser());
  const output = await chain.invoke([{ role: "user", content: promptContent }]);
  
  let cleanedOutput = output
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  
  const jsonMatch = cleanedOutput.match(/\{\s*"[^"]*"[\s\S]*?\}\s*$/);
  if (jsonMatch) {
    cleanedOutput = jsonMatch[0];
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(cleanedOutput);
  } catch (initialError) {
    try {
      let fixedOutput = cleanedOutput;
      
      // Fix unescaped characters in JSON strings
      fixedOutput = fixedOutput.replace(/: "([^"\\]*(\\.[^"\\]*)*)/g, (match) => {
        const content = match.slice(3);
        // Only escape unescaped quotes
        const escaped = content
          .replace(/\\([^"\\/bfnrtu])/g, '\\\\$1') // Fix improperly escaped characters
          .replace(/(?<!\\)"/g, '\\"') // Escape unescaped quotes
          .replace(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g, '\\n') // Escape newlines outside quotes
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        return `: "${escaped}"`;
      });
      
      // Remove newlines outside of JSON strings
      const lines = fixedOutput.split('\n');
      let inString = false;
      let processedOutput = '';
      
      for (let i = 0; i < lines.length; i++) {
        for (let j = 0; j < lines[i].length; j++) {
          const char = lines[i][j];
          const prevChar = processedOutput.charAt(processedOutput.length - 1);
          
          if (char === '"' && prevChar !== '\\') {
            inString = !inString;
          }
          processedOutput += char;
        }
        
        // Add space instead of newline if inside a string
        if (!inString && i < lines.length - 1) {
          processedOutput += ' ';
        }
      }
      
      // Remove trailing commas before closing brackets
      fixedOutput = processedOutput.replace(/,(\s*[}\]])/g, '$1');
      
      // Replace single quotes with double quotes only outside of existing strings
      fixedOutput = fixedOutput.replace(/: '([^']*)'/g, ': "$1"');
      
      parsedJson = JSON.parse(fixedOutput);
    } catch (fixError) {
      console.error('JSON parse error - attempting fallback:', initialError);
      
      try {
        const articles = [];
        
        // Extract title-summary pairs more intelligently
        const titleMatches = cleanedOutput.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g) || [];
        
        if (titleMatches.length > 0) {
          for (const match of titleMatches) {
            const titleContent = match.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
            if (titleContent) {
              articles.push({
                title: titleContent[1].replace(/\\"/g, '"').replace(/\\n/g, ' '),
                link: null,
                summary: titleContent[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').slice(0, 150),
                source: null,
                pubDate: null
              });
            }
          }
        }
        
        parsedJson = {
          date: new Date().toISOString().split("T")[0],
          language,
          topic,
          items: articles.slice(0, 15)
        };
        
        console.warn(`⚠️ Could not parse model output. Extracted ${articles.length} articles from text. Model output length: ${output.length}`);
      } catch (extractError) {
        parsedJson = {
          date: new Date().toISOString().split("T")[0],
          language,
          topic,
          items: []
        };
        console.warn(`⚠️ Could not parse model output. Returning empty digest. Model output length: ${output.length}`);
      }
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

  if (!baseDigest.success) {
    console.warn(`Schema validation failed: ${JSON.stringify(baseDigest.error.errors)}`);
    // Return digest with raw articles if validation fails
    return {
      date: new Date().toISOString().split("T")[0],
      language,
      topic,
      items: rawArticles.slice(0, 15).map(a => ({
        title: a.title,
        link: a.link || null,
        summary: a.description?.substring(0, 150) || a.title,
        source: a.source || null,
        pubDate: a.pubDate || null,
        sentiment: "neutral" as const,
        sentimentScore: 0.5
      }))
    };
  }

  // Analyze sentiments in batch using sentiment agent
  console.log(`🔍 Analyzing sentiments for ${baseDigest.data.items.length} articles...`);
  const articlesForSentiment = baseDigest.data.items.map(i => ({
    title: i.title,
    summary: i.summary
  }));
  const sentimentResults = await analyzeSentimentsBatch(articlesForSentiment);

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