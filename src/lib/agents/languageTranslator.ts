import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export interface Article {
  title: string;
  summary: string;
  source?: string;
  link?: string;
  pubDate?: string;
}

const languageMap: Record<string, string> = {
  "hi": "Hindi",
  "hindi": "Hindi",
  "en": "English",
  "english": "English",
  "gu": "Gujarati",
  "gujarati": "Gujarati",
  "mr": "Marathi",
  "marathi": "Marathi",
  "as": "Assamese",
  "assamese": "Assamese",
  "bn": "Bengali",
  "bengali": "Bengali",
  "ta": "Tamil",
  "tamil": "Tamil",
  "te": "Telugu",
  "telugu": "Telugu",
  "kn": "Kannada",
  "kannada": "Kannada",
  "ml": "Malayalam",
  "malayalam": "Malayalam",
  "pa": "Punjabi",
  "punjabi": "Punjabi",
};

export async function translateArticles(
  articles: Article[],
  targetLanguage: string
): Promise<Article[]> {
  if (!targetLanguage || targetLanguage.toLowerCase() === "en" || targetLanguage.toLowerCase() === "english") {
    return articles;
  }

  if (!process.env.GOOGLE_API_KEY) {
    console.warn("⚠️ Translation skipped: Missing GOOGLE_API_KEY");
    return articles;
  }

  try {
    const languageName = languageMap[targetLanguage.toLowerCase()] || targetLanguage;

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash",
      temperature: 0.3,
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const translatedArticles: Article[] = [];
    const batchSize = 3;

    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      try {
        const batchText = batch
          .map((a, idx) => `${idx + 1}. Title: ${a.title}\nSummary: ${a.summary}`)
          .join("\n---\n");

        const promptTemplate = ChatPromptTemplate.fromTemplate(
          `You are a professional news translator. Translate the following news articles to ${languageName}. Keep meanings intact and maintain professional tone.

Articles:
{articles}

Return the translations in this exact format (NO other text):
1. TITLE: [translated title]
SUMMARY: [translated summary]
2. TITLE: [translated title]
SUMMARY: [translated summary]
etc.`
        );

        const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

        const response = await chain.invoke({
          articles: batchText,
        });

        const articleMatches = response.match(/\d+\.\s+TITLE:\s*(.+?)\nSUMMARY:\s*(.+?)(?=\n\d+\.|$)/g) || [];

        batch.forEach((article, idx) => {
          try {
            const match = articleMatches[idx];
            if (match) {
              const titleMatch = match.match(/TITLE:\s*(.+?)\n/);
              const summaryMatch = match.match(/SUMMARY:\s*(.+?)$/);

              const translatedTitle = titleMatch ? titleMatch[1].trim() : article.title;
              const translatedSummary = summaryMatch ? summaryMatch[1].trim() : article.summary;

              translatedArticles.push({
                ...article,
                title: translatedTitle,
                summary: translatedSummary,
              });
              console.log(`✅ Translated: ${article.title.substring(0, 40)}...`);
            } else {
              translatedArticles.push(article);
            }
          } catch (err) {
            translatedArticles.push(article);
          }
        });
      } catch (batchErr) {
        console.warn(`⚠️ Batch translation failed at index ${i}, using originals`);
        translatedArticles.push(...batch);
      }
    }

    return translatedArticles;
  } catch (err) {
    console.warn(`⚠️ Translation batch failed. Using original articles.`);
    return articles;
  }
}

