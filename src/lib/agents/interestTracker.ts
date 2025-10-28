import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  getUserInterestsFromDB,
  saveUserInterestsToDb,
  addToBrowsingHistoryDB,
  getBrowsingHistoryFromDB,
} from "../storage";

const userInterestsDB: Map<string, Record<string, number>> = new Map();
const browsingHistoryDB: Map<string, string[]> = new Map();

export async function getUserInterests(userId: string): Promise<Record<string, number>> {
  try {
    const dbInterests = await getUserInterestsFromDB(userId);
    if (Object.keys(dbInterests).length > 0) {
      console.log(`📊 Loaded interests from database for user ${userId}`);
      return dbInterests;
    }
  } catch (err) {
    console.warn(`Failed to fetch from DB, using in-memory storage`);
  }

  return userInterestsDB.get(userId) || {
    national: 0.3,
    international: 0.3,
    sports: 0.2,
    technology: 0.2,
    all: 0.5
  };
}

export async function updateUserInterests(userId: string, interests: Record<string, number>): Promise<void> {
  userInterestsDB.set(userId, interests);

  try {
    await saveUserInterestsToDb(userId, interests);
  } catch (err) {
    console.warn(`Failed to save interests to DB, using in-memory only`);
  }
}

export async function addToBrowsingHistory(userId: string, articleTitles: string[]): Promise<void> {
  const current = browsingHistoryDB.get(userId) || [];
  browsingHistoryDB.set(userId, [...current, ...articleTitles].slice(-100));

  try {
    await addToBrowsingHistoryDB(userId, articleTitles);
  } catch (err) {
    console.warn(`Failed to save browsing history to DB, using in-memory only`);
  }
}

export async function getBrowsingHistory(userId: string): Promise<string[]> {
  try {
    const dbHistory = await getBrowsingHistoryFromDB(userId);
    if (dbHistory.length > 0) {
      console.log(`📚 Loaded browsing history from database for user ${userId}`);
      browsingHistoryDB.set(userId, dbHistory);
      return dbHistory;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to fetch history from DB, using in-memory storage`);
  }

  return browsingHistoryDB.get(userId) || [];
}


export async function updateInterestProfile(userId: string, topics: string[]): Promise<Record<string, number>> {
  const interests = await getUserInterests(userId);
  const newInterests = { ...interests };

  const normalizedTopics = topics.map(t => t.toLowerCase().trim());
  
  // Boost interests by 0.25 instead of 0.15 (more aggressive learning)
  for (const topic of normalizedTopics) {
    newInterests[topic] = Math.min(1, (newInterests[topic] || 0.5) + 0.25);
  }

  // Decay non-selected topics more slowly to maintain diversity
  for (const key of Object.keys(newInterests)) {
    if (!normalizedTopics.includes(key)) {
      newInterests[key] = Math.max(0.15, newInterests[key] - 0.05); // Changed from 0.1 and 0.03
    }
  }

  // Normalize so interests sum to 1.5 (for reasonable distribution)
  const sum = Object.values(newInterests).reduce((a, b) => a + b, 0);
  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(newInterests)) {
    normalized[key] = (value as number) / (sum / 1.5);
  }

  await updateUserInterests(userId, normalized);
  console.log(`✅ Updated interests for user ${userId}:`, normalized);
  
  return normalized;
}

export async function getRankedTopics(userId: string): Promise<string[]> {
  const interests = await getUserInterests(userId);
  return Object.entries(interests)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .map(([topic]) => topic)
    .filter(t => t !== "all");
}

export async function suggestRelevantTopics(
  userId: string,
  articleTitles: string[]
): Promise<string[]> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  await addToBrowsingHistory(userId, articleTitles);

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.3,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const promptTemplate = ChatPromptTemplate.fromTemplate(
    `You are a news topic recommendation engine. Analyze the following article titles and suggest the 5 most relevant news topic categories.

Article Titles:
{titles}

Available Categories: national, international, sports, technology, all

Based on the article titles, suggest the top 5 most relevant categories. Return ONLY a JSON array of strings with no markdown:
["category1", "category2", "category3", "category4", "category5"]

Return ONLY the JSON array, nothing else.`
  );

  const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

  const titlesText = articleTitles.slice(0, 15).join("\n- ");
  const response = await chain.invoke({ titles: titlesText });

  const cleanedResponse = response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let topics: string[];
  try {
    topics = JSON.parse(cleanedResponse);
  } catch {
    console.error("Failed to parse suggested topics:", cleanedResponse);
    return ["national", "technology", "international"];
  }

  const validTopics = ["national", "international", "sports", "technology", "all"];
  const filteredTopics = Array.isArray(topics)
    ? topics.filter(t => validTopics.includes(t.toLowerCase())).map(t => t.toLowerCase())
    : ["national", "technology", "international"];

  console.log(`💡 Suggested topics for user ${userId}:`, filteredTopics);
  
  return filteredTopics;
}

export async function getNextRecommendedTopic(userId: string): Promise<string> {
  const rankedTopics = await getRankedTopics(userId);
  return rankedTopics[0] || "all";
}

export async function analyzeInterestTrends(userId: string): Promise<{
  topInterests: string[];
  growingInterests: string[];
  decliningInterests: string[];
}> {
  const interests = await getUserInterests(userId);
  const sortedByValue = Object.entries(interests)
    .sort(([, a], [, b]) => (b as number) - (a as number));

  const topInterests = sortedByValue.slice(0, 3).map(([topic]) => topic);
  const growingInterests = sortedByValue
    .filter(([, value]) => (value as number) > 0.6)
    .map(([topic]) => topic);
  const decliningInterests = sortedByValue
    .filter(([, value]) => (value as number) < 0.2)
    .map(([topic]) => topic);

  return {
    topInterests,
    growingInterests,
    decliningInterests
  };
}

// NEW: Get personalized recommendations for next digest
export async function getPersonalizedRecommendations(userId: string): Promise<{
  recommendedTopics: string[];
  confidence: number;
  reason: string;
}> {
  const interests = await getUserInterests(userId);
  const topTopics = Object.entries(interests)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5)
    .map(([topic]) => topic);

  const avgInterest = Object.values(interests).reduce((a, b) => a + b as number, 0) / Object.keys(interests).length;
  const confidence = Math.min(1, avgInterest);

  return {
    recommendedTopics: topTopics,
    confidence,
    reason: `Based on your browsing history. Top interests: ${topTopics.join(", ")}`
  };
}
