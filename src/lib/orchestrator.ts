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
  suggestedTopics?: string[]; // Personalized topic recommendations for next digest
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
      const stepStart = Date.now();
      logger.info(`[STEP 1/8] Collecting news for topic: ${input.newsType}${input.state ? ` (State: ${input.state})` : ""}`);
      const digest = await collectDailyDigest(
        input.newsType,
        input.language,
        input.location,
        input.state
      );

      if (!digest || digest.items.length === 0) {
        throw new Error("Collector agent returned empty results");
      }

      const stepDuration = Date.now() - stepStart;
      logger.info(`✓ Step 1 complete: Collected ${digest.items.length} articles (${stepDuration}ms)`);
      
      // Also collect English articles for PDF (always in English, regardless of language setting)
      let englishDigest = digest;
      if (input.language.toLowerCase() !== "english" && input.language.toLowerCase() !== "en") {
        logger.info(`[STEP 1b] Collecting English articles for PDF...`);
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
      const stepStart = Date.now();
      if (context.input.language.toLowerCase() === "english" || context.input.language.toLowerCase() === "en") {
        logger.info(`[STEP 2/8] Translation skipped (English selected)`);
        return context;
      }

      logger.info(`[STEP 2/8] Translating articles to ${context.input.language}`);
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

        const stepDuration = Date.now() - stepStart;
        logger.info(`✓ Step 2 complete: Translated ${translatedItems.length} articles (${stepDuration}ms)`);
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
      const stepStart = Date.now();
      logger.info(`[STEP 3/8] Generating audio script in ${context.input.language}`);
      const audioScript = await generateAudioScript(
        context.digest.items.map((item) => ({
          title: item.title,
          summary: item.summary,
          source: item.source || "Unknown",
        })),
        5,
        context.input.language
      );

      const stepDuration = Date.now() - stepStart;
      logger.info(`✓ Step 3 complete: Generated audio script (${audioScript.length} chars, ${stepDuration}ms)`);
      return { ...context, audioScript };
    },
  });

  
  const parallelStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      const stepStart = Date.now();
      logger.info(`[STEP 4/8] Tracking user interests (parallel)`);
      logger.info(`[STEP 5/8] Analyzing sentiments (parallel)`);

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

      const stepDuration = Date.now() - stepStart;
      const topics = Array.isArray(suggestedTopics)
        ? suggestedTopics
        : [suggestedTopics];
      logger.info(`✓ Steps 4-5 complete: Suggested topics: ${topics.join(", ")}, Analyzed ${sentimentResults.length} articles (${stepDuration}ms)`);

      return { ...context, suggestedTopics: topics, sentimentResults };
    },
  });

  
  const audioGenerationStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      const stepStart = Date.now();
      logger.info(`[STEP 6/8] Generating audio file`);
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
      
      const stepDuration = Date.now() - stepStart;
      logger.info(`✓ Step 6 complete: Audio file generated (${stepDuration}ms)`);
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
      const stepStart = Date.now();
      logger.info(`[STEP 7/8] Enriching articles with sentiment data`);

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

      const stepDuration = Date.now() - stepStart;
      logger.info(`✓ Step 7 complete: Articles enriched (${stepDuration}ms)`);

      return { ...context, enrichedArticles };
    },
  });

  const pdfGenerationStep = new RunnableLambda({
    func: async (context: PipelineContext): Promise<PipelineContext> => {
      const stepStart = Date.now();
      logger.info(`[STEP 8/8] Generating PDF in English (always)`);
      
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
          category: (item as any).category, // Include category if available
        }));

        const pdfUrl = await generateDigestPDF(
          articlesForPdf as any,
          {},
          context.input.userId,
          "en",
          context.digest.weather,
          context.input.newsType // Pass newsType to know if we should show categories
        );

        const stepDuration = Date.now() - stepStart;
        logger.info(`✓ Step 8 complete: PDF generated (${stepDuration}ms)`);
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
      const stepStart = Date.now();
      logger.info(`[STEP 9/9] Sending email to ${context.input.email}`);

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

      const stepDuration = Date.now() - stepStart;
      logger.info(`✓ Step 9 complete: Email sent to ${userName} (${stepDuration}ms)`);

      return {
        newsCollected: enrichedArticles.length,
        audioGenerated: true,
        audioFileName: context.audioFileName,
        emailSent,
        enrichedArticles,
        suggestedTopics: context.suggestedTopics, // Return personalized topic suggestions
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
  const startTime = Date.now();

  try {
    logger.info(`Starting pipeline for user: ${input.userId}`, {
      newsType: input.newsType,
      language: input.language,
    });

    const result = await pipeline.invoke(input);

    const totalTime = Date.now() - startTime;
    logger.info(`✨ Pipeline completed successfully`, {
      articlesProcessed: result.newsCollected,
      audioGenerated: result.audioGenerated,
      emailSent: result.emailSent,
      totalTimeMs: totalTime,
      totalTimeSecs: (totalTime / 1000).toFixed(2),
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`Pipeline failed: ${errorMessage}`, error);
    throw error;
  }
};
