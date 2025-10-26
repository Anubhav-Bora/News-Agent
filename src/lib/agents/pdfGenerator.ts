import { PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";
import dayjs from "dayjs";
import { uploadPDFToSupabase, savePDFMetadata } from "../storage";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

const fontCache = new Map<string, { buffer: ArrayBuffer; timestamp: number }>();
const CACHE_DURATION_MS = 25 * 60 * 60 * 1000;

interface Article {
  title: string;
  summary: string;
  source?: string;
  topic: string;
  sentiment: "positive" | "negative" | "neutral";
  pubDate: string;
  keywords?: string[];
  reliability?: number;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }

  if (currentLine) lines.push(currentLine.trim());
  return lines;
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

async function loadCustomFont(fontUrl: string): Promise<ArrayBuffer> {
  const now = Date.now();
  const cached = fontCache.get(fontUrl);
  
  if (cached && (now - cached.timestamp) < CACHE_DURATION_MS) {
    console.log(`✅ Using cached font`);
    return cached.buffer;
  }
  
  try {
    console.log(`📥 Downloading font...`);
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Failed to load font: ${fontUrl}`);
    const buffer = await response.arrayBuffer();
    
    fontCache.set(fontUrl, { buffer, timestamp: now });
    console.log(`✅ Font loaded successfully`);
    
    return buffer;
  } catch (err) {
    console.error(`❌ Font download failed:`, err);
    throw err;
  }
}

async function translateArticles(articles: Article[], targetLanguage: string): Promise<Article[]> {
  if (targetLanguage.toLowerCase() === "en" || targetLanguage.toLowerCase() === "english") {
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

    for (const article of articles) {
      try {
        const promptTemplate = ChatPromptTemplate.fromTemplate(
          `Translate the following news article to ${languageName}. Keep the meaning intact and maintain professional tone.

Title: {title}
Summary: {summary}

Return ONLY the translation in the format:
TITLE: [translated title]
SUMMARY: [translated summary]

Do NOT include any other text.`
        );

        const chain = promptTemplate.pipe(model).pipe(new StringOutputParser());

        const response = await chain.invoke({
          title: article.title,
          summary: article.summary,
        });

        const titleMatch = response.match(/TITLE:\s*(.+?)(?:\nSUMMARY:|$)/);
        const summaryMatch = response.match(/SUMMARY:\s*(.+?)$/);

        const translatedTitle = titleMatch ? titleMatch[1].trim() : article.title;
        const translatedSummary = summaryMatch ? summaryMatch[1].trim() : article.summary;

        translatedArticles.push({
          ...article,
          title: translatedTitle,
          summary: translatedSummary,
        });
      } catch (err) {
        console.warn(`⚠️ Failed to translate article: ${article.title}. Using original.`);
        translatedArticles.push(article);
      }
    }

    return translatedArticles;
  } catch (err) {
    console.warn(`⚠️ Translation failed. Using original articles.`);
    return articles;
  }
}

function extractKeyPhrases(articles: Article[]): Map<string, number> {
  const phrases = new Map<string, number>();
  const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "is", "are", "was", "be"]);
  
  for (const article of articles) {
    const words = article.title.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
    for (const word of words) {
      phrases.set(word, (phrases.get(word) || 0) + 1);
    }
  }
  
  return new Map([...phrases.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
}

function calculateSentimentByTopic(articles: Article[]): Map<string, Record<string, number>> {
  const topicSentiments = new Map<string, Record<string, number>>();
  
  for (const article of articles) {
    if (!topicSentiments.has(article.topic)) {
      topicSentiments.set(article.topic, { positive: 0, negative: 0, neutral: 0 });
    }
    const sentiments = topicSentiments.get(article.topic)!;
    sentiments[article.sentiment]++;
  }
  
  return topicSentiments;
}

function calculateAverageReliability(articles: Article[]): number {
  const reliable = articles.filter(a => a.reliability !== undefined);
  if (reliable.length === 0) return 0;
  return reliable.reduce((sum, a) => sum + (a.reliability || 0), 0) / reliable.length;
}

function generateRecommendations(
  articles: Article[],
  topicCounts: Record<string, number>,
  sentimentCounts: Record<string, number>
): string[] {
  const recommendations: string[] = [];
  
  const dominantTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominantTopic) {
    recommendations.push(`Focus monitoring on ${dominantTopic[0]}: ${dominantTopic[1]} articles detected.`);
  }
  
  const negativePercent = (sentimentCounts.negative / articles.length) * 100;
  if (negativePercent > 40) {
    recommendations.push("High concentration of negative sentiment detected. Consider investigating underlying issues.");
  }
  
  const positivePercent = (sentimentCounts.positive / articles.length) * 100;
  if (positivePercent > 50) {
    recommendations.push("Positive sentiment dominance indicates favorable coverage trends.");
  }
  
  const avgReliability = calculateAverageReliability(articles);
  if (avgReliability < 0.6) {
    recommendations.push("Source reliability is below optimal. Recommend diversifying sources or investigating credibility.");
  }
  
  if (articles.length < 5) {
    recommendations.push("Limited article volume today. Expand search parameters or monitor additional sources.");
  }
  
  return recommendations.length > 0 ? recommendations : ["Continue current monitoring strategy. No alerts at this time."];
}

function sanitizeTextForPDF(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
}

function drawBarChart(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  data: { label: string; value: number; color: ReturnType<typeof rgb> }[],
  maxValue: number,
  font: any = StandardFonts.Helvetica
) {
  const barWidth = width / data.length;
  const padding = 30;
  
  page.drawRectangle({
    x: x - 5,
    y: y - height - 5,
    width: width + 10,
    height: height + 40,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });

  for (let i = 0; i < data.length; i++) {
    const barHeight = (data[i].value / maxValue) * height;
    const barX = x + i * barWidth + 5;
    const barY = y - barHeight;

    page.drawRectangle({
      x: barX,
      y: barY,
      width: barWidth - 10,
      height: barHeight,
      color: data[i].color,
      borderWidth: 0,
    });

    page.drawText(data[i].value.toString(), {
      x: barX + (barWidth - 30) / 2,
      y: barY + barHeight + 5,
      size: 9,
      font: font,
      color: rgb(0, 0, 0),
    });

    page.drawText(data[i].label, {
      x: barX,
      y: y - height - 20,
      size: 8,
      font: font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
}

const languageFontMap: Record<string, string> = {
  "hi": "https://fonts.gstatic.com/s/notosansdevanagari/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "gu": "https://fonts.gstatic.com/s/notosansgujarati/v27/-F6hfjtqLzM2JPrysIq46ilQkw.ttf",
  "mr": "https://fonts.gstatic.com/s/notosansdevanagari/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "ta": "https://fonts.gstatic.com/s/notosanstamil/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "te": "https://fonts.gstatic.com/s/notosanstelugu/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "kn": "https://fonts.gstatic.com/s/notosanskannada/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "ml": "https://fonts.gstatic.com/s/notosansmalayalam/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "bn": "https://fonts.gstatic.com/s/notosansbengali/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "pa": "https://fonts.gstatic.com/s/notosansgurmukhi/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
  "as": "https://fonts.gstatic.com/s/notosansassamese/v27/-F6ofjtqLzM2JPrysIq46ilQkw.ttf",
};

export async function generateDigestPDF(
  articles: Article[],
  historicalDigests: Record<string, { topicCounts: Record<string, number>; sentimentCounts: Record<string, number> }>,
  userId: string,
  language = "en",
  weather?: { location: string; temperature: number; condition: string; humidity?: number; windSpeed?: number }
): Promise<string | null> {
  console.log(`📝 Generating PDF in ${languageMap[language.toLowerCase()] || language}...`);
  let articlesToProcess = await translateArticles(articles, language);

  const sanitizedArticles = articlesToProcess.map(article => ({
    ...article,
    title: sanitizeTextForPDF(article.title),
    summary: sanitizeTextForPDF(article.summary),
    source: article.source ? sanitizeTextForPDF(article.source) : undefined,
    topic: sanitizeTextForPDF(article.topic),
  }));

  const pdfDoc = await PDFDocument.create();
  
  let contentFont, contentFontBold, headingFont, headingFontBold;
  const langCode = language.toLowerCase().replace("english", "en").replace("hindi", "hi");
  
  try {
    if (languageFontMap[langCode] && langCode !== "en") {
      const fontBuffer = await loadCustomFont(languageFontMap[langCode]);
      contentFont = await pdfDoc.embedFont(fontBuffer);
      contentFontBold = contentFont;
      headingFont = contentFont;
      headingFontBold = contentFont;
    } else {
      contentFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      contentFontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      headingFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      headingFontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to load Unicode font for ${language}. Falling back to standard fonts.`);
    contentFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    contentFontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    headingFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    headingFontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  }

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  const topicCounts: Record<string, number> = {};
  const sourceCount: Record<string, number> = {};
  const topicSentiments = calculateSentimentByTopic(sanitizedArticles);
  const keyPhrases = extractKeyPhrases(sanitizedArticles);
  
  for (const a of sanitizedArticles) {
    sentimentCounts[a.sentiment]++;
    topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1;
    if (a.source) {
      sourceCount[a.source] = (sourceCount[a.source] || 0) + 1;
    }
  }

  const recommendations = generateRecommendations(articles, topicCounts, sentimentCounts);

  const margin = 40;
  const pageWidth = 595 - 2 * margin;

  const languageNames: Record<string, string> = {
    "hi": "हिंदी",
    "en": "English",
    "gu": "ગુજરાતી",
    "mr": "मराठी",
    "as": "অসমীয়া",
    "bn": "বাংলা",
    "ta": "தமிழ்",
    "te": "తెలుగు",
    "kn": "ಕನ್ನಡ",
    "ml": "മലയാളം",
    "pa": "ਪੰਜਾਬੀ",
  };

  const displayLanguage = languageNames[language.toLowerCase()] || language;
  const currentDate = dayjs().format("MMMM DD, YYYY");

  const addHeader = (page: PDFPage, title: string, isFirstPage: boolean = false) => {
    let yPos = 800;
    
    if (isFirstPage) {
      page.drawText("THE DAILY DIGEST", {
        x: margin,
        y: yPos,
        size: 24,
        font: headingFontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      page.drawText("COMPREHENSIVE NEWS ANALYSIS & INSIGHTS", {
        x: margin,
        y: yPos - 22,
        size: 10,
        font: contentFont,
        color: rgb(0.5, 0.5, 0.5),
      });

      page.drawLine({
        start: { x: margin, y: yPos - 30 },
        end: { x: 595 - margin, y: yPos - 30 },
        thickness: 2,
        color: rgb(0.1, 0.1, 0.1),
      });

      page.drawText(currentDate, {
        x: margin,
        y: yPos - 45,
        size: 9,
        font: contentFont,
        color: rgb(0.6, 0.6, 0.6),
      });

      page.drawText(`Language: ${displayLanguage}`, {
        x: 595 - margin - 100,
        y: yPos - 45,
        size: 9,
        font: contentFont,
        color: rgb(0.6, 0.6, 0.6),
      });

      if (weather) {
        page.drawText(
          `${weather.location} • ${weather.temperature}°C • ${weather.condition}`,
          { x: margin, y: yPos - 60, size: 8, font: contentFont, color: rgb(0.4, 0.4, 0.4) }
        );
      }

      return yPos - 80;
    }

    page.drawText(title, {
      x: margin,
      y: yPos,
      size: 16,
      font: headingFontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawLine({
      start: { x: margin, y: yPos - 8 },
      end: { x: 595 - margin, y: yPos - 8 },
      thickness: 1.5,
      color: rgb(0.2, 0.2, 0.2),
    });

    return yPos - 30;
  };

  const addFooter = (page: PDFPage, pageNum: number) => {
    page.drawLine({
      start: { x: margin, y: 50 },
      end: { x: 595 - margin, y: 50 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    page.drawText(`${dayjs().format("YYYY-MM-DD HH:mm")}`, {
      x: margin,
      y: 35,
      size: 8,
      font: contentFont,
      color: rgb(0.6, 0.6, 0.6),
    });

    page.drawText(`Page ${pageNum}`, {
      x: 595 - margin - 30,
      y: 35,
      size: 8,
      font: contentFont,
      color: rgb(0.6, 0.6, 0.6),
    });
  };

  let pageNumber = 1;
  const articlesPerPage = 3;
  let currentPageArticles = 0;
  let articlePage = pdfDoc.addPage([595, 842]);
  let articleYPos = addHeader(articlePage, "TOP STORIES", true);

  for (let i = 0; i < sanitizedArticles.length; i++) {
    const article = sanitizedArticles[i];

    if (currentPageArticles >= articlesPerPage) {
      addFooter(articlePage, pageNumber);
      pageNumber++;
      if (pageNumber <= 5) {
        articlePage = pdfDoc.addPage([595, 842]);
        articleYPos = addHeader(articlePage, "TOP STORIES (CONTINUED)");
        currentPageArticles = 0;
      } else {
        break;
      }
    }

    articleYPos -= 15;

    articlePage.drawRectangle({
      x: margin - 5,
      y: articleYPos - 95,
      width: pageWidth + 10,
      height: 100,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });

    const titleLines = wrapText(article.title, 85);
    articlePage.drawText(titleLines[0], {
      x: margin + 5,
      y: articleYPos,
      size: 13,
      font: headingFontBold,
      color: rgb(0, 0, 0),
    });

    if (titleLines.length > 1) {
      articleYPos -= 14;
      articlePage.drawText(titleLines.slice(1).join(" "), {
        x: margin + 5,
        y: articleYPos,
        size: 11,
        font: headingFontBold,
        color: rgb(0, 0, 0),
      });
    }

    articleYPos -= 14;

    const metadataText = `${article.source || "Unknown Source"} • ${article.pubDate || "Date N/A"}`;
    articlePage.drawText(metadataText, {
      x: margin + 5,
      y: articleYPos,
      size: 7,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    const sentimentColor =
      article.sentiment === "positive"
        ? rgb(0.2, 0.7, 0.2)
        : article.sentiment === "negative"
          ? rgb(0.9, 0.2, 0.2)
          : rgb(0.5, 0.5, 0.5);

    articlePage.drawRectangle({
      x: 595 - margin - 85,
      y: articleYPos - 10,
      width: 80,
      height: 12,
      color: sentimentColor,
      borderWidth: 0,
    });

    articlePage.drawText(article.sentiment.toUpperCase(), {
      x: 595 - margin - 82,
      y: articleYPos - 8,
      size: 7,
      font: contentFontBold,
      color: rgb(1, 1, 1),
    });

    articleYPos -= 12;

    const summaryLines = wrapText(article.summary, 90);
    const linesToShow = Math.min(summaryLines.length, 3);

    for (let j = 0; j < linesToShow; j++) {
      articlePage.drawText(summaryLines[j], {
        x: margin + 5,
        y: articleYPos,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      articleYPos -= 10;
    }

    if (summaryLines.length > 3) {
      articlePage.drawText("...", {
        x: margin + 5,
        y: articleYPos,
        size: 8,
        font: contentFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    articleYPos -= 15;
    currentPageArticles++;

    if (articleYPos < 120 && pageNumber < 5) {
      addFooter(articlePage, pageNumber);
      pageNumber++;
      articlePage = pdfDoc.addPage([595, 842]);
      articleYPos = addHeader(articlePage, "TOP STORIES (CONTINUED)");
      currentPageArticles = 0;
    }
  }

  if (pageNumber <= 5) {
    addFooter(articlePage, pageNumber);
  }

  let page = pdfDoc.addPage([595, 842]);
  let yPosition = addHeader(page, "SENTIMENT ANALYSIS & KEY METRICS");
  pageNumber++;

  page.drawText("SENTIMENT DISTRIBUTION", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 20;

  const sentimentData = [
    { label: "POSITIVE", value: sentimentCounts.positive, color: rgb(0.2, 0.7, 0.2) },
    { label: "NEUTRAL", value: sentimentCounts.neutral, color: rgb(0.6, 0.6, 0.6) },
    { label: "NEGATIVE", value: sentimentCounts.negative, color: rgb(0.9, 0.2, 0.2) },
  ];

  const maxSentiment = Math.max(...sentimentData.map(d => d.value), 1);
  const barSpacing = (pageWidth - 40) / 3;

  for (let i = 0; i < sentimentData.length; i++) {
    const barX = margin + i * barSpacing + 15;
    const barWidth = barSpacing - 30;
    const barHeight = 120;
    const dataHeight = (sentimentData[i].value / maxSentiment) * barHeight;

    page.drawRectangle({
      x: barX,
      y: yPosition - dataHeight,
      width: barWidth,
      height: dataHeight,
      color: sentimentData[i].color,
      borderWidth: 0,
    });

    page.drawText(sentimentData[i].value.toString(), {
      x: barX + barWidth / 2 - 10,
      y: yPosition - dataHeight + 5,
      size: 10,
      font: headingFontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(sentimentData[i].label, {
      x: barX,
      y: yPosition - barHeight - 15,
      size: 9,
      font: contentFontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  yPosition -= 180;

  page.drawRectangle({
    x: margin,
    y: yPosition - 120,
    width: pageWidth,
    height: 120,
    color: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });

  page.drawText("KEY METRICS", {
    x: margin + 15,
    y: yPosition - 10,
    size: 11,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  const metrics = [
    { label: "Total Articles", value: articles.length.toString() },
    { label: "Unique Topics", value: Object.keys(topicCounts).length.toString() },
    { label: "Avg Reliability", value: `${(calculateAverageReliability(articles) * 100).toFixed(0)}%` },
    { label: "Coverage Span", value: `${Object.keys(sourceCount).length} sources` },
  ];

  let metricX = margin + 20;
  let metricY = yPosition - 35;
  const metricWidth = (pageWidth - 40) / 2;

  for (let i = 0; i < metrics.length; i++) {
    page.drawText(metrics[i].label, {
      x: metricX,
      y: metricY,
      size: 8,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    page.drawText(metrics[i].value, {
      x: metricX,
      y: metricY - 18,
      size: 16,
      font: headingFontBold,
      color: rgb(0, 0.5, 0.9),
    });

    if (i % 2 === 1) {
      metricX = margin + 20;
      metricY -= 60;
    } else {
      metricX += metricWidth;
    }
  }

  yPosition -= 160;

  page.drawText("TOP SOURCES", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 20;

  const sortedSources = Object.entries(sourceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  page.drawRectangle({
    x: margin,
    y: yPosition - (sortedSources.length * 18 + 25),
    width: pageWidth,
    height: sortedSources.length * 18 + 25,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });

  page.drawRectangle({
    x: margin,
    y: yPosition - 20,
    width: pageWidth,
    height: 20,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText("SOURCE", {
    x: margin + 10,
    y: yPosition - 15,
    size: 9,
    font: headingFontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText("ARTICLES", {
    x: 595 - margin - 80,
    y: yPosition - 15,
    size: 9,
    font: headingFontBold,
    color: rgb(1, 1, 1),
  });

  let sourceRowY = yPosition - 35;
  for (const [source, count] of sortedSources) {
    const bgColor = sourceRowY % 36 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(1, 1, 1);
    page.drawRectangle({
      x: margin,
      y: sourceRowY - 16,
      width: pageWidth,
      height: 16,
      color: bgColor,
      borderWidth: 0,
    });

    page.drawText(source, {
      x: margin + 10,
      y: sourceRowY - 12,
      size: 8,
      font: contentFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(count.toString(), {
      x: 595 - margin - 70,
      y: sourceRowY - 12,
      size: 8,
      font: contentFontBold,
      color: rgb(0, 0.5, 0.9),
    });

    sourceRowY -= 18;
  }

  addFooter(page, pageNumber);

  page = pdfDoc.addPage([595, 842]);
  yPosition = addHeader(page, "TOPIC ANALYSIS & TRENDS");
  pageNumber++;

  page.drawText("COVERAGE BY TOPIC", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 20;

  const sortedTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const maxTopicCount = Math.max(...sortedTopics.map(t => t[1]), 1);

  for (const [topic, count] of sortedTopics) {
    const barLength = (count / maxTopicCount) * (pageWidth - 150);
    const topicColor = rgb(Math.random() * 0.5 + 0.2, Math.random() * 0.5 + 0.2, Math.random() * 0.5 + 0.5);

    page.drawText(topic, {
      x: margin,
      y: yPosition,
      size: 9,
      font: contentFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawRectangle({
      x: margin + 120,
      y: yPosition - 8,
      width: barLength,
      height: 12,
      color: topicColor,
      borderWidth: 0,
    });

    page.drawText(count.toString(), {
      x: margin + 130 + barLength,
      y: yPosition - 6,
      size: 8,
      font: headingFontBold,
      color: rgb(0, 0, 0),
    });

    yPosition -= 20;
  }

  yPosition -= 15;

  page.drawText("SENTIMENT BY TOPIC", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 20;

  page.drawRectangle({
    x: margin,
    y: yPosition - (Array.from(topicSentiments.entries()).slice(0, 6).length * 28 + 25),
    width: pageWidth,
    height: Array.from(topicSentiments.entries()).slice(0, 6).length * 28 + 25,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });

  page.drawRectangle({
    x: margin,
    y: yPosition - 20,
    width: pageWidth,
    height: 20,
    color: rgb(0.15, 0.15, 0.15),
  });

  page.drawText("TOPIC", {
    x: margin + 10,
    y: yPosition - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText("+ POSITIVE", {
    x: margin + 130,
    y: yPosition - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(0.5, 1, 0.5),
  });

  page.drawText("- NEGATIVE", {
    x: margin + 220,
    y: yPosition - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(1, 0.5, 0.5),
  });

  page.drawText("~ NEUTRAL", {
    x: margin + 310,
    y: yPosition - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(0.8, 0.8, 0.8),
  });

  let topicRowY = yPosition - 35;
  for (const [topic, sentiments] of Array.from(topicSentiments.entries()).slice(0, 6)) {
    const bgColor = topicRowY % 56 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(1, 1, 1);
    page.drawRectangle({
      x: margin,
      y: topicRowY - 24,
      width: pageWidth,
      height: 24,
      color: bgColor,
      borderWidth: 0,
    });

    page.drawText(topic.substring(0, 20), {
      x: margin + 10,
      y: topicRowY - 12,
      size: 8,
      font: contentFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(sentiments.positive.toString(), {
      x: margin + 130,
      y: topicRowY - 12,
      size: 8,
      font: contentFontBold,
      color: rgb(0, 0.6, 0),
    });

    page.drawText(sentiments.negative.toString(), {
      x: margin + 220,
      y: topicRowY - 12,
      size: 8,
      font: contentFontBold,
      color: rgb(0.9, 0, 0),
    });

    page.drawText(sentiments.neutral.toString(), {
      x: margin + 310,
      y: topicRowY - 12,
      size: 8,
      font: contentFontBold,
      color: rgb(0.5, 0.5, 0.5),
    });

    topicRowY -= 28;
  }

  addFooter(page, pageNumber);

  page = pdfDoc.addPage([595, 842]);
  yPosition = addHeader(page, "KEY PHRASES & INSIGHTS");
  pageNumber++;

  page.drawText("TRENDING KEYWORDS", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 20;

  const topPhrases = Array.from(keyPhrases.entries()).slice(0, 12);
  const phraseBoxWidth = (pageWidth - 30) / 3;

  let phraseX = margin;
  let phraseY = yPosition;
  let phraseCount = 0;

  for (const [phrase, count] of topPhrases) {
    const bgColor = rgb(0.05 + phraseCount * 0.08, 0.3 + phraseCount * 0.04, 0.8 - phraseCount * 0.03);

    page.drawRectangle({
      x: phraseX,
      y: phraseY - 32,
      width: phraseBoxWidth - 10,
      height: 32,
      color: bgColor,
      borderWidth: 0,
    });

    page.drawText(phrase, {
      x: phraseX + 8,
      y: phraseY - 12,
      size: 9,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(`${count} mentions`, {
      x: phraseX + 8,
      y: phraseY - 23,
      size: 7,
      font: contentFont,
      color: rgb(0.9, 0.9, 0.9),
    });

    phraseX += phraseBoxWidth;
    if ((phraseCount + 1) % 3 === 0) {
      phraseX = margin;
      phraseY -= 40;
    }
    phraseCount++;
  }

  yPosition = phraseY - 40;

  page.drawText("ACTIONABLE RECOMMENDATIONS", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 25;

  for (let i = 0; i < recommendations.length; i++) {
    const recLines = wrapText(recommendations[i], 90);
    
    page.drawRectangle({
      x: margin,
      y: yPosition - (recLines.length * 12 + 15),
      width: pageWidth,
      height: recLines.length * 12 + 15,
      color: rgb(0.95, 0.98, 1),
      borderColor: rgb(0, 0.5, 0.9),
      borderWidth: 1,
    });

    page.drawText(`${i + 1}.`, {
      x: margin + 10,
      y: yPosition - 12,
      size: 9,
      font: headingFontBold,
      color: rgb(0, 0.5, 0.9),
    });

    let recY = yPosition - 12;
    for (const line of recLines) {
      page.drawText(line, {
        x: margin + 25,
        y: recY,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      recY -= 12;
    }

    yPosition -= recLines.length * 12 + 25;
  }

  addFooter(page, pageNumber);

  page = pdfDoc.addPage([595, 842]);
  yPosition = addHeader(page, "HISTORICAL TRENDS & SUMMARY");
  pageNumber++;

  page.drawText("7-DAY TREND ANALYSIS", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 20;

  const historicalDates = Object.keys(historicalDigests).sort().slice(-7);
  
  if (historicalDates.length > 0) {
    page.drawRectangle({
      x: margin,
      y: yPosition - (historicalDates.length * 22 + 30),
      width: pageWidth,
      height: historicalDates.length * 22 + 30,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });

    page.drawRectangle({
      x: margin,
      y: yPosition - 25,
      width: pageWidth,
      height: 25,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText("DATE", {
      x: margin + 10,
      y: yPosition - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("ARTICLES", {
      x: margin + 100,
      y: yPosition - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("SENTIMENT", {
      x: margin + 200,
      y: yPosition - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("TOP TOPIC", {
      x: margin + 320,
      y: yPosition - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    let histRowY = yPosition - 45;
    for (const date of historicalDates) {
      const digest = historicalDigests[date];
      const totalArticles = Object.values(digest.topicCounts).reduce((a, b) => a + b, 0);
      const topTopic = Object.entries(digest.topicCounts).sort((a, b) => b[1] - a[1])[0];
      const dominantSentiment = Object.entries(digest.sentimentCounts).sort((a, b) => b[1] - a[1])[0][0];

      const bgColor = histRowY % 44 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(1, 1, 1);
      page.drawRectangle({
        x: margin,
        y: histRowY - 20,
        width: pageWidth,
        height: 20,
        color: bgColor,
        borderWidth: 0,
      });

      page.drawText(date, {
        x: margin + 10,
        y: histRowY - 14,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText(totalArticles.toString(), {
        x: margin + 100,
        y: histRowY - 14,
        size: 8,
        font: contentFontBold,
        color: rgb(0, 0.5, 0.9),
      });

      page.drawText(dominantSentiment, {
        x: margin + 200,
        y: histRowY - 14,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText((topTopic?.[0] || "N/A").substring(0, 25), {
        x: margin + 320,
        y: histRowY - 14,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });

      histRowY -= 22;
    }

    yPosition -= historicalDates.length * 22 + 50;
  }

  page.drawText("EXECUTIVE SUMMARY", {
    x: margin,
    y: yPosition,
    size: 12,
    font: headingFontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  yPosition -= 20;

  const totalArticles = articles.length;
  const avgReliability = calculateAverageReliability(articles);
  const dominantTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];
  const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0];

  const summaryText = `Today's digest analyzed ${totalArticles} articles across ${Object.keys(topicCounts).length} distinct topics. The dominant coverage area is "${dominantTopic?.[0] || "N/A"}" representing ${dominantTopic?.[1] || 0} articles. Sentiment analysis indicates a "${dominantSentiment?.[0] || "N/A"}" overall tone with an average source reliability rating of ${(avgReliability * 100).toFixed(0)}%. The analysis covers ${Object.keys(sourceCount).length} primary news sources, providing comprehensive market coverage.`;

  const summaryLines = wrapText(summaryText, 95);
  for (const line of summaryLines) {
    page.drawText(line, {
      x: margin,
      y: yPosition,
      size: 8,
      font: contentFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    yPosition -= 11;
  }

  addFooter(page, pageNumber);

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const fileName = `digest_${dayjs().format("YYYY_MM_DD_HHmmss")}.pdf`;
  const publicUrl = await uploadPDFToSupabase(new Uint8Array(pdfBuffer), userId, fileName);

  await savePDFMetadata(userId, fileName, publicUrl, {
    articlesCount: articles.length,
    hasHistorical: Object.keys(historicalDigests).length > 0,
    generatedAt: new Date().toISOString(),
    fileSizeBytes: pdfBuffer.length,
  });

  return publicUrl;
}