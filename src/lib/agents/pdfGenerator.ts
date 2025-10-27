import { PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";
import dayjs from "dayjs";
import { uploadPDFToSupabase, savePDFMetadata } from "../storage";

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

function sanitizeTextForPDF(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
}

function getTopicColor(index: number): ReturnType<typeof rgb> {
  const colors = [
    rgb(0.1, 0.5, 0.9),
    rgb(0.9, 0.3, 0.1),
    rgb(0.1, 0.8, 0.3),
    rgb(0.8, 0.6, 0.1),
    rgb(0.6, 0.1, 0.8),
    rgb(0.1, 0.6, 0.6),
    rgb(0.8, 0.1, 0.3),
    rgb(0.5, 0.5, 0.1),
  ];
  return colors[index % colors.length];
}

function drawGradientBar(page: PDFPage, x: number, y: number, width: number, height: number, percentage: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });

  page.drawRectangle({
    x,
    y,
    width: (width * percentage) / 100,
    height,
    color,
    borderWidth: 0,
  });
}

export async function generateDigestPDF(
  articles: Article[],
  historicalDigests: Record<string, { topicCounts: Record<string, number>; sentimentCounts: Record<string, number> }>,
  userId: string,
  language = "en",
  weather?: { location: string; temperature: number; condition: string; humidity?: number; windSpeed?: number }
): Promise<string | null> {
  // PDF is always generated in English, regardless of language setting
  // Language setting is only for highlights and audio
  let articlesToProcess = articles;

  const sanitizedArticles = articlesToProcess.map(article => ({
    ...article,
    title: sanitizeTextForPDF(article.title),
    summary: sanitizeTextForPDF(article.summary),
    source: article.source ? sanitizeTextForPDF(article.source) : undefined,
    topic: sanitizeTextForPDF(article.topic),
  }));

  const pdfDoc = await PDFDocument.create();
  
  // PDF is always in English, so use standard English fonts
  const contentFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const contentFontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const headingFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const headingFontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  const topicCounts: Record<string, number> = {};
  const sourceCount: Record<string, number> = {};
  const topicSentiments = calculateSentimentByTopic(sanitizedArticles);
  
  for (const a of sanitizedArticles) {
    sentimentCounts[a.sentiment]++;
    topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1;
    if (a.source) {
      sourceCount[a.source] = (sourceCount[a.source] || 0) + 1;
    }
  }

  const margin = 45;
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

  // PDF is always in English, regardless of language setting
  const displayLanguage = "English";
  const currentDate = dayjs().format("dddd, MMMM DD, YYYY");
  const generatedTime = dayjs().format("HH:mm");

  let pageNumber = 1;

  const addHeader = (page: PDFPage, isFirst: boolean = false) => {
    if (isFirst) {
      page.drawRectangle({
        x: 0,
        y: 760,
        width: 595,
        height: 82,
        color: rgb(0.08, 0.2, 0.4),
      });

      page.drawText("DAILY MARKET DIGEST", {
        x: margin,
        y: 820,
        size: 28,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      });

      page.drawText("AI-Powered News Intelligence & Market Analysis", {
        x: margin,
        y: 795,
        size: 10,
        font: contentFont,
        color: rgb(0.8, 0.9, 1),
      });

      return 740;
    } else {
      page.drawRectangle({
        x: margin,
        y: 790,
        width: pageWidth,
        height: 25,
        color: rgb(0.08, 0.2, 0.4),
      });

      page.drawText("Daily Market Digest", {
        x: margin + 10,
        y: 800,
        size: 12,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      });

      return 775;
    }
  };

  const addFooter = (page: PDFPage, num: number) => {
    page.drawLine({
      start: { x: margin, y: 45 },
      end: { x: 595 - margin, y: 45 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    page.drawText(currentDate, {
      x: margin,
      y: 32,
      size: 8,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    page.drawText(`${dayjs().format("YYYY-MM-DD")} | ${generatedTime}`, {
      x: 595 - margin - 100,
      y: 32,
      size: 8,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    page.drawText(`Page ${num}`, {
      x: 595 - margin - 20,
      y: 32,
      size: 8,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    });
  };

  let page = pdfDoc.addPage([595, 842]);
  let yPos = addHeader(page, true);

  yPos -= 10;

  const totalArticles = sanitizedArticles.length;
  const avgReliability = calculateAverageReliability(sanitizedArticles);
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
  const topSources = Object.entries(sourceCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  page.drawRectangle({
    x: margin,
    y: yPos - 80,
    width: pageWidth,
    height: 80,
    color: rgb(0.94, 0.96, 0.99),
    borderColor: rgb(0.08, 0.2, 0.4),
    borderWidth: 1.5,
  });

  page.drawText("EXECUTIVE SUMMARY", {
    x: margin + 12,
    y: yPos - 15,
    size: 11,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  const summaryLines = wrapText(
    `This digest covers ${totalArticles} articles from ${topSources.length} major news sources. Market sentiment is predominantly ${Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0]} with ${topTopics[0]?.[1] || 0} articles focused on ${topTopics[0]?.[0] || "general"} developments. Source reliability averages ${(avgReliability * 100).toFixed(0)}%, indicating high-quality coverage.`,
    95
  );

  let summaryY = yPos - 32;
  for (const line of summaryLines) {
    page.drawText(line, {
      x: margin + 12,
      y: summaryY,
      size: 8,
      font: contentFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    summaryY -= 10;
  }

  yPos -= 100;

  page.drawText("KEY STATISTICS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  const stats = [
    { label: "Total Articles", value: totalArticles.toString(), unit: "" },
    { label: "Topics Covered", value: topTopics.length.toString(), unit: "" },
    { label: "Source Count", value: topSources.length.toString(), unit: "" },
    { label: "Reliability Score", value: (avgReliability * 100).toFixed(0), unit: "%" },
  ];

  const statWidth = (pageWidth - 30) / 4;

  for (let i = 0; i < stats.length; i++) {
    const statX = margin + 10 + i * statWidth;

    page.drawRectangle({
      x: statX,
      y: yPos - 65,
      width: statWidth - 5,
      height: 65,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.5,
    });

    page.drawText(stats[i].label, {
      x: statX + 8,
      y: yPos - 15,
      size: 7,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    page.drawText(stats[i].value + stats[i].unit, {
      x: statX + 8,
      y: yPos - 40,
      size: 20,
      font: headingFontBold,
      color: rgb(0.08, 0.2, 0.4),
    });
  }

  yPos -= 80;

  page.drawText("SENTIMENT BREAKDOWN", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  const sentimentTotal = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral;
  const positivePercent = sentimentTotal > 0 ? (sentimentCounts.positive / sentimentTotal) * 100 : 0;
  const negativePercent = sentimentTotal > 0 ? (sentimentCounts.negative / sentimentTotal) * 100 : 0;
  const neutralPercent = sentimentTotal > 0 ? (sentimentCounts.neutral / sentimentTotal) * 100 : 0;

  const sentiments = [
    { label: "Positive", value: sentimentCounts.positive, percent: positivePercent, color: rgb(0.2, 0.7, 0.2) },
    { label: "Neutral", value: sentimentCounts.neutral, percent: neutralPercent, color: rgb(0.5, 0.5, 0.5) },
    { label: "Negative", value: sentimentCounts.negative, percent: negativePercent, color: rgb(0.9, 0.2, 0.2) },
  ];

  for (const sentiment of sentiments) {
    page.drawText(`${sentiment.label}`, {
      x: margin,
      y: yPos,
      size: 9,
      font: contentFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    drawGradientBar(page, margin + 80, yPos - 8, 200, 14, sentiment.percent, sentiment.color);

    page.drawText(`${sentiment.value} (${sentiment.percent.toFixed(1)}%)`, {
      x: margin + 290,
      y: yPos,
      size: 9,
      font: contentFontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    yPos -= 22;
  }

  addFooter(page, pageNumber);
  pageNumber++;

  page = pdfDoc.addPage([595, 842]);
  yPos = addHeader(page);

  page.drawText("TOP STORIES", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  const articlesToShow = Math.min(sanitizedArticles.length, 5);

  for (let i = 0; i < articlesToShow; i++) {
    const article = sanitizedArticles[i];
    const sentimentColor =
      article.sentiment === "positive"
        ? rgb(0.2, 0.7, 0.2)
        : article.sentiment === "negative"
          ? rgb(0.9, 0.2, 0.2)
          : rgb(0.5, 0.5, 0.5);

    page.drawRectangle({
      x: margin,
      y: yPos - 75,
      width: pageWidth,
      height: 75,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });

    const titleLines = wrapText(article.title, 80);
    page.drawText(titleLines[0], {
      x: margin + 10,
      y: yPos - 15,
      size: 10,
      font: headingFontBold,
      color: rgb(0, 0, 0),
    });

    page.drawText(`${article.source || "Unknown"} • ${article.pubDate || "N/A"}`, {
      x: margin + 10,
      y: yPos - 30,
      size: 7,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    });

    const summaryLines = wrapText(article.summary, 85);
    let summaryY = yPos - 42;
    for (let j = 0; j < Math.min(summaryLines.length, 2); j++) {
      page.drawText(summaryLines[j], {
        x: margin + 10,
        y: summaryY,
        size: 7,
        font: contentFont,
        color: rgb(0.3, 0.3, 0.3),
      });
      summaryY -= 9;
    }

    page.drawRectangle({
      x: 595 - margin - 80,
      y: yPos - 28,
      width: 75,
      height: 14,
      color: sentimentColor,
    });

    page.drawText(article.sentiment.toUpperCase(), {
      x: 595 - margin - 77,
      y: yPos - 25,
      size: 7,
      font: contentFontBold,
      color: rgb(1, 1, 1),
    });

    yPos -= 90;
  }

  addFooter(page, pageNumber);
  pageNumber++;

  page = pdfDoc.addPage([595, 842]);
  yPos = addHeader(page);

  page.drawText("TOPIC DISTRIBUTION", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  const maxTopic = Math.max(...topTopics.map(t => t[1]), 1);

  for (let i = 0; i < Math.min(topTopics.length, 6); i++) {
    const [topic, count] = topTopics[i];
    const percent = (count / maxTopic) * 100;
    const topicColor = getTopicColor(i);

    page.drawText(topic, {
      x: margin,
      y: yPos,
      size: 9,
      font: contentFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    drawGradientBar(page, margin + 140, yPos - 8, 250, 14, percent, topicColor);

    page.drawText(`${count} articles`, {
      x: margin + 400,
      y: yPos,
      size: 9,
      font: contentFontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    yPos -= 22;
  }

  yPos -= 15;

  page.drawText("SENTIMENT BY TOPIC", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  page.drawRectangle({
    x: margin,
    y: yPos - (Math.min(topTopics.length, 5) * 24 + 25),
    width: pageWidth,
    height: Math.min(topTopics.length, 5) * 24 + 25,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 0.5,
  });

  page.drawRectangle({
    x: margin,
    y: yPos - 20,
    width: pageWidth,
    height: 20,
    color: rgb(0.08, 0.2, 0.4),
  });

  page.drawText("TOPIC", {
    x: margin + 10,
    y: yPos - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText("POSITIVE", {
    x: margin + 180,
    y: yPos - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(0.7, 1, 0.7),
  });

  page.drawText("NEGATIVE", {
    x: margin + 270,
    y: yPos - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(1, 0.7, 0.7),
  });

  page.drawText("NEUTRAL", {
    x: margin + 360,
    y: yPos - 15,
    size: 8,
    font: headingFontBold,
    color: rgb(0.9, 0.9, 0.9),
  });

  let topicRowY = yPos - 38;
  for (let i = 0; i < Math.min(topTopics.length, 5); i++) {
    const topic = topTopics[i][0];
    const sentiments = topicSentiments.get(topic) || { positive: 0, negative: 0, neutral: 0 };

    const bgColor = i % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1);
    page.drawRectangle({
      x: margin,
      y: topicRowY - 20,
      width: pageWidth,
      height: 20,
      color: bgColor,
    });

    page.drawText(topic.substring(0, 25), {
      x: margin + 10,
      y: topicRowY - 15,
      size: 8,
      font: contentFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    page.drawText(sentiments.positive.toString(), {
      x: margin + 180,
      y: topicRowY - 15,
      size: 8,
      font: contentFontBold,
      color: rgb(0.2, 0.7, 0.2),
    });

    page.drawText(sentiments.negative.toString(), {
      x: margin + 270,
      y: topicRowY - 15,
      size: 8,
      font: contentFontBold,
      color: rgb(0.9, 0.2, 0.2),
    });

    page.drawText(sentiments.neutral.toString(), {
      x: margin + 360,
      y: topicRowY - 15,
      size: 8,
      font: contentFontBold,
      color: rgb(0.5, 0.5, 0.5),
    });

    topicRowY -= 24;
  }

  addFooter(page, pageNumber);
  pageNumber++;

  page = pdfDoc.addPage([595, 842]);
  yPos = addHeader(page);

  page.drawText("NEWS SOURCES", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  const maxSource = Math.max(...topSources.map(s => s[1]), 1);

  for (const [source, count] of topSources) {
    const percent = (count / maxSource) * 100;

    page.drawRectangle({
      x: margin,
      y: yPos - 35,
      width: pageWidth,
      height: 35,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });

    page.drawText(source, {
      x: margin + 12,
      y: yPos - 12,
      size: 9,
      font: contentFontBold,
      color: rgb(0.08, 0.2, 0.4),
    });

    drawGradientBar(page, margin + 200, yPos - 22, 200, 12, percent, rgb(0.1, 0.5, 0.9));

    page.drawText(`${count} articles`, {
      x: margin + 410,
      y: yPos - 12,
      size: 9,
      font: contentFontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    yPos -= 45;
  }

  yPos -= 10;

  page.drawText("MARKET INSIGHTS & TRENDS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  const insights = [];

  const topicLeader = topTopics[0];
  if (topicLeader) {
    insights.push(`Market focus: ${topicLeader[0]} dominates coverage with ${topicLeader[1]} articles (${((topicLeader[1] / totalArticles) * 100).toFixed(1)}% of total).`);
  }

  const sentimentLeader = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0];
  const sentimentPercent = sentimentTotal > 0 ? ((sentimentLeader[1] / totalArticles) * 100).toFixed(1) : "0";
  insights.push(`Sentiment analysis: ${sentimentPercent}% of coverage is ${sentimentLeader[0]}, indicating ${sentimentLeader[0] === "positive" ? "bullish market outlook" : sentimentLeader[0] === "negative" ? "bearish market conditions" : "neutral market stance"}.`);

  if (avgReliability >= 0.8) {
    insights.push(`Data quality: High credibility sources dominate (${(avgReliability * 100).toFixed(0)}% reliability), ensuring reliable market intelligence.`);
  }

  if (topSources.length > 0 && topSources[0][1] > totalArticles * 0.3) {
    insights.push(`Source concentration: Top source accounts for ${((topSources[0][1] / totalArticles) * 100).toFixed(1)}% of coverage, indicating concentrated media focus.`);
  }

  for (let i = 0; i < insights.length; i++) {
    const lines = wrapText(insights[i], 100);
    const boxHeight = lines.length * 11 + 16;

    page.drawRectangle({
      x: margin,
      y: yPos - boxHeight,
      width: pageWidth,
      height: boxHeight,
      color: rgb(0.94, 0.97, 1),
      borderColor: rgb(0.08, 0.2, 0.4),
      borderWidth: 1,
    });

    page.drawText(`• ${lines[0]}`, {
      x: margin + 12,
      y: yPos - 12,
      size: 8,
      font: contentFont,
      color: rgb(0.1, 0.1, 0.1),
    });

    let insightY = yPos - 22;
    for (let j = 1; j < lines.length; j++) {
      page.drawText(lines[j], {
        x: margin + 15,
        y: insightY,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      insightY -= 11;
    }

    yPos -= boxHeight + 12;
  }

  addFooter(page, pageNumber);
  pageNumber++;

  if (Object.keys(historicalDigests).length > 0) {
    page = pdfDoc.addPage([595, 842]);
    yPos = addHeader(page);

    page.drawText("7-DAY HISTORICAL ANALYSIS", {
      x: margin,
      y: yPos,
      size: 13,
      font: headingFontBold,
      color: rgb(0.08, 0.2, 0.4),
    });

    yPos -= 22;

    const historicalDates = Object.keys(historicalDigests).sort().slice(-7);

    page.drawRectangle({
      x: margin,
      y: yPos - (historicalDates.length * 20 + 30),
      width: pageWidth,
      height: historicalDates.length * 20 + 30,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.5,
    });

    page.drawRectangle({
      x: margin,
      y: yPos - 25,
      width: pageWidth,
      height: 25,
      color: rgb(0.08, 0.2, 0.4),
    });

    page.drawText("DATE", {
      x: margin + 10,
      y: yPos - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("ARTICLES", {
      x: margin + 100,
      y: yPos - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("SENTIMENT", {
      x: margin + 200,
      y: yPos - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("TOP TOPIC", {
      x: margin + 330,
      y: yPos - 17,
      size: 8,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    });

    let histRowY = yPos - 45;
    for (const date of historicalDates) {
      const digest = historicalDigests[date];
      const totalArt = Object.values(digest.topicCounts).reduce((a, b) => a + b, 0);
      const topicHist = Object.entries(digest.topicCounts).sort((a, b) => b[1] - a[1])[0];
      const sentimentHist = Object.entries(digest.sentimentCounts).sort((a, b) => b[1] - a[1])[0][0];

      const bgColor = histRowY % 40 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1);
      page.drawRectangle({
        x: margin,
        y: histRowY - 18,
        width: pageWidth,
        height: 18,
        color: bgColor,
      });

      page.drawText(date, {
        x: margin + 10,
        y: histRowY - 12,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText(totalArt.toString(), {
        x: margin + 100,
        y: histRowY - 12,
        size: 8,
        font: contentFontBold,
        color: rgb(0.1, 0.5, 0.9),
      });

      page.drawText(sentimentHist, {
        x: margin + 200,
        y: histRowY - 12,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });

      page.drawText((topicHist?.[0] || "N/A").substring(0, 20), {
        x: margin + 330,
        y: histRowY - 12,
        size: 8,
        font: contentFont,
        color: rgb(0.2, 0.2, 0.2),
      });

      histRowY -= 20;
    }

    addFooter(page, pageNumber);
    pageNumber++;
  }

  page = pdfDoc.addPage([595, 842]);
  yPos = addHeader(page);

  page.drawText("MARKET ANALYSIS & RECOMMENDATIONS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.08, 0.2, 0.4),
  });

  yPos -= 22;

  const recommendations = [];

  if (positivePercent > 50) {
    recommendations.push("BULLISH SIGNAL: Majority positive sentiment suggests favorable market conditions. Consider increase in monitoring for growth opportunities.");
  } else if (negativePercent > 40) {
    recommendations.push("BEARISH ALERT: High negative sentiment detected. Exercise caution and increase risk management protocols.");
  } else {
    recommendations.push("NEUTRAL OUTLOOK: Balanced sentiment distribution suggests stable market conditions. Maintain current monitoring levels.");
  }

  if (topTopics.length > 1 && topTopics[0][1] > topTopics[1][1] * 1.5) {
    recommendations.push("TREND CONCENTRATION: Single topic dominates coverage. Monitor for potential market volatility in this sector.");
  }

  if (avgReliability < 0.7) {
    recommendations.push("DATA QUALITY WARNING: Source reliability below optimal threshold. Recommend cross-referencing with additional sources.");
  }

  if (topSources.length < 3) {
    recommendations.push("SOURCE DIVERSIFICATION: Limited source variety detected. Expand monitoring network to reduce bias risk.");
  }

  for (let i = 0; i < recommendations.length; i++) {
    const lines = wrapText(recommendations[i], 100);
    const boxHeight = lines.length * 11 + 20;

    const bgColor = recommendations[i].includes("BULLISH")
      ? rgb(0.94, 1, 0.94)
      : recommendations[i].includes("BEARISH")
        ? rgb(1, 0.94, 0.94)
        : recommendations[i].includes("WARNING")
          ? rgb(1, 0.97, 0.94)
          : rgb(0.94, 0.96, 0.99);

    const borderColor = recommendations[i].includes("BULLISH")
      ? rgb(0.2, 0.7, 0.2)
      : recommendations[i].includes("BEARISH")
        ? rgb(0.9, 0.2, 0.2)
        : recommendations[i].includes("WARNING")
          ? rgb(1, 0.6, 0.1)
          : rgb(0.08, 0.2, 0.4);

    page.drawRectangle({
      x: margin,
      y: yPos - boxHeight,
      width: pageWidth,
      height: boxHeight,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1.5,
    });

    page.drawText(lines[0], {
      x: margin + 12,
      y: yPos - 13,
      size: 9,
      font: headingFontBold,
      color: borderColor,
    });

    let recY = yPos - 24;
    for (let j = 1; j < lines.length; j++) {
      page.drawText(lines[j], {
        x: margin + 12,
        y: recY,
        size: 8,
        font: contentFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      recY -= 11;
    }

    yPos -= boxHeight + 12;
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