declare module 'google-tts-api' {
  interface TTSOptions {
    lang?: string;
    slow?: boolean;
    host?: string;
    timeout?: number;
    splitPunct?: string;
  }

  function getAudioBase64(text: string, options?: TTSOptions): Promise<string>;
  function getAllAudioBase64(text: string, options?: TTSOptions): Promise<string[]>;
  function getAudioUrl(text: string, options?: TTSOptions): string;

  export { getAudioBase64, getAllAudioBase64, getAudioUrl, TTSOptions };
}