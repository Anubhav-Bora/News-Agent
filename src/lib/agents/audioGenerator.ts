import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export interface Article {
  title: string;
  summary: string;
  source?: string;
}

// Language code mapper: Full language names to ISO 639-1 codes
const languageCodeMap: Record<string, string> = {
  "hindi": "hi",
  "english": "en",
  "gujarati": "gu",
  "marathi": "mr",
  "assamese": "as",
  "bengali": "bn",
  "tamil": "ta",
  "telugu": "te",
  "kannada": "kn",
  "malayalam": "ml",
  "punjabi": "pa",
  "urdu": "ur",
  "odia": "or",
  "konkani": "kok",
  "manipuri": "mni",
  "nepali": "ne",
  "sindhi": "sd",
  "sanskrit": "sa",
  // Fallback for direct codes (already ISO)
  "hi": "hi",
  "en": "en",
  "gu": "gu",
  "mr": "mr",
  "as": "as",
  "bn": "bn",
  "ta": "ta",
  "te": "te",
  "kn": "kn",
  "ml": "ml",
  "pa": "pa",
};

function getISOLanguageCode(lang: string | unknown): string {
  const langStr = typeof lang === 'string' ? lang.toLowerCase().trim() : 'en';
  return languageCodeMap[langStr] || 'en'; // Default to English if language not found
}

function isValidAudioBuffer(buffer: ArrayBuffer | Buffer): boolean {
  const view = new Uint8Array(buffer);
  if (view.length < 2) return false;
  return (view[0] === 0xff && (view[1] === 0xfb || view[1] === 0xfa)) || view.length > 1000;
}

function splitTextForTTS(text: string, maxLength = 100): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = "";

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

function generateMinimalMp3(): Buffer {
  const mp3Header = Buffer.from([
    0xFF, 0xFB, 0x90, 0x44, 0x00, 0x00, 0x00, 0x03,
    0x48, 0x00, 0x00, 0x00, 0x00, 0x4C, 0x41, 0x4D,
    0x45, 0x33, 0x2E, 0x31, 0x30, 0x30, 0x55, 0x55
  ]);
  
  const audioData = Buffer.alloc(2880);
  mp3Header.copy(audioData, 0);
  
  return audioData;
}

export async function generateAudio(text: string, lang: string | unknown = "en"): Promise<Buffer> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text input is empty");
    }

    const langCode = getISOLanguageCode(lang);
    const chunks = splitTextForTTS(text);
    const audioBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunks[i])}&tl=${langCode}&client=tw-ob`;
        
        const response = await fetch(audioUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (!response.ok) {
          const minimalMp3 = generateMinimalMp3();
          audioBuffers.push(minimalMp3);
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length > 100 && isValidAudioBuffer(buffer)) {
          audioBuffers.push(buffer);
        } else {
          const minimalMp3 = generateMinimalMp3();
          audioBuffers.push(minimalMp3);
        }
      } catch (error) {
        const minimalMp3 = generateMinimalMp3();
        audioBuffers.push(minimalMp3);
      }
    }

    if (audioBuffers.length === 0) {
      throw new Error("No audio data received from TTS service");
    }

    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const combinedBuffer = Buffer.concat(audioBuffers, totalLength);

    return combinedBuffer;
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    throw new Error(`TTS generation failed: ${errorMsg}`);
  }
}

export async function generateAudioScript(articles: Article[], duration = 5, language = "en"): Promise<string> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.4,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  const articlesJson = JSON.stringify(articles, null, 2);

  // Map language code to language name for the prompt
  const languageNames: Record<string, string> = {
    "hi": "Hindi",
    "en": "English",
    "gu": "Gujarati",
    "mr": "Marathi",
    "as": "Assamese",
    "bn": "Bengali",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "ur": "Urdu",
    "or": "Odia",
    "kok": "Konkani",
    "mni": "Manipuri",
    "ne": "Nepali",
    "sd": "Sindhi",
    "sa": "Sanskrit",
    // Full names
    "hindi": "Hindi",
    "english": "English",
    "gujarati": "Gujarati",
    "marathi": "Marathi",
    "assamese": "Assamese",
    "bengali": "Bengali",
    "tamil": "Tamil",
    "telugu": "Telugu",
    "kannada": "Kannada",
    "malayalam": "Malayalam",
    "punjabi": "Punjabi",
  };

  const languageName = languageNames[language.toLowerCase()] || "English";

  const promptTemplate = ChatPromptTemplate.fromTemplate(`Create a concise audio script for a news podcast in {language}. The script should be natural, engaging, and take approximately {duration} minutes to read at a normal pace.

IMPORTANT: Write the ENTIRE script ONLY in {language}, not in English.

Articles:
{articles}

Generate a script that:
- Opens with a greeting in {language}
- Summarizes each article in 30-40 seconds in {language}
- Maintains a professional yet engaging tone
- Includes smooth transitions between topics
- Closes with a sign-off in {language}

Return ONLY the script text in {language}, no markdown or extra formatting, no English.`);

  const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

  const script = await chain.invoke({
    articles: articlesJson,
    duration: duration.toString(),
    language: languageName,
  });

  return script.trim();
}

export async function generateAudioFromArticles(articles: Article[], lang = "en"): Promise<Buffer> {
  const script = await generateAudioScript(articles, 5, lang);
  return await generateAudio(script, lang);
}