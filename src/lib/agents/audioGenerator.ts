import googleTTS from "google-tts-api";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export interface Article {
  title: string;
  summary: string;
  source?: string;
}

export async function generateAudio(text: string, lang = "en"): Promise<ArrayBuffer> {
  const url = googleTTS.getAudioUrl(text, {
    lang,
    slow: false,
    host: "https://translate.google.com",
  });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TTS request failed: ${res.statusText}`);
  return await res.arrayBuffer();
}

export async function generateAudioScript(articles: Article[], duration = 5): Promise<string> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    temperature: 0.4,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const articlesJson = JSON.stringify(articles, null, 2);

  const promptTemplate = ChatPromptTemplate.fromTemplate(`Create a concise audio script for a news podcast. The script should be natural, engaging, and take approximately {duration} minutes to read at a normal pace.

Articles:
{articles}

Generate a script that:
- Opens with a greeting
- Summarizes each article in 30-40 seconds
- Maintains a professional yet engaging tone
- Includes smooth transitions between topics
- Closes with a sign-off

Return ONLY the script text, no markdown or extra formatting.`);

  const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

  const script = await chain.invoke({
    articles: articlesJson,
    duration: duration.toString(),
  });

  return script.trim();
}

export async function generateAudioFromArticles(articles: Article[], lang = "en"): Promise<ArrayBuffer> {
  const script = await generateAudioScript(articles);
  return await generateAudio(script, lang);
}
