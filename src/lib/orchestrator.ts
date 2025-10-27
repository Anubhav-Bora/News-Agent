import {
  RunnableSequence,
  RunnableLambda,
} from "@langchain/core/runnables";
import { collectDailyDigest } from "./agents/collector";
import { generateAudioScript, generateAudio } from "./agents/audioGenerator";
import { suggestRelevantTopics } from "./agents/interestTracker";
import { analyzeSentimentsBatch, type SentimentResult } from "./agents/sentiment";
import { sendEmailDigest } from "./agents/emailer";
import { generateDigestPDF } from "./agents/pdfGenerator";
import { uploadAudioToSupabase } from "./storage";
import { translateArticles } from "./agents/languageTranslator";
import logger from "./logger";

export interface PipelineInput {
  userId: string;
  userName?: string;
  email: string;
  language: string;
  newsType: "all" | "tech" | "national" | "international" | "sports" | "state";
  state?: string;
  location?: string;
}

export interface NewsDigest {
  items: Array<{
    title: string;
    summary: string;
    source: string | null;
    link: string | null;
    pubDate: string | null;
  }>;
}

export interface EnrichedArticle {
  title: string;
  link: string | undefined;
  summary: string;
  source: string | undefined;
  topic: string;
  sentiment: "positive" | "negative" | "neutral";
  pubDate: string;
}

export interface PipelineOutput {
  newsCollected: number;
  audioGenerated: boolean;
  audioFileName: string;
  emailSent: boolean;
  enrichedArticles: EnrichedArticle[];
}

interface PipelineContext {
  input: PipelineInput;
  digest: NewsDigest & {
    weather?: {
      location: string;
      temperature: number;
      condition: string;
      humidity?: number;
      windSpeed?: number;
    };
  };
  englishDigest?: NewsDigest; // English articles for PDF (always in English)
  audioScript: string;
  suggestedTopics: string[];
  sentimentResults: SentimentResult[];
  audioBuffer: Buffer;
  audioFileName: string;
  audioUrl?: string;
  pdfUrl?: string | null;
  enrichedArticles?: EnrichedArticle[];
}

export const createNewsPipeline = () => {
  // Step 1: Collect news
  const collectorStep = new RunnableLambda({
    func: async (input: PipelineInput): Promise<PipelineContext> => {
      logger.info(`Step 1: Collecting news for topic: ${input.newsType}${input.state ? ` (State: ${input.state})` : ""}`);
      const digest = await collectDailyDigest(
        input.newsType,
        input.language,
        input.location,
        input.state
      );

      if (!digest || digest.items.length === 0) {
        throw new Error("Collector agent returned empty results");
      }

      logger.info(`Collected ${digest.items.length} articles`);
      
      // Also collect English articles for PDF (always in English, regardless of language setting)
      let englishDigest = digest;
      if (input.language.toLowerCase() !== "english" && input.language.toLowerCase() !== "en") {
        logger.info(`Collecting English articles for PDF...`);
        try {
          englishDigest = await collectDailyDigest(
            input.newsType,
            "en", // Always English for PDF
            input.location,
            input.state
          );
        } catch (err) {
          logger.warn(`Failed to collect English articles for PDF, using original digest`);
          englishDigest = digest;
        }
      }
      
      return {
        input,
        digest,
        englishDigest,
        audioScript: "",
        suggestedTopics: [],
        sentimentResults: [],
        audioBuffer: Buffer.alloc(0),
        audioFileName: "",
      };
    },
  });

  const translationStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      if (context.input.language.toLowerCase() === "english" || context.input.language.toLowerCase() === "en") {
        logger.info(`Step 2: Translation skipped (English selected)`);
        return context;
      }

      logger.info(`Step 2: Translating articles to ${context.input.language}`);
      try {
        const translatedItems = await translateArticles(
          context.digest.items.map((item) => ({
            title: item.title,
            summary: item.summary,
            source: item.source || undefined,
            link: item.link || undefined,
            pubDate: item.pubDate || undefined,
          })),
          context.input.language
        );

        logger.info(`Translated ${translatedItems.length} articles`);
        const updatedItems = context.digest.items.map((item, index) => ({
          ...item,
          title: translatedItems[index]?.title || item.title,
          summary: translatedItems[index]?.summary || item.summary,
        }));

        return {
          ...context,
          digest: {
            ...context.digest,
            items: updatedItems,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes("quota") || errorMsg.includes("429")) {
          logger.warn(`⚠️ Translation skipped due to quota limit. Continuing with original content.`);
          return context;
        }
        throw error;
      }
    },
  });

  const audioScriptStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      logger.info(`Step 3: Generating audio script in ${context.input.language}`);
      const audioScript = await generateAudioScript(
        context.digest.items.map((item) => ({
          title: item.title,
          summary: item.summary,
          source: item.source || "Unknown",
        })),
        5,
        context.input.language
      );

      logger.info(`Generated audio script (${audioScript.length} chars)`);
      return { ...context, audioScript };
    },
  });

  
  const parallelStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      logger.info(`Step 4: Tracking user interests in parallel`);
      logger.info(`Step 5: Analyzing sentiments in parallel`);

      const articleTitles = context.digest.items.map((item) => item.title);
      const [suggestedTopics, sentimentResults] = await Promise.all([
        suggestRelevantTopics(context.input.userId, articleTitles),
        analyzeSentimentsBatch(
          context.digest.items.map((item) => ({
            title: item.title,
            summary: item.summary,
          }))
        ),
      ]);

      const topics = Array.isArray(suggestedTopics)
        ? suggestedTopics
        : [suggestedTopics];
      logger.info(`Suggested topics: ${topics.join(", ")}`);
      logger.info(`Analyzed sentiments for ${sentimentResults.length} articles`);

      return { ...context, suggestedTopics: topics, sentimentResults };
    },
  });

  
  const audioGenerationStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      logger.info(`Step 6: Generating audio file`);
      const audioBuffer = await generateAudio(
        context.audioScript,
        context.input.language
      );
      const audioFileName = `news-digest-${Date.now()}.mp3`;
      
      const audioUrl = await uploadAudioToSupabase(
        audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer),
        context.input.userId,
        audioFileName
      );
      
      logger.info(`Audio file generated and uploaded: ${audioFileName}`);
      logger.info(`🔗 Audio URL: ${audioUrl}`);

      return {
        ...context,
        audioBuffer: audioBuffer instanceof Buffer ? audioBuffer : Buffer.from(audioBuffer),
        audioFileName,
        audioUrl,
      };
    },
  });
  const enrichmentStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      logger.info(`📊 Step 7: Enriching articles with sentiment data`);

      const enrichedArticles: EnrichedArticle[] = context.digest.items.map(
        (item, index) => ({
          title: item.title,
          link: item.link || undefined,
          summary: item.summary,
          source: item.source || undefined,
          topic: context.input.newsType,
          sentiment:
            (context.sentimentResults[index]?.sentiment as
              | "positive"
              | "negative"
              | "neutral") || "neutral",
          pubDate: item.pubDate || new Date().toISOString(),
        })
      );

      logger.info(`Articles enriched with sentiment`);

      return { ...context, enrichedArticles };
    },
  });

  const pdfGenerationStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      logger.info(`📄 Step 8: Generating PDF in English (always)`);
      
      const enrichedArticles = context.enrichedArticles || context.digest.items.map(
        (item, index) => ({
          title: item.title,
          link: item.link || undefined,
          summary: item.summary,
          source: item.source || undefined,
          topic: context.input.newsType,
          sentiment:
            (context.sentimentResults[index]?.sentiment as
              | "positive"
              | "negative"
              | "neutral") || "neutral",
          pubDate: item.pubDate || new Date().toISOString(),
        })
      );

      try {
        // Use englishDigest for PDF to ensure pure English content
        const articlesForPdf = (context.englishDigest?.items || context.digest.items).map((item, index) => ({
          title: item.title,
          summary: item.summary,
          source: item.source || undefined,
          topic: context.input.newsType,
          sentiment: (context.sentimentResults[index]?.sentiment as "positive" | "negative" | "neutral") || "neutral",
          pubDate: item.pubDate || new Date().toISOString(),
          keywords: [],
          reliability: 0.8,
        }));

        const pdfUrl = await generateDigestPDF(
          articlesForPdf as any,
          {},
          context.input.userId,
          "en",
          context.digest.weather
        );

        logger.info(`PDF generated`);
        logger.info(`🔗 PDF URL: ${pdfUrl}`);

        return { ...context, pdfUrl, enrichedArticles };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown PDF generation error";
        logger.warn(`⚠️ PDF generation failed: ${errorMsg}`);

        return { ...context, pdfUrl: null, enrichedArticles };
      }
    },
  });

  const emailStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineOutput> => {
      logger.info(`Step 8: Sending email to ${context.input.email}`);

      const enrichedArticles = context.enrichedArticles || context.digest.items.map(
        (item, index) => ({
          title: item.title,
          link: item.link || undefined,
          summary: item.summary,
          source: item.source || undefined,
          topic: context.input.newsType,
          sentiment:
            (context.sentimentResults[index]?.sentiment as
              | "positive"
              | "negative"
              | "neutral") || "neutral",
          pubDate: item.pubDate || new Date().toISOString(),
        })
      );

  
      const attachmentsData: { pdfUrl?: string; audioUrl?: string; pdfFileName?: string; audioFileName?: string } = {};
      
      if (context.pdfUrl) {
        attachmentsData.pdfUrl = context.pdfUrl;
        attachmentsData.pdfFileName = "news-digest.pdf";
      }
      
      if (context.audioUrl) {
        attachmentsData.audioUrl = context.audioUrl;
        attachmentsData.audioFileName = context.audioFileName;
      }

      const userName = context.input.userName || context.input.email?.split('@')[0] || 'User';
      
      const emailSent = await sendEmailDigest(
        context.input.email,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enrichedArticles as any,
        userName,
        Object.keys(attachmentsData).length > 0 ? attachmentsData : undefined
      );

      logger.info(`Email sent successfully to ${userName}`);

      return {
        newsCollected: enrichedArticles.length,
        audioGenerated: true,
        audioFileName: context.audioFileName,
        emailSent,
        enrichedArticles,
      };
    },
  });


  const pipeline = RunnableSequence.from([
    collectorStep,
    translationStep,
    audioScriptStep,
    parallelStep,
    audioGenerationStep,
    enrichmentStep,
    pdfGenerationStep,
    emailStep,
  ]);

  return pipeline;
};


export const executePipeline = async (
  input: PipelineInput
): Promise<PipelineOutput> => {
  const pipeline = createNewsPipeline();

  try {
    logger.info(`Starting pipeline for user: ${input.userId}`, {
      newsType: input.newsType,
      language: input.language,
    });

    const result = await pipeline.invoke(input);

    logger.info(`✨ Pipeline completed successfully`, {
      articlesProcessed: result.newsCollected,
      audioGenerated: result.audioGenerated,
      emailSent: result.emailSent,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`Pipeline failed: ${errorMessage}`, error);
    throw error;
  }
};
