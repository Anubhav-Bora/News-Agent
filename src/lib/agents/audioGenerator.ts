import googleTTS from "google-tts-api";

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
