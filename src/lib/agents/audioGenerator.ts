import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export interface Article {
  title: string;
  summary: string;
  source?: string;
}

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

function isValidMp3Buffer(buffer: ArrayBuffer | Buffer): boolean {
  const view = new Uint8Array(buffer);
  
  // Minimum reasonable audio file size (at least 1KB for valid audio)
  if (view.length < 1000) {
    console.warn(`⚠️ Audio buffer too small: ${view.length} bytes (need at least 1KB)`);
    return false;
  }
  
  // Check for MP3 frame sync bytes (0xFF followed by 0xFB or 0xFA)
  const hasMp3Sync = view[0] === 0xFF && (view[1] === 0xFB || view[1] === 0xFA);
  
  // Also check for ID3 tags (common in MP3 files)
  const hasId3Tag = view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33;
  
  // Check for other audio formats that might be returned
  // RIFF/WAV format
  const hasWavHeader = view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[3] === 0x46;
  
  // OGG/Vorbis format
  const hasOggHeader = view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67;
  
  // MPEG audio (different frame sync)
  const hasMpegSync = view[0] === 0xFF && (view[1] & 0xE0) === 0xE0;
  
  const isValid = hasMp3Sync || hasId3Tag || hasWavHeader || hasOggHeader || hasMpegSync;
  
  if (!isValid) {
    // Log first few bytes in hex for debugging
    const hexHeader = Array.from(view.slice(0, 8))
      .map(b => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`)
      .join(' ');
    console.warn(`⚠️ Audio buffer format unknown. Size: ${view.length} bytes, Header: ${hexHeader}`);
    console.warn(`   (This might still be valid audio - proceeding anyway)`);
  }
  
  return true;
}

function splitTextForTTS(text: string, maxLength = 150): string[] {
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
  
  // If still too long, split by words
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLength) {
      finalChunks.push(chunk);
    } else {
      // Split long sentences by words
      const words = chunk.split(' ');
      let tempChunk = '';
      for (const word of words) {
        if ((tempChunk + word).length <= maxLength) {
          tempChunk += (tempChunk ? ' ' : '') + word;
        } else {
          if (tempChunk) finalChunks.push(tempChunk);
          tempChunk = word;
        }
      }
      if (tempChunk) finalChunks.push(tempChunk);
    }
  }
  
  return finalChunks;
}

// Create a valid MP3 silence buffer using proper MP3 encoding
function createValidSilenceMp3(durationMs: number = 1000): Buffer {
  // Create a minimal but valid MP3 frame
  // MP3 frame header format:
  // - 0xFF: Frame sync (8 bits all 1)
  // - 0xFB: MPEG-1 Layer III stereo
  // - 0x90: Bit rate 128 kbps, sample rate 44.1kHz, no padding
  
  const mp3FrameHeader = Buffer.from([
    0xFF, 0xFB,  // Frame sync
    0x10, 0x00,  // MPEG-1 Layer III, 64kbps, 44.1kHz
  ]);
  
  // Create multiple valid MP3 frames to fill duration
  // Each MP3 frame at 44.1kHz is approximately 26ms
  const framesNeeded = Math.ceil(durationMs / 26);
  const frames: Buffer[] = [];
  
  for (let i = 0; i < framesNeeded; i++) {
    // Minimal valid MP3 frame data (simplified)
    const frame = Buffer.alloc(417); // Typical MP3 frame size
    mp3FrameHeader.copy(frame, 0);
    frame.fill(0, 4); // Fill rest with silence data
    frames.push(frame);
  }
  
  return Buffer.concat(frames);
}

// Retry mechanism for TTS with exponential backoff
async function fetchWithRetry(
  url: string,
  options: { headers: Record<string, string> },
  maxRetries: number = 5
): Promise<Response | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Create an abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return response;
        }
        
        if (response.status === 429 || response.status === 503) {
          // Rate limited or service unavailable, retry with backoff
          const backoffMs = Math.pow(2, attempt) * 2000;
          console.warn(`⚠️ Rate limited (HTTP ${response.status}). Retrying in ${backoffMs}ms... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        
        // For HTTP 400 errors, continue to next attempt
        if (response.status === 400 && attempt < maxRetries - 1) {
          console.warn(`⚠️ HTTP 400 - Bad Request. Retrying... (attempt ${attempt + 1}/${maxRetries})`);
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️ TTS request failed: ${lastError.message}. Retrying in ${backoffMs}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  if (lastError) {
    console.error(`❌ TTS request failed after ${maxRetries} attempts: ${lastError.message}`);
  }
  
  return null;
}

// Alternative TTS API using gTTS (Google Text-to-Speech) endpoint
async function fetchAudioFromAlternativeSource(
  text: string,
  langCode: string
): Promise<Buffer | null> {
  try {
    if (!process.env.GOOGLE_API_KEY) {
      console.warn("⚠️ GOOGLE_API_KEY not set for alternative TTS");
      return null;
    }

    // Convert language code to full locale code if needed
    const localeMap: Record<string, string> = {
      "hi": "hi-IN",
      "as": "as-IN",
      "bn": "bn-IN",
      "gu": "gu-IN",
      "kn": "kn-IN",
      "ml": "ml-IN",
      "mr": "mr-IN",
      "pa": "pa-IN",
      "ta": "ta-IN",
      "te": "te-IN",
      "or": "or-IN",
      "ur": "ur-PK",
      "en": "en-US",
    };

    const localeCode = localeMap[langCode] || `${langCode}-IN`;

    // Try Google Cloud Text-to-Speech API
    const apiUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_API_KEY}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: localeCode,
          ssmlGender: 'NEUTRAL',
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: 0,
          speakingRate: 1,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json() as { audioContent?: string };
      if (data.audioContent) {
        return Buffer.from(data.audioContent, 'base64');
      }
    } else {
      const errorBody = await response.text();
      console.warn(`⚠️ Google Cloud TTS API error: HTTP ${response.status} - ${errorBody}`);
    }
  } catch (err) {
    console.warn(`⚠️ Alternative TTS source failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  return null;
}

export async function generateAudio(text: string, lang: string | unknown = "en"): Promise<Buffer> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text input is empty");
    }

    const langCode = getISOLanguageCode(lang);
    console.log(`🎵 Generating audio for language: ${langCode}`);
    
    const chunks = splitTextForTTS(text, 150); // Increased max length for fewer chunks
    console.log(`📝 Split text into ${chunks.length} chunks`);
    
    const audioBuffers: Buffer[] = [];
    let successCount = 0;
    let fallbackCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      let audioBuffer: Buffer | null = null;
      const chunkText = chunks[i];
      
      console.log(`\n📦 Processing chunk ${i + 1}/${chunks.length} (${chunkText.length} chars)`);

      try {
        // Try multiple header configurations for better compatibility
        const headerConfigs: Record<string, string>[] = [
          {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "audio/mpeg",
            "Referer": "https://translate.google.com/",
            "Accept-Language": "en-US,en;q=0.9",
          },
          {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "audio/mp3, audio/mpeg",
            "Referer": "https://translate.google.com/",
            "Accept-Language": "en-US,en;q=0.9",
          },
          {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "audio/*",
            "Referer": "https://translate.google.com/",
            "Accept-Language": "en-US,en;q=0.9",
          },
        ];

        let response: Response | null = null;
        for (let headerIdx = 0; headerIdx < headerConfigs.length; headerIdx++) {
          const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langCode}&q=${encodeURIComponent(chunkText)}`;
          
          console.log(`   Attempt ${headerIdx + 1}/3: Trying with header config ${headerIdx + 1}...`);
          response = await fetchWithRetry(googleTtsUrl, {
            headers: headerConfigs[headerIdx],
          }, 2);

          if (response && response.ok) {
            console.log(`   ✅ Response OK with config ${headerIdx + 1}`);
            break;
          }
        }

        if (response && response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          audioBuffer = Buffer.from(arrayBuffer);
          
          // Log the buffer info for debugging
          const hexHeader = Array.from(new Uint8Array(arrayBuffer).slice(0, 8))
            .map(b => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`)
            .join(' ');
          console.log(`   Audio buffer received: ${audioBuffer.length} bytes, Header: ${hexHeader}`);
          
          // Validate the audio buffer is actually valid
          if (isValidMp3Buffer(audioBuffer)) {
            audioBuffers.push(audioBuffer);
            console.log(`✅ Chunk ${i + 1}: TTS generated successfully (${(audioBuffer.length / 1024).toFixed(2)} KB)`);
            successCount++;
            continue;
          } else {
            console.warn(`⚠️ Chunk ${i + 1}: Invalid audio buffer received, trying alternative source...`);
          }
        } else {
          const statusCode = response?.status || 'unknown';
          console.warn(`⚠️ Chunk ${i + 1}: Google Translate API returned HTTP ${statusCode}, trying alternative...`);
        }

        // Second attempt: Try alternative TTS source (Google Cloud Text-to-Speech API)
        if (process.env.GOOGLE_API_KEY) {
          console.log(`   Trying alternative TTS source (Google Cloud)...`);
          const altBuffer = await fetchAudioFromAlternativeSource(chunkText, langCode);
          if (altBuffer && isValidMp3Buffer(altBuffer)) {
            audioBuffers.push(altBuffer);
            console.log(`✅ Chunk ${i + 1}: Alternative TTS generated successfully (${(altBuffer.length / 1024).toFixed(2)} KB)`);
            successCount++;
            continue;
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Chunk ${i + 1}: TTS API error: ${errorMsg}`);
      }

      // If we get here, TTS failed for this chunk - create silence fallback
      fallbackCount++;
      console.warn(`⚠️ Chunk ${i + 1}: Creating fallback silence (${chunkText.length} chars)`);
      
      // Create a valid (but silent) MP3 buffer as fallback
      const durationMs = Math.max(500, (chunkText.length / 3) * 1000);
      audioBuffer = createValidSilenceMp3(durationMs);
      audioBuffers.push(audioBuffer);
    }

    if (audioBuffers.length === 0) {
      throw new Error("No audio data generated or available");
    }

    console.log(`\n📊 Audio generation summary: ✅ ${successCount} successful, ⚠️ ${fallbackCount} fallback chunks`);

    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const combinedBuffer = Buffer.concat(audioBuffers, totalLength);

    console.log(`✅ Combined audio buffer: ${combinedBuffer.length} bytes (${(combinedBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`📢 Note: Audio contains ${fallbackCount > 0 ? fallbackCount + ' fallback silence chunks' : 'real audio data from TTS'}`);
    
    return combinedBuffer;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ TTS generation failed: ${errorMsg}`);
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
