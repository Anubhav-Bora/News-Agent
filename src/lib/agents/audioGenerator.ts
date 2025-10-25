import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTTS = require("google-tts-api");

export interface Article {
  title: string;
  summary: string;
  source?: string;
}

// Helper function to validate audio buffer
function isValidAudioBuffer(buffer: ArrayBuffer | Buffer): boolean {
  const view = new Uint8Array(buffer);
  // Check for MP3 header (0xFF, 0xFB or 0xFF, 0xFA)
  if (view.length < 2) return false;
  return (view[0] === 0xff && (view[1] === 0xfb || view[1] === 0xfa)) || view.length > 1000;
}

// Split text into chunks that are safe for TTS processing
function splitTextForTTS(text: string, maxLength = 100): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  // Split by sentences first
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (currentChunk.length + trimmed.length <= maxLength) {
      currentChunk += (currentChunk ? " " : "") + trimmed;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = trimmed;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

export async function generateAudio(text: string, lang = "en"): Promise<Buffer> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text input is empty");
    }

    const chunks = splitTextForTTS(text);
    const audioBuffers: Buffer[] = [];

    // Process each chunk with retry logic
    for (const chunk of chunks) {
      let audioData: string | null = null;
      let retries = 3;

      while (retries > 0 && !audioData) {
        try {
          // Use google-tts-api to get audio URL
          audioData = await googleTTS(chunk, lang, 1);

          if (!audioData) {
            throw new Error("No audio URL returned");
          }

          // Fetch the audio data from the URL
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(audioData, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              "Accept": "audio/mpeg",
              "Referer": "https://translate.google.com/",
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `Failed to fetch audio: ${response.status} ${response.statusText}`
            );
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (!isValidAudioBuffer(buffer)) {
            throw new Error("Invalid audio data received");
          }

          audioBuffers.push(buffer);
          break; // Success, move to next chunk
        } catch (error) {
          retries--;
          if (retries === 0) {
            throw new Error(
              `Failed to generate audio for chunk after 3 retries: ${error instanceof Error ? error.message : String(error)}`
            );
          }
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)));
        }
      }
    }

    if (audioBuffers.length === 0) {
      throw new Error("No audio data received from TTS service");
    }

    // Combine all audio buffers
    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const combinedBuffer = Buffer.concat(audioBuffers, totalLength);

    if (!isValidAudioBuffer(combinedBuffer)) {
      throw new Error("Combined audio buffer is invalid");
    }

    return combinedBuffer;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    throw new Error(`TTS generation failed: ${errorMsg}`);
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

export async function generateAudioFromArticles(articles: Article[], lang = "en"): Promise<Buffer> {
  const script = await generateAudioScript(articles);
  return await generateAudio(script, lang);
}
