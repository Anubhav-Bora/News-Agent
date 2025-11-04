import { z } from "zod";
import { load } from "cheerio";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { analyzeSentimentsBatch } from "./sentiment";

export const NewsItemSchema = z.object({
  title: z.string(),
  link: z.string().nullable(),
  summary: z.string(),
  source: z.string().nullable(),
  pubDate: z.string().nullable(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  sentimentScore: z.number().min(0).max(1),
  category: z.string().optional(), 
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
    "https://www.hindustantimes.com/feeds/rss/india-news/index.xml",
    "https://www.ndtv.com/india/rss",
    "https://www.deccanherald.com/rss/india-news.xml"
  ]
};

const STATE_CITY_MAPPING: Record<string, string[]> = {
  "ap": ["Andhra Pradesh", "AP", "Hyderabad", "Vijayawada", "Visakhapatnam", "Warangal", "Tirupati", "Nellore"],
  "ar": ["Arunachal Pradesh", "Itanagar", "Pasighat", "Tawang"],
  "as": ["Assam", "Guwahati", "Assamese", "Dibrugarh", "Silchar", "Jorhat"],
  "br": ["Bihar", "Patna", "Bihari", "Muzaffarpur", "Gaya", "Darbhanga", "Bhagalpur"],
  "cg": ["Chhattisgarh", "Raipur", "Bilaspur", "Durg", "Bhilai"],
  "ga": ["Goa", "Panaji", "Vasco", "Margao"],
  "gj": ["Gujarat", "Ahmedabad", "Gujarati", "Rajkot", "Surat", "Vadodara", "Gandhinagar", "Anand", "Bhavnagar", "Junagadh", "Kutch", "Morbi"],
  "hr": ["Haryana", "Chandigarh", "Gurugram", "Gurgaon", "Faridabad", "Hisar", "Rohtak", "Panipat"],
  "hp": ["Himachal Pradesh", "Shimla", "Manali", "Dharamshala", "Solan", "Mandi"],
  "jk": ["Jammu", "Kashmir", "Srinagar", "J&K", "JK", "Leh", "Ladakh", "Anantnag"],
  "jh": ["Jharkhand", "Ranchi", "Jamshedpur", "Dhanbad", "Giridih", "Bokaro"],
  "ka": ["Karnataka", "Bangalore", "Bengaluru", "Kannada", "Mysore", "Mangalore", "Hubli", "Belgaum"],
  "kl": ["Kerala", "Thiruvananthapuram", "Kochi", "Malayalam", "Trivandrum", "Ernakulam", "Calicut"],
  "mp": ["Madhya Pradesh", "Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
  "mh": ["Maharashtra", "Mumbai", "Pune", "Marathi", "Nagpur", "Aurangabad", "Nashik", "Kolhapur"],
  "mn": ["Manipur", "Imphal", "Ukhrul", "Churachandpur"],
  "ml": ["Meghalaya", "Shillong", "Khasi"],
  "mz": ["Mizoram", "Aizawl", "Lunglei"],
  "nl": ["Nagaland", "Kohima", "Dimapur"],
  "od": ["Odisha", "Bhubaneswar", "Odia", "Odisha", "Cuttack", "Rourkela", "Balasore"],
  "pb": ["Punjab", "Chandigarh", "Punjabi", "Ludhiana", "Amritsar", "Jalandhar", "Patiala"],
  "rj": ["Rajasthan", "Jaipur", "Jodhpur", "Udaipur", "Ajmer", "Kota", "Bikaner"],
  "sk": ["Sikkim", "Gangtok", "Namchi"],
  "tn": ["Tamil Nadu", "Chennai", "Tamil", "Madras", "Coimbatore", "Madurai", "Salem", "Trichy"],
  "tg": ["Telangana", "Hyderabad", "Telugu", "Secunderabad", "Warangal", "Karimnagar"],
  "tr": ["Tripura", "Agartala", "Tripuri"],
  "up": ["Uttar Pradesh", "Lucknow", "Kanpur", "Varanasi", "Agra", "Meerut", "Ghaziabad", "Allahabad"],
  "uk": ["Uttarakhand", "Dehradun", "Nainital", "Rishikesh", "Haridwar"],
  "wb": ["West Bengal", "Kolkata", "Bengali", "Darjeeling", "Siliguri", "Asansol"],
  "dl": ["Delhi", "New Delhi", "Delhi"],
  "ch": ["Chandigarh"],
  "ld": ["Lakshadweep", "Kavaratti"],
  "py": ["Puducherry", "Pondicherry", "Yanam", "Mahe"]
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

async function filterArticlesByStateWithAI(
  articles: Array<{title: string; description: string; link: string | null; source: string | null; pubDate: string | null}>,
  state: string,
  stateNames: string[]
): Promise<Array<{title: string; description: string; link: string | null; source: string | null; pubDate: string | null}>> {
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("⚠️ GOOGLE_API_KEY not available for AI filtering");
    return articles.slice(0, 15);
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash",
      temperature: 0.2,
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const stateNames_str = stateNames.join(", ");
    const articlesText = articles
      .slice(0, 30)
      .map((a, idx) => `${idx + 1}. Title: ${a.title}\nDescription: ${a.description?.substring(0, 200) || "N/A"}`)
      .join("\n\n");

    const promptContent = `You are a news relevance classifier. Given a state and news articles, identify which articles are relevant to that state.

State: ${stateNames_str} (code: ${state})

Return ONLY a JSON array of integers representing the indices (1-based) of articles relevant to this state. Consider articles relevant if they mention:
- The state name or its cities
- Local government/administration decisions
- Regional events and news
- Local businesses and industries
- Regional culture and events

Articles:
${articlesText}

Return ONLY a valid JSON array like [1, 3, 5] with no other text. If no articles are relevant, return empty array [].`;

    const chain = model.pipe(new StringOutputParser());
    const output = await chain.invoke([{ role: "user", content: promptContent }]);
    
    const cleanedOutput = output
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    
    const arrayMatch = cleanedOutput.match(/\[\s*\d*(?:\s*,\s*\d+)*\s*\]/);
    if (arrayMatch) {
      const indices = JSON.parse(arrayMatch[0]) as number[];
      const filtered = indices
        .map(idx => articles[idx - 1])
        .filter((a) => a !== undefined);
      
      console.log(`✅ AI filtering identified ${filtered.length} relevant articles for state: ${state}`);
      return filtered.length > 0 ? filtered : articles.slice(0, 15);
    }
  } catch (err) {
    console.warn(`⚠️ AI filtering failed for state ${state}:`, err instanceof Error ? err.message : "Unknown error");
  }

  return articles.slice(0, 15);
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

async function collectFromCategory(articlesText: string, category: string, language: string): Promise<Array<{
  title: string;
  link: string | null;
  summary: string;
  source: string | null;
  pubDate: string | null;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
}>> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.2,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const promptContent = `You are a JSON-strict news curator. CRITICAL: You MUST return ONLY a valid JSON array, nothing else.

Date: ${new Date().toISOString().split("T")[0]}
Category: ${category}
Language: ${language}

TASK: Extract 3-4 best articles from the text below. Return ONLY valid JSON array, no markdown, no explanation.

REQUIRED FIELDS for each article:
- title (string): Article headline
- link (string or null): URL
- summary (string): 100-150 chars, NO newlines, NO special unicode
- source (string or null): News outlet
- pubDate (string or null): Publication date

ESSENTIAL JSON RULES:
1. Return ONLY JSON array format like this: [{"title":"","link":null,...}]
2. Use ONLY double quotes around strings
3. Escape quotes inside strings as \"
4. Replace ALL newlines with spaces (no \\n)
5. Remove ALL unicode/emoji characters
6. NO trailing commas
7. NO markdown code blocks
8. NO extra text outside JSON

MUST VALIDATE: Ensure returned text starts with [ and ends with ] and is valid JSON.

Raw Articles:
${articlesText}`;

  const chain = model.pipe(new StringOutputParser());
  const output = await chain.invoke([{ role: "user", content: promptContent }]);
  
  let cleanedOutput = output
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  
  // Try to extract JSON array
  const jsonMatch = cleanedOutput.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (jsonMatch) {
    cleanedOutput = jsonMatch[0];
  }

  try {
    const items = JSON.parse(cleanedOutput) as Array<{
      title: string;
      link: string | null;
      summary: string;
      source: string | null;
      pubDate: string | null;
    }>;
    
    return items.map(item => ({
      ...item,
      sentiment: "neutral" as const,
      sentimentScore: 0.5
    }));
  } catch (parseError) {
    console.warn(`⚠️ Failed to parse category ${category} articles. Attempting JSON repair...`);
    console.warn(`Original output length: ${output.length} chars, first 150 chars: ${output.substring(0, 150)}`);
    
    try {
      // Attempt aggressive JSON repair
      let repaired = cleanedOutput;
      
      // Fix common issues
      repaired = repaired.replace(/\\'/g, "'"); // Fix escaped single quotes
      repaired = repaired.replace(/\\\//g, "/"); // Fix escaped forward slashes
      repaired = repaired.replace(/\\([^"\\\/bfnrtu])/g, "$1"); // Fix invalid escapes
      
      // Remove trailing commas
      repaired = repaired.replace(/,\s*([}\]])/g, "$1");
      
      // Parse and verify
      const items = JSON.parse(repaired) as Array<{
        title: string;
        link: string | null;
        summary: string;
        source: string | null;
        pubDate: string | null;
      }>;
      
      console.log(`✅ JSON repair successful for category ${category}, recovered ${items.length} articles`);
      
      return items.map(item => ({
        ...item,
        sentiment: "neutral" as const,
        sentimentScore: 0.5
      }));
    } catch (repairError) {
      console.warn(`⚠️ JSON repair failed for category ${category}. Using fallback to fetch more articles.`);
      
      // Return empty array - will trigger fallback collection
      return [];
    }
  }
}

export async function collectDailyDigest(
  topic = "all",
  language = "en",
  location?: string,
  state?: string
): Promise<DailyDigest> {
  if (topic === "all") {
    console.log(`📰 Collecting digest for topic: all (equal distribution from all categories)`);
    
    const categories = ["technology", "sports", "national", "international"];
    const categoryArticles: Record<string, NewsItem[]> = {};
    const allItems: NewsItem[] = [];
    
    // Collect from each category
    for (const category of categories) {
      const feeds = FEEDS[category] ?? [];
      const rawGroups = await Promise.all(feeds.map((f) => fetchRssItems(f).catch(() => [])));
      const categoryNews = uniqueByLink(rawGroups.flat())
        .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
        .slice(0, 5); // Get 5 per category for diversity
      
      const categoryText = categoryNews
        .map((a, idx) => 
          `${idx + 1}. Title: ${a.title}\nLink: ${a.link ?? ""}\nSource: ${a.source ?? ""}\nPubDate: ${a.pubDate ?? ""}\nDescription: ${a.description}`
        )
        .join("\n\n");

      if (categoryText.trim().length > 0) {
        const categoryDigest = await collectFromCategory(categoryText, category, language);
        const itemsWithCategory = categoryDigest.map(item => ({
          ...item,
          category // Add category info
        }));
        categoryArticles[category] = itemsWithCategory;
        allItems.push(...itemsWithCategory);
      }
    }
    
    // Ensure minimum 10 articles
    if (allItems.length < 10) {
      console.warn(`⚠️ Only collected ${allItems.length} articles. Fetching additional...`);
      const feeds = FEEDS["all"];
      const rawGroups = await Promise.all(feeds.map((f) => fetchRssItems(f).catch(() => [])));
      const additionalArticles = uniqueByLink(rawGroups.flat())
        .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
        .slice(0, Math.max(15 - allItems.length, 5)); // Get at least 5 more, up to 15 total
      
      const additionalProcessed = additionalArticles.map(a => ({
        title: a.title,
        link: a.link || null,
        summary: a.description?.substring(0, 150) || a.title,
        source: a.source || null,
        pubDate: a.pubDate || null,
        sentiment: "neutral" as const,
        sentimentScore: 0.5,
        category: "general" // Mark as general for articles from fallback
      }));
      
      allItems.push(...additionalProcessed);
    }

    console.log(`🔍 Analyzing sentiments for ${allItems.length} articles...`);
    const sentimentResults = await analyzeSentimentsBatch(
      allItems.map((i) => ({
        title: i.title,
        summary: i.summary
      }))
    );

    const itemsWithSentiment = allItems.map((item: NewsItem & { category?: string }, idx: number) => {
      const sentimentData = sentimentResults[idx] || { sentiment: "neutral", score: 0.5 };
      return {
        ...item,
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

    console.log(`✅ Digest collected with ${itemsWithSentiment.length} articles (minimum 10 guaranteed)`);

    return {
      date: new Date().toISOString().split("T")[0],
      language,
      topic,
      weather,
      items: itemsWithSentiment
    };
  }

  const feeds = FEEDS[topic] ?? FEEDS["all"];
  
  console.log(`📰 Collecting digest for topic: ${topic}${state ? ` (State: ${state})` : ""}`);
  
  const rawGroups = await Promise.all(feeds.map((f) => fetchRssItems(f).catch(() => [])));
  let rawArticles = uniqueByLink(rawGroups.flat())
    .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
    .slice(0, 50);

  if (topic === "state" && state && STATE_CITY_MAPPING[state]) {
    const stateKeywords = STATE_CITY_MAPPING[state];
    const keywordRegex = new RegExp(stateKeywords.join("|"), "i");
    
    rawArticles = rawArticles.filter(article => 
      keywordRegex.test(article.title) || keywordRegex.test(article.description)
    );
    
    console.log(`🔍 Filtered to ${rawArticles.length} articles for state: ${state}`);
    
    if (rawArticles.length === 0) {
      console.warn(`⚠️ No articles found for state: ${state}. Fetching more articles and retrying...`);
      
      const moreFeeds = FEEDS["national"];
      const moreRawGroups = await Promise.all(moreFeeds.map((f) => fetchRssItems(f).catch(() => [])));
      const moreArticles = uniqueByLink(moreRawGroups.flat())
        .sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0))
        .slice(0, 100);
      
      rawArticles = moreArticles.filter(article => 
        keywordRegex.test(article.title) || keywordRegex.test(article.description)
      );
      
      console.log(`🔍 After retry with more articles: ${rawArticles.length} articles found`);
      
      if (rawArticles.length === 0) {
        console.warn(`⚠️ Still no articles found for state: ${state}. Using AI-based filtering...`);
        const mappedArticles = moreArticles.map(a => ({
          title: a.title,
          description: a.description,
          link: a.link || null,
          source: a.source || null,
          pubDate: a.pubDate || null
        }));
        
        const aiFilteredArticles = await filterArticlesByStateWithAI(
          mappedArticles,
          state,
          stateKeywords
        );
        
        if (aiFilteredArticles.length > 0) {
          rawArticles = aiFilteredArticles as RSSItem[];
          console.log(`✅ AI filtering identified ${rawArticles.length} articles for state: ${state}`);
        } else {
          console.warn(`⚠️ AI filtering found no articles. Using top national articles as fallback.`);
          rawArticles = moreArticles.slice(0, 15);
        }
      }
    }
  }

  const escapeForPrompt = (text: string | null | undefined): string => {
    if (!text) return "";
    return text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, " ")
      .replace(/\r/g, " ")
      .replace(/\t/g, " ")
      .trim();
  };

  const articlesText = rawArticles
    .map(
      (a, idx) =>
        `${idx + 1}. Title: ${escapeForPrompt(a.title)}\nLink: ${escapeForPrompt(a.link)}\nSource: ${escapeForPrompt(a.source)}\nPubDate: ${escapeForPrompt(a.pubDate)}\nDescription: ${escapeForPrompt(a.description)}`
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

From the articles below, select EXACTLY 10-15 most important and recent headlines (minimum 10 articles required).
For each article, STRICTLY provide these fields:
- title: brief headline string in ${language}
- link: original URL string or null
- summary: 100-150 word summary string in ${language}, WITHOUT newlines, with special characters properly escaped
- source: news source name string or null  
- pubDate: publication date string or null

CRITICAL REQUIREMENTS:
1. MUST return at least 10 articles, maximum 15 articles
2. Do NOT return fewer than 10 articles under any circumstances
3. If fewer than 10 articles are available, use the best articles and expand summaries if needed
4. Return VALID JSON that can be parsed directly

CRITICAL JSON FORMATTING RULES:
1. Return ONLY a single JSON object wrapped in curly braces, nothing else
2. Use ONLY double quotes for all strings
3. Escape ALL quotes inside strings with backslash: \"
4. Escape ALL newlines as \\n (replace with space or newline escape)
5. Escape ALL backslashes as \\\\
6. NO actual newlines inside any string values - always use \\n or space
7. Remove or transliterate special Unicode characters - use ASCII equivalents
8. All numbers without quotes, booleans as true/false without quotes
9. NO trailing commas before ] or }
10. Test your JSON is valid before returning

STRICT FORMAT - Return ONLY this structure with NO other text:
{"date":"YYYY-MM-DD","language":"${language}","topic":"${topic}","items":[{"title":"Article Title","link":"http://url.com","summary":"Article summary text without newlines or special chars.","source":"Source Name","pubDate":"YYYY-MM-DD"}]}

Raw Articles to Process:
${articlesText}`;

  const chain = model.pipe(new StringOutputParser());
  const output = await chain.invoke([{ role: "user", content: promptContent }]);
  
  let cleanedOutput = output
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  
  // Extract JSON object from the output more carefully
  let jsonMatch;
  let jsonStart = cleanedOutput.indexOf('{');
  
  if (jsonStart >= 0) {
    // Find the last closing brace
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let jsonEnd = -1;
    
    for (let i = jsonStart; i < cleanedOutput.length; i++) {
      const char = cleanedOutput[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }
    
    if (jsonEnd > jsonStart) {
      cleanedOutput = cleanedOutput.substring(jsonStart, jsonEnd);
    }
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(cleanedOutput);
  } catch (initialError) {
    try {
      // More aggressive JSON repair
      let fixedOutput = cleanedOutput;
      
      // First, fix common escaping issues before character-by-character parsing
      // Fix invalid escape sequences like \' to just '
      fixedOutput = fixedOutput.replace(/\\'/g, "'");
      
      // Fix invalid escape sequences like \/ to /
      fixedOutput = fixedOutput.replace(/\\\//g, "/");
      
      // Fix broken unicode escapes and other invalid escape patterns
      fixedOutput = fixedOutput.replace(/\\([^"\\\/bfnrtu])/g, '$1');
      
      // Replace unescaped newlines and carriage returns inside the string
      // This is complex, so we use a different approach: parse character by character
      let repaired = '';
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < fixedOutput.length; i++) {
        const char = fixedOutput[i];
        const nextChar = fixedOutput[i + 1];
        
        if (escapeNext) {
          repaired += char;
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          repaired += char;
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          repaired += char;
          continue;
        }
        
        // Inside strings, fix problematic characters
        if (inString) {
          if (char === '\n' || char === '\r' || char === '\t') {
            // Replace with space
            repaired += ' ';
            continue;
          }
        }
        
        repaired += char;
      }
      
      // Remove any trailing commas before brackets
      repaired = repaired.replace(/,\s*([}\]])/g, '$1');
      
      parsedJson = JSON.parse(repaired);
    } catch (fixError) {
      console.error('JSON parse error - attempting fallback:', initialError);
      
      try {
        // Use the raw articles as fallback when JSON parsing completely fails
        const fallbackItems = rawArticles.slice(0, 15).map(a => ({
          title: a.title || 'Untitled',
          link: a.link || null,
          summary: (a.description || a.title || '').substring(0, 200).replace(/\n/g, ' ').replace(/"/g, '\\"'),
          source: a.source || null,
          pubDate: a.pubDate || null,
          sentiment: "neutral" as const,
          sentimentScore: 0.5
        }));
        
        // If still not enough articles, try extracting from the JSON attempt
        if (fallbackItems.length < 10) {
          const titleMatches = cleanedOutput.match(/"title"\s*:\s*"([^"]*?)"/g) || [];
          
          for (const match of titleMatches) {
            if (fallbackItems.length >= 10) break;
            const titleContent = match.match(/"title"\s*:\s*"([^"]*?)"/);
            if (titleContent) {
              const title = titleContent[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
              // Check if this title isn't already in fallbackItems
              if (!fallbackItems.some(item => item.title === title)) {
                fallbackItems.push({
                  title: title || 'Untitled',
                  link: null,
                  summary: title.substring(0, 150),
                  source: null,
                  pubDate: null,
                  sentiment: "neutral" as const,
                  sentimentScore: 0.5
                });
              }
            }
          }
        }
        
        parsedJson = {
          date: new Date().toISOString().split("T")[0],
          language,
          topic,
          items: fallbackItems
        };
        
        console.warn(`⚠️ Could not parse model output. Using fallback articles (${fallbackItems.length} items). Model output length: ${output.length}`);
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
    // Return digest with raw articles if validation fails, ensuring at least 10 articles
    const fallbackArticles = rawArticles.slice(0, Math.max(15, 10)).map(a => ({
      title: a.title,
      link: a.link || null,
      summary: a.description?.substring(0, 150) || a.title,
      source: a.source || null,
      pubDate: a.pubDate || null,
      sentiment: "neutral" as const,
      sentimentScore: 0.5
    }));
    
    console.log(`✅ Using fallback articles. Total: ${fallbackArticles.length}`);
    
    return {
      date: new Date().toISOString().split("T")[0],
      language,
      topic,
      items: fallbackArticles
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

  // Ensure minimum 10 articles
  if (itemsWithContext.length < 10) {
    console.warn(`⚠️ Only ${itemsWithContext.length} articles collected. Attempting to add more from raw articles...`);
    const additionalArticles = rawArticles
      .filter(ra => !itemsWithContext.some(i => i.title.includes(ra.title.slice(0, 20))))
      .slice(0, 10 - itemsWithContext.length)
      .map(a => ({
        title: a.title,
        link: a.link || null,
        summary: a.description?.substring(0, 150) || a.title,
        source: a.source || null,
        pubDate: a.pubDate || null,
        sentiment: "neutral" as const,
        sentimentScore: 0.5
      }));
    
    itemsWithContext.push(...additionalArticles);
    console.log(`✅ Added ${additionalArticles.length} additional articles. Total: ${itemsWithContext.length}`);
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
