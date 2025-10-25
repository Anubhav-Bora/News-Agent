declare module 'gtts' {
  class gTTS {
    constructor(text: string, options: { lang?: string });
    save(filepath: string, callback: (err: Error | null) => void): void;
  }
  export default gTTS;
}