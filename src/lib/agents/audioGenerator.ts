import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export interface Article {
  title: string;
  summary: string;
  source?: string;
}

// Generate Google TTS URL directly without the library
function generateGoogleTTSUrl(text: string, lang = "en"): string {
  // Google Translate TTS endpoint
  const params = new URLSearchParams({
    client: "gtx",
    sl: lang,
    tl: lang,
    q: text,
  });
  
  return `https://translate.google.com/translate_a/element.js?callback=window.googleTTSCallback&${params.toString()}`;
}

export async function generateAudio(text: string, lang = "en"): Promise<ArrayBuffer> {
  try {
    // Split text into chunks if too long (Google TTS has limits)
    const maxLength = 200;
    let audioBuffer = new ArrayBuffer(0);
    
    if (text.length <= maxLength) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      if (!res.ok) {
        throw new Error(`TTS request failed with status ${res.status}`);
      }
      
      audioBuffer = await res.arrayBuffer();
    } else {
      // For longer texts, split into sentences and combine
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed) {
          const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(trimmed)}&tl=${lang}&client=tw-ob`;
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });
          
          if (res.ok) {
            const chunk = await res.arrayBuffer();
            // Combine audio chunks
            const combined = new Uint8Array(audioBuffer.byteLength + chunk.byteLength);
            combined.set(new Uint8Array(audioBuffer), 0);
            combined.set(new Uint8Array(chunk), audioBuffer.byteLength);
            audioBuffer = combined.buffer;
          }
        }
      }
    }
    
    if (audioBuffer.byteLength === 0) {
      throw new Error("No audio data received from TTS service");
    }
    
    return audioBuffer;
  } catch (error) {
    throw new Error(`TTS generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function generateAudioScript(articles: Article[], duration = 5): Promise<string> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
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
