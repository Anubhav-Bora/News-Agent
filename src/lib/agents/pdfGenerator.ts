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

export async function generateDigestPDF(
  articles: Article[],
  historicalDigests: Record<string, { topicCounts: Record<string, number>; sentimentCounts: Record<string, number> }>,
  userId: string
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  const topicCounts: Record<string, number> = {};
  const sourceCount: Record<string, number> = {};
  const topicSentiments = calculateSentimentByTopic(articles);
  const keyPhrases = extractKeyPhrases(articles);
  
  for (const a of articles) {
    sentimentCounts[a.sentiment]++;
    topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1;
    if (a.source) {
      sourceCount[a.source] = (sourceCount[a.source] || 0) + 1;
    }
  }

  const recommendations = generateRecommendations(articles, topicCounts, sentimentCounts);

  const margin = 35;
  const pageWidth = 595 - 2 * margin;

  // Helper function to add header
  const addHeader = (page: PDFPage, title: string) => {
    let yPos = 790;
    page.drawText("THE DAILY DIGEST", { x: margin, y: yPos, size: 10, font: timesBold, color: rgb(0, 0, 0) });
    page.drawText(title, { x: 595 - margin - 120, y: yPos, size: 10, font: timesBold, color: rgb(0, 0, 0) });
    yPos -= 8;
    page.drawLine({ start: { x: margin, y: yPos }, end: { x: 595 - margin, y: yPos }, thickness: 1.5, color: rgb(0, 0, 0) });
    return yPos - 20;
  };

  // Helper function to add footer
  const addFooter = (page: PDFPage, pageNum: number) => {
    page.drawLine({ start: { x: margin, y: 70 }, end: { x: 595 - margin, y: 70 }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawText(`Page ${pageNum}`, { x: 595 - margin - 30, y: 58, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
  };

  // PAGES 1-5: Article Display Pages
  let pageNumber = 1;
  const articlesPerPage = 3;
  let currentPageArticles = 0;
  let articlePage = pdfDoc.addPage([595, 842]);
  let articleYPos = addHeader(articlePage, "TOP STORIES");

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    // Add new page if needed
    if (currentPageArticles >= articlesPerPage) {
      addFooter(articlePage, pageNumber);
      pageNumber++;
      if (pageNumber <= 5) {
        articlePage = pdfDoc.addPage([595, 842]);
        articleYPos = addHeader(articlePage, `TOP STORIES (CONTINUED)`);
        currentPageArticles = 0;
      } else {
        break; // Stop after 5 pages
      }
    }

    articleYPos -= 20;

    // Article title
    const titleLines = wrapText(article.title, 80);
    articlePage.drawText(titleLines[0], { x: margin, y: articleYPos, size: 12, font: timesBold, color: rgb(0, 0, 0) });
    if (titleLines.length > 1) {
      articleYPos -= 14;
      articlePage.drawText(titleLines.slice(1).join(" "), { x: margin, y: articleYPos, size: 11, font: timesBold, color: rgb(0, 0, 0) });
    }
    articleYPos -= 16;

    // Metadata row (source, date, sentiment)
    const metadataText = `${article.source || "Unknown Source"} • ${article.pubDate || "Date N/A"}`;
    articlePage.drawText(metadataText, { x: margin, y: articleYPos, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

    // Sentiment badge
    const sentimentColor = 
      article.sentiment === "positive" ? rgb(0, 0.6, 0) :
      article.sentiment === "negative" ? rgb(0.8, 0, 0) :
      rgb(0.4, 0.4, 0.4);
    
    articlePage.drawRectangle({ 
      x: 595 - margin - 80, 
      y: articleYPos - 10, 
      width: 70, 
      height: 14, 
      color: sentimentColor, 
      borderWidth: 0
    });
    
    articlePage.drawText(article.sentiment.toUpperCase(), { 
      x: 595 - margin - 75, 
      y: articleYPos - 7, 
      size: 8, 
      font: helveticaBold, 
      color: rgb(1, 1, 1) 
    });

    articleYPos -= 20;

    // Article summary
    const summaryLines = wrapText(article.summary, 85);
    const linesToShow = Math.min(summaryLines.length, 4); // Max 4 lines of summary

    for (let j = 0; j < linesToShow; j++) {
      articlePage.drawText(summaryLines[j], { x: margin, y: articleYPos, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      articleYPos -= 12;
    }

    if (summaryLines.length > 4) {
      articlePage.drawText("...", { x: margin, y: articleYPos, size: 9, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
      articleYPos -= 12;
    }

    // Topic badge
    articlePage.drawRectangle({ x: margin, y: articleYPos - 12, width: 60, height: 12, color: rgb(0.9, 0.9, 0.9), borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
    articlePage.drawText(article.topic, { x: margin + 4, y: articleYPos - 9, size: 7, font: helvetica, color: rgb(0, 0, 0) });

    articleYPos -= 25;
    currentPageArticles++;

    // Add page break marker if needed
    if (articleYPos < 100 && pageNumber < 5) {
      addFooter(articlePage, pageNumber);
      pageNumber++;
      articlePage = pdfDoc.addPage([595, 842]);
      articleYPos = addHeader(articlePage, `TOP STORIES (CONTINUED)`);
      currentPageArticles = 0;
    }
  }

  // Finalize pages 1-5
  if (pageNumber <= 5) {
    addFooter(articlePage, pageNumber);
  }

  // PAGE 6: Extended Analytics
  let page = pdfDoc.addPage([595, 842]);
  let yPosition = addHeader(page, "EXTENDED ANALYTICS");

  page.drawText("HISTORICAL TRENDS & ALERTS", { x: margin, y: yPosition, size: 14, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 25;

  const historicalDates = Object.keys(historicalDigests).sort().slice(-7);
  if (historicalDates.length > 0) {
    page.drawText("7-DAY TREND SUMMARY", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
    yPosition -= 18;
    
    page.drawRectangle({ x: margin, y: yPosition - (historicalDates.length * 18 + 20), width: pageWidth, height: historicalDates.length * 18 + 20, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
    
    page.drawRectangle({ x: margin, y: yPosition - 20, width: pageWidth, height: 20, color: rgb(0.9, 0.9, 0.9) });
    page.drawText("DATE", { x: margin + 10, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawText("ARTICLES", { x: margin + 100, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawText("SENTIMENT", { x: margin + 180, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawText("TOP TOPIC", { x: margin + 320, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });

    yPosition -= 38;
    for (const date of historicalDates) {
      const digest = historicalDigests[date];
      const totalArticles = Object.values(digest.topicCounts).reduce((a, b) => a + b, 0);
      const topTopic = Object.entries(digest.topicCounts).sort((a, b) => b[1] - a[1])[0];
      const dominantSentiment = Object.entries(digest.sentimentCounts).sort((a, b) => b[1] - a[1])[0][0];

      page.drawText(date, { x: margin + 10, y: yPosition, size: 9, font: helvetica, color: rgb(0, 0, 0) });
      page.drawText(totalArticles.toString(), { x: margin + 100, y: yPosition, size: 9, font: helvetica, color: rgb(0, 0, 0) });
      page.drawText(dominantSentiment, { x: margin + 180, y: yPosition, size: 9, font: helvetica, color: rgb(0, 0, 0) });
      page.drawText(topTopic?.[0] || "N/A", { x: margin + 320, y: yPosition, size: 9, font: helvetica, color: rgb(0, 0, 0) });
      yPosition -= 18;
    }
  }

  yPosition -= 25;

  page.drawText("TREND ALERTS", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
  yPosition -= 18;

  const alerts = [
    sentimentCounts.negative > sentimentCounts.positive ? "Negative sentiment exceeds positive" : "Balanced sentiment distribution",
    Object.keys(topicCounts).length > 8 ? "High topic diversity detected" : "Focused topic coverage",
    articles.length > 20 ? "Strong article volume" : "Limited article volume"
  ];

  for (const alert of alerts) {
    const wrapped = wrapText(alert, 90);
    for (const line of wrapped) {
      page.drawText(line, { x: margin + 10, y: yPosition, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      yPosition -= 11;
    }
    yPosition -= 5;
  }

  addFooter(page, 6);

  // PAGE 7: Detailed Statistics
  page = pdfDoc.addPage([595, 842]);
  yPosition = addHeader(page, "STATISTICS");

  page.drawText("SENTIMENT BY TOPIC BREAKDOWN", { x: margin, y: yPosition, size: 14, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 25;

  const topicTableHeight = 20 + (Array.from(topicSentiments.entries()).length * 28) + 10;
  page.drawRectangle({ x: margin, y: yPosition - topicTableHeight, width: pageWidth, height: topicTableHeight, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  
  page.drawRectangle({ x: margin, y: yPosition - 20, width: pageWidth, height: 20, color: rgb(0.9, 0.9, 0.9) });
  page.drawText("TOPIC", { x: margin + 10, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("POSITIVE", { x: margin + 120, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("NEGATIVE", { x: margin + 200, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("NEUTRAL", { x: margin + 280, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("TOTAL", { x: margin + 350, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });

  let topicRowY = yPosition - 40;
  for (const [topic, sentiments] of topicSentiments.entries()) {
    const total = sentiments.positive + sentiments.negative + sentiments.neutral;
    page.drawText(topic, { x: margin + 10, y: topicRowY, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText(sentiments.positive.toString(), { x: margin + 120, y: topicRowY, size: 9, font: helvetica, color: rgb(0, 0.5, 0) });
    page.drawText(sentiments.negative.toString(), { x: margin + 200, y: topicRowY, size: 9, font: helvetica, color: rgb(0.7, 0, 0) });
    page.drawText(sentiments.neutral.toString(), { x: margin + 280, y: topicRowY, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(total.toString(), { x: margin + 350, y: topicRowY, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
    topicRowY -= 28;
  }

  yPosition -= topicTableHeight + 25;

  page.drawText("KEY PHRASES & PATTERNS", { x: margin, y: yPosition, size: 14, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 22;

  const topPhrases = Array.from(keyPhrases.entries()).slice(0, 12);
  const phraseBoxWidth = (pageWidth - 10) / 2;
  let phraseX = margin;
  let phraseY = yPosition;
  let phraseCount = 0;

  for (const [phrase, count] of topPhrases) {
    const bgColor = phraseCount % 2 === 0 ? rgb(0.95, 0.95, 0.95) : rgb(1, 1, 1);
    page.drawRectangle({ x: phraseX, y: phraseY - 16, width: phraseBoxWidth - 5, height: 16, color: bgColor, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
    page.drawText(phrase, { x: phraseX + 8, y: phraseY - 11, size: 8, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText(`(${count})`, { x: phraseX + phraseBoxWidth - 35, y: phraseY - 11, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
    
    phraseX += phraseBoxWidth;
    if (phraseCount % 2 === 1) {
      phraseX = margin;
      phraseY -= 20;
    }
    phraseCount++;
  }

  addFooter(page, 7);

  // PAGE 8: Recommendations & Insights
  page = pdfDoc.addPage([595, 842]);
  yPosition = addHeader(page, "INSIGHTS");

  page.drawText("RECOMMENDATIONS & ACTIONABLE INSIGHTS", { x: margin, y: yPosition, size: 14, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 25;

  page.drawText("EXECUTIVE SUMMARY", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
  yPosition -= 16;

  const totalArticles = articles.length;
  const avgReliability = calculateAverageReliability(articles);
  const dominantTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];
  const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0];

  const summaryText = `Today's digest contains ${totalArticles} articles across ${Object.keys(topicCounts).length} topics. ` +
    `The dominant topic is "${dominantTopic?.[0] || "N/A"}" with ${dominantTopic?.[1] || 0} articles (${((dominantTopic?.[1] || 0 / totalArticles) * 100).toFixed(1)}% of coverage). ` +
    `Sentiment analysis reveals "${dominantSentiment?.[0] || "N/A"}" as the prevailing tone. ` +
    `Source reliability averages ${(avgReliability * 100).toFixed(1)}%.`;

  const summaryLines = wrapText(summaryText, 90);
  for (const line of summaryLines) {
    page.drawText(line, { x: margin + 10, y: yPosition, size: 9, font: timesFont, color: rgb(0.1, 0.1, 0.1) });
    yPosition -= 11;
  }

  yPosition -= 15;

  page.drawText("STRATEGIC RECOMMENDATIONS", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
  yPosition -= 18;

  for (let i = 0; i < recommendations.length; i++) {
    const recLines = wrapText(recommendations[i], 85);
    for (const line of recLines) {
      page.drawText(line, { x: margin + 10, y: yPosition, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      yPosition -= 11;
    }
    yPosition -= 6;
  }

  yPosition -= 8;

  page.drawText("KEY METRICS SNAPSHOT", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
  yPosition -= 20;

  const metricsBoxWidth = (pageWidth - 20) / 3;
  const metricsY = yPosition;

  page.drawRectangle({ x: margin, y: metricsY - 60, width: metricsBoxWidth - 5, height: 60, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawText("Positive", { x: margin + 8, y: metricsY - 18, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(sentimentCounts.positive.toString(), { x: margin + 8, y: metricsY - 42, size: 24, font: timesBold, color: rgb(0, 0.5, 0) });

  page.drawRectangle({ x: margin + metricsBoxWidth + 5, y: metricsY - 60, width: metricsBoxWidth - 5, height: 60, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawText("Negative", { x: margin + metricsBoxWidth + 13, y: metricsY - 18, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(sentimentCounts.negative.toString(), { x: margin + metricsBoxWidth + 13, y: metricsY - 42, size: 24, font: timesBold, color: rgb(0.7, 0, 0) });

  page.drawRectangle({ x: margin + 2 * metricsBoxWidth + 10, y: metricsY - 60, width: metricsBoxWidth - 5, height: 60, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  page.drawText("Reliability", { x: margin + 2 * metricsBoxWidth + 18, y: metricsY - 18, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`${(avgReliability * 100).toFixed(0)}%`, { x: margin + 2 * metricsBoxWidth + 18, y: metricsY - 42, size: 24, font: timesBold, color: rgb(0, 0, 0.7) });

  yPosition -= 80;

  page.drawText("NEXT STEPS", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
  yPosition -= 18;

  const nextSteps = [
    "1. Monitor sentiment trends in coming days, especially if negative outlook persists",
    "2. Cross-reference top articles with source reliability scores",
    "3. Track emerging topics for shifts in coverage patterns",
    "4. Review key phrases for potential story connections"
  ];

  for (const step of nextSteps) {
    page.drawText(step, { x: margin + 10, y: yPosition, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
    yPosition -= 12;
  }

  addFooter(page, 8);

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