import googleTTS from "google-tts-api";

/**
 * Generate an MP3 audio file from text using free Google TTS endpoints.
 * @param text Text to convert to speech
 * @param lang ISO language code (e.g. "en", "hi")
 * @returns 
 */
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
