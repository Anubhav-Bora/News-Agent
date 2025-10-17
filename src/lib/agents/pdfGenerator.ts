import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import dayjs from "dayjs";
import { uploadPDFToSupabase, savePDFMetadata } from "../storage";

interface Article {
  title: string;
  summary: string;
  source?: string;
  topic: string;
  sentiment: "positive" | "negative" | "neutral";
  pubDate: string;
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

async function generateSentimentChart(
  sentimentCounts: Record<string, number>
): Promise<Buffer | null> {
  return null;
}

async function generateTopicChart(
  topicCounts: Record<string, number>
): Promise<Buffer | null> {
  return null;
}

async function generateTrendChart(
  historicalDigests: Record<string, { topicCounts: Record<string, number>; sentimentCounts: Record<string, number> }>,
  sentimentCounts: Record<string, number>,
  topicCounts: Record<string, number>
): Promise<Buffer | null> {
  return null;
}

export async function generateDigestPDF(
  articles: Article[],
  historicalDigests: Record<string, { topicCounts: Record<string, number>; sentimentCounts: Record<string, number> }>,
  userId: string
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  const topicCounts: Record<string, number> = {};
  const sourceCount: Record<string, number> = {};
  
  for (const a of articles) {
    sentimentCounts[a.sentiment]++;
    topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1;
    if (a.source) {
      sourceCount[a.source] = (sourceCount[a.source] || 0) + 1;
    }
  }

  const sentimentChartImage = await generateSentimentChart(sentimentCounts);
  const topicChartImage = await generateTopicChart(topicCounts);
  const trendChartImage = await generateTrendChart(historicalDigests, sentimentCounts, topicCounts);

  let page = pdfDoc.addPage([595, 842]);
  const margin = 35;
  const pageWidth = 595 - 2 * margin;
  const columnWidth = (pageWidth - 15) / 3;
  let yPosition = 810;

  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 2, color: rgb(0, 0, 0) });
  yPosition -= 3;
  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 0.5, color: rgb(0, 0, 0) });
  yPosition -= 18;

  const nameText = "THE DAILY DIGEST";
  const nameWidth = nameText.length * 22.5;
  page.drawText(nameText, { 
    x: margin + (pageWidth - nameWidth) / 2, 
    y: yPosition, 
    size: 42, 
    font: timesBold,
    color: rgb(0, 0, 0) 
  });
  yPosition -= 15;

  const motto = '"All The News Worth Reading"';
  page.drawText(motto, { 
    x: margin + (pageWidth - motto.length * 4.2) / 2, 
    y: yPosition, 
    size: 8, 
    font: timesItalic,
    color: rgb(0.2, 0.2, 0.2) 
  });
  yPosition -= 12;

  const dateInfo = dayjs().format("dddd, MMMM DD, YYYY").toUpperCase();
  const priceInfo = "Vol. XCVII No. " + dayjs().format("DDD") + " • 32 PAGES • $2.50";
  page.drawText(dateInfo, { 
    x: margin + (pageWidth - dateInfo.length * 3.8) / 2, 
    y: yPosition, 
    size: 7, 
    font: helvetica,
    color: rgb(0.3, 0.3, 0.3) 
  });
  yPosition -= 10;
  page.drawText(priceInfo, { 
    x: margin + (pageWidth - priceInfo.length * 3.5) / 2, 
    y: yPosition, 
    size: 6.5, 
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4) 
  });
  yPosition -= 8;

  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 0.5, color: rgb(0, 0, 0) });
  yPosition -= 3;
  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 2, color: rgb(0, 0, 0) });
  yPosition -= 22;

  const indexBoxHeight = 35;
  page.drawRectangle({ 
    x: margin, 
    y: yPosition - indexBoxHeight, 
    width: pageWidth, 
    height: indexBoxHeight, 
    borderColor: rgb(0, 0, 0), 
    borderWidth: 1.5 
  });

  page.drawText("TODAY'S EDITION", { 
    x: margin + 8, 
    y: yPosition - 13, 
    size: 8, 
    font: helveticaBold,
    color: rgb(0, 0, 0) 
  });

  const indexY = yPosition - 27;
  page.drawText("Headlines: Page 1", { x: margin + 8, y: indexY, size: 7, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("•", { x: margin + 100, y: indexY, size: 7, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Full Coverage: Pages 2-3", { x: margin + 110, y: indexY, size: 7, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("•", { x: margin + 240, y: indexY, size: 7, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Analytics: Page 4", { x: margin + 250, y: indexY, size: 7, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("•", { x: margin + 355, y: indexY, size: 7, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Statistics: Page 5", { x: margin + 365, y: indexY, size: 7, font: helvetica, color: rgb(0.2, 0.2, 0.2) });

  yPosition -= indexBoxHeight + 18;

  if (articles.length > 0) {
    const lead = articles[0];
    
    const titleLines = wrapText(lead.title.toUpperCase(), 75);
    for (let i = 0; i < Math.min(titleLines.length, 2); i++) {
      page.drawText(titleLines[i], { 
        x: margin, 
        y: yPosition, 
        size: 18, 
        font: timesBold, 
        color: rgb(0, 0, 0) 
      });
      yPosition -= 22;
    }

    const byline = "By " + (lead.source || "Staff Reporter") + " • " + dayjs(lead.pubDate).format("MMMM DD, YYYY");
    page.drawText(byline, { 
      x: margin, 
      y: yPosition, 
      size: 8, 
      font: timesItalic, 
      color: rgb(0.3, 0.3, 0.3) 
    });
    yPosition -= 16;

    const leadSummary = wrapText(lead.summary, 170);
    const leadText = leadSummary.slice(0, 8).join(" ");
    const col1Text = wrapText(leadText.split(" ").slice(0, Math.floor(leadText.split(" ").length / 3)).join(" "), 35);
    const col2Text = wrapText(leadText.split(" ").slice(Math.floor(leadText.split(" ").length / 3), Math.floor(2 * leadText.split(" ").length / 3)).join(" "), 35);
    const col3Text = wrapText(leadText.split(" ").slice(Math.floor(2 * leadText.split(" ").length / 3)).join(" "), 35);

    const leadStartY = yPosition;
    let col1Y = leadStartY;
    let col2Y = leadStartY;
    let col3Y = leadStartY;

    for (const line of col1Text) {
      page.drawText(line, { x: margin, y: col1Y, size: 9.5, font: timesFont, color: rgb(0, 0, 0) });
      col1Y -= 11.5;
    }

    for (const line of col2Text) {
      page.drawText(line, { x: margin + columnWidth + 7.5, y: col2Y, size: 9.5, font: timesFont, color: rgb(0, 0, 0) });
      col2Y -= 11.5;
    }

    for (const line of col3Text) {
      page.drawText(line, { x: margin + 2 * columnWidth + 15, y: col3Y, size: 9.5, font: timesFont, color: rgb(0, 0, 0) });
      col3Y -= 11.5;
    }

    yPosition = Math.min(col1Y, col2Y, col3Y) - 8;

    page.drawRectangle({ 
      x: margin, 
      y: yPosition - 12, 
      width: 55, 
      height: 12, 
      color: rgb(0, 0, 0) 
    });
    page.drawText(lead.topic.toUpperCase(), { 
      x: margin + 3, 
      y: yPosition - 10, 
      size: 7, 
      font: helveticaBold, 
      color: rgb(1, 1, 1) 
    });

    yPosition -= 20;
  }

  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 2, color: rgb(0, 0, 0) });
  yPosition -= 15;

  const col1X = margin;
  const col2X = margin + columnWidth + 7.5;
  const col3X = margin + 2 * columnWidth + 15;
  let col1Y = yPosition;
  let col2Y = yPosition;
  let col3Y = yPosition;

  page.drawLine({ 
    start: { x: col2X - 4, y: yPosition + 5 }, 
    end: { x: col2X - 4, y: 80 }, 
    thickness: 0.5, 
    color: rgb(0.5, 0.5, 0.5) 
  });
  page.drawLine({ 
    start: { x: col3X - 4, y: yPosition + 5 }, 
    end: { x: col3X - 4, y: 80 }, 
    thickness: 0.5, 
    color: rgb(0.5, 0.5, 0.5) 
  });

  for (let i = 1; i < Math.min(articles.length, 10); i++) {
    const a = articles[i];
    const colIndex = (i - 1) % 3;
    const currentX = colIndex === 0 ? col1X : colIndex === 1 ? col2X : colIndex === 2 ? col3X : col1X;
    let currentY = colIndex === 0 ? col1Y : colIndex === 1 ? col2Y : colIndex === 2 ? col3Y : col1Y;

    page.drawText(a.topic.toUpperCase(), { 
      x: currentX, 
      y: currentY, 
      size: 6.5, 
      font: helveticaBold, 
      color: rgb(0.5, 0.5, 0.5) 
    });
    currentY -= 11;

    const titleLines = wrapText(a.title, 35);
    for (let j = 0; j < Math.min(titleLines.length, 3); j++) {
      page.drawText(titleLines[j], { 
        x: currentX, 
        y: currentY, 
        size: 10, 
        font: timesBold, 
        color: rgb(0, 0, 0) 
      });
      currentY -= 11.5;
    }

    const summaryLines = wrapText(a.summary, 35);
    for (let j = 0; j < Math.min(summaryLines.length, 4); j++) {
      page.drawText(summaryLines[j], { 
        x: currentX, 
        y: currentY, 
        size: 8.5, 
        font: timesFont, 
        color: rgb(0.1, 0.1, 0.1) 
      });
      currentY -= 10;
    }

    currentY -= 12;

    if (colIndex === 0) col1Y = currentY;
    else if (colIndex === 1) col2Y = currentY;
    else col3Y = currentY;
  }

  page.drawLine({ start: { x: margin, y: 70 }, end: { x: 595 - margin, y: 70 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawText("www.dailydigest.news", { x: margin, y: 58, size: 7, font: courier, color: rgb(0.4, 0.4, 0.4) });
  page.drawText("Page 1", { x: 595 - margin - 30, y: 58, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

  page = pdfDoc.addPage([595, 842]);
  yPosition = 790;

  page.drawText("THE DAILY DIGEST", { x: margin, y: yPosition, size: 10, font: timesBold, color: rgb(0, 0, 0) });
  page.drawText(dayjs().format("MMMM DD, YYYY").toUpperCase(), { x: 595 - margin - 100, y: yPosition, size: 8, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
  yPosition -= 8;
  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 1.5, color: rgb(0, 0, 0) });
  yPosition -= 20;

  page.drawText("COMPREHENSIVE COVERAGE", { x: margin, y: yPosition, size: 14, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 25;

  const detailedArticles = articles.slice(10, 20);
  for (let i = 0; i < detailedArticles.length; i++) {
    if (yPosition < 120) {
      page.drawLine({ start: { x: margin, y: 70 }, end: { x: 595 - margin, y: 70 }, thickness: 1, color: rgb(0, 0, 0) });
      page.drawText("Continued on Page 3", { x: margin, y: 58, size: 7, font: timesItalic, color: rgb(0.4, 0.4, 0.4) });
      page.drawText("Page 2", { x: 595 - margin - 30, y: 58, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

      page = pdfDoc.addPage([595, 842]);
      yPosition = 790;
      page.drawText("THE DAILY DIGEST", { x: margin, y: yPosition, size: 10, font: timesBold, color: rgb(0, 0, 0) });
      page.drawText(dayjs().format("MMMM DD, YYYY").toUpperCase(), { x: 595 - margin - 100, y: yPosition, size: 8, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
      yPosition -= 8;
      page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 1.5, color: rgb(0, 0, 0) });
      yPosition -= 25;
    }

    const a = detailedArticles[i];

    page.drawText("[" + a.topic.toUpperCase() + "]", { 
      x: margin, 
      y: yPosition, 
      size: 8, 
      font: helveticaBold, 
      color: rgb(0.4, 0.4, 0.4) 
    });
    yPosition -= 14;

    const titleLines = wrapText(a.title, 80);
    for (const line of titleLines) {
      page.drawText(line, { x: margin, y: yPosition, size: 11, font: timesBold, color: rgb(0, 0, 0) });
      yPosition -= 13;
    }

    page.drawText("By " + (a.source || "Wire Service") + " — " + dayjs(a.pubDate).format("MMM DD"), { 
      x: margin, 
      y: yPosition, 
      size: 7.5, 
      font: timesItalic, 
      color: rgb(0.4, 0.4, 0.4) 
    });
    yPosition -= 13;

    const summaryLines = wrapText(a.summary, 80);
    for (const line of summaryLines) {
      page.drawText(line, { x: margin, y: yPosition, size: 9, font: timesFont, color: rgb(0.1, 0.1, 0.1) });
      yPosition -= 11;
    }

    const sentimentText = a.sentiment === "positive" ? "[POSITIVE OUTLOOK]" : 
                          a.sentiment === "negative" ? "[CONCERNING DEVELOPMENT]" : "[NEUTRAL REPORT]";
    const sentColor = a.sentiment === "positive" ? rgb(0, 0.5, 0) : 
                      a.sentiment === "negative" ? rgb(0.7, 0, 0) : rgb(0.4, 0.4, 0.4);
    page.drawText(sentimentText, { x: margin, y: yPosition, size: 7, font: helveticaBold, color: sentColor });
    yPosition -= 18;

    page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    yPosition -= 12;
  }

  page.drawLine({ start: { x: margin, y: 70 }, end: { x: 595 - margin, y: 70 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawText("Page 3", { x: 595 - margin - 30, y: 58, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

  page = pdfDoc.addPage([595, 842]);
  yPosition = 790;

  page.drawText("THE DAILY DIGEST", { x: margin, y: yPosition, size: 10, font: timesBold, color: rgb(0, 0, 0) });
  page.drawText("ANALYTICS & DATA", { x: 595 - margin - 110, y: yPosition, size: 10, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 8;
  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 1.5, color: rgb(0, 0, 0) });
  yPosition -= 20;

  page.drawText("NEWS ANALYTICS DASHBOARD", { x: margin, y: yPosition, size: 16, font: timesBold, color: rgb(0, 0, 0) });
  page.drawText("Data-Driven Insights from Today's Coverage", { x: margin, y: yPosition - 18, size: 9, font: timesItalic, color: rgb(0.4, 0.4, 0.4) });
  yPosition -= 45;

  const chartY = yPosition;
  if (sentimentChartImage) {
    const sentimentImageEmbed = await pdfDoc.embedPng(sentimentChartImage);
    page.drawText("SENTIMENT ANALYSIS", { x: margin, y: chartY, size: 10, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawImage(sentimentImageEmbed, { x: margin, y: chartY - 210, width: 250, height: 190 });
  }

  const topicChartX = margin + 270;
  if (topicChartImage) {
    const topicImageEmbed = await pdfDoc.embedPng(topicChartImage);
    page.drawText("TOPIC DISTRIBUTION", { x: topicChartX, y: chartY, size: 10, font: helveticaBold, color: rgb(0, 0, 0) });
    page.drawImage(topicImageEmbed, { x: topicChartX, y: chartY - 210, width: 250, height: 190 });
  }

  yPosition = chartY - 230;

  if (trendChartImage) {
    page.drawText("COVERAGE TRENDS", { x: margin, y: yPosition, size: 10, font: helveticaBold, color: rgb(0, 0, 0) });
    yPosition -= 15;
    const trendImageEmbed = await pdfDoc.embedPng(trendChartImage);
    page.drawImage(trendImageEmbed, { x: margin, y: yPosition - 140, width: pageWidth, height: 130 });
    yPosition -= 155;
  }

  page.drawLine({ start: { x: margin, y: 70 }, end: { x: 595 - margin, y: 70 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawText("Page 4", { x: 595 - margin - 30, y: 58, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

  page = pdfDoc.addPage([595, 842]);
  yPosition = 790;

  page.drawText("THE DAILY DIGEST", { x: margin, y: yPosition, size: 10, font: timesBold, color: rgb(0, 0, 0) });
  page.drawText("STATISTICS", { x: 595 - margin - 70, y: yPosition, size: 10, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 8;
  page.drawLine({ start: { x: margin, y: yPosition }, end: { x: 595 - margin, y: yPosition }, thickness: 1.5, color: rgb(0, 0, 0) });
  yPosition -= 20;

  page.drawText("COMPREHENSIVE STATISTICS", { x: margin, y: yPosition, size: 16, font: timesBold, color: rgb(0, 0, 0) });
  yPosition -= 30;

  const totalArticles = articles.length;
  const metricsBoxWidth = (pageWidth - 20) / 3;
  const metricsY = yPosition;

  page.drawRectangle({ x: margin, y: metricsY - 70, width: metricsBoxWidth, height: 70, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  page.drawText("TOTAL ARTICLES", { x: margin + 10, y: metricsY - 20, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(totalArticles.toString(), { x: margin + 10, y: metricsY - 50, size: 32, font: timesBold, color: rgb(0, 0, 0) });

  const topSource = Object.entries(sourceCount).sort((a, b) => b[1] - a[1])[0];
  page.drawRectangle({ x: margin + metricsBoxWidth + 10, y: metricsY - 70, width: metricsBoxWidth, height: 70, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  page.drawText("TOP SOURCE", { x: margin + metricsBoxWidth + 20, y: metricsY - 20, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
  if (topSource) {
    const sourceName = topSource[0].length > 15 ? topSource[0].substring(0, 15) + "..." : topSource[0];
    page.drawText(sourceName, { x: margin + metricsBoxWidth + 20, y: metricsY - 42, size: 11, font: timesBold, color: rgb(0, 0, 0) });
    page.drawText(topSource[1] + " articles", { x: margin + metricsBoxWidth + 20, y: metricsY - 58, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
  }

  const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];
  page.drawRectangle({ x: margin + 2 * metricsBoxWidth + 20, y: metricsY - 70, width: metricsBoxWidth, height: 70, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  page.drawText("DOMINANT TOPIC", { x: margin + 2 * metricsBoxWidth + 30, y: metricsY - 20, size: 8, font: helveticaBold, color: rgb(0.4, 0.4, 0.4) });
  if (topTopic) {
    page.drawText(topTopic[0].toUpperCase(), { x: margin + 2 * metricsBoxWidth + 30, y: metricsY - 42, size: 11, font: timesBold, color: rgb(0, 0, 0) });
    const topicPercent = ((topTopic[1] / totalArticles) * 100).toFixed(1);
    page.drawText(topicPercent + "% of coverage", { x: margin + 2 * metricsBoxWidth + 30, y: metricsY - 58, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
  }

  yPosition -= 90;

  page.drawText("SENTIMENT BREAKDOWN", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
  yPosition -= 20;

  page.drawRectangle({ x: margin, y: yPosition - 80, width: pageWidth, height: 80, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  
  page.drawRectangle({ x: margin, y: yPosition - 20, width: pageWidth, height: 20, color: rgb(0.9, 0.9, 0.9) });
  page.drawText("SENTIMENT", { x: margin + 10, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("COUNT", { x: margin + 200, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("PERCENTAGE", { x: margin + 300, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("VISUAL", { x: margin + 420, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });

  const tableRowY = yPosition - 40;
  const positivePercent = totalArticles > 0 ? ((sentimentCounts.positive / totalArticles) * 100).toFixed(1) : "0.0";
  const negativePercent = totalArticles > 0 ? ((sentimentCounts.negative / totalArticles) * 100).toFixed(1) : "0.0";
  const neutralPercent = totalArticles > 0 ? ((sentimentCounts.neutral / totalArticles) * 100).toFixed(1) : "0.0";

  page.drawText("Positive", { x: margin + 10, y: tableRowY, size: 9, font: helvetica, color: rgb(0, 0.5, 0) });
  page.drawText(sentimentCounts.positive.toString(), { x: margin + 200, y: tableRowY, size: 9, font: helvetica, color: rgb(0, 0, 0) });
  page.drawText(positivePercent + "%", { x: margin + 300, y: tableRowY, size: 9, font: helvetica, color: rgb(0, 0, 0) });
  const posBarWidth = (parseFloat(positivePercent) / 100) * 80;
  page.drawRectangle({ x: margin + 420, y: tableRowY - 3, width: posBarWidth, height: 10, color: rgb(0.2, 0.7, 0.2) });

  page.drawText("Negative", { x: margin + 10, y: tableRowY - 20, size: 9, font: helvetica, color: rgb(0.7, 0, 0) });
  page.drawText(sentimentCounts.negative.toString(), { x: margin + 200, y: tableRowY - 20, size: 9, font: helvetica, color: rgb(0, 0, 0) });
  page.drawText(negativePercent + "%", { x: margin + 300, y: tableRowY - 20, size: 9, font: helvetica, color: rgb(0, 0, 0) });
  const negBarWidth = (parseFloat(negativePercent) / 100) * 80;
  page.drawRectangle({ x: margin + 420, y: tableRowY - 23, width: negBarWidth, height: 10, color: rgb(0.9, 0.2, 0.2) });

  page.drawText("Neutral", { x: margin + 10, y: tableRowY - 40, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(sentimentCounts.neutral.toString(), { x: margin + 200, y: tableRowY - 40, size: 9, font: helvetica, color: rgb(0, 0, 0) });
  page.drawText(neutralPercent + "%", { x: margin + 300, y: tableRowY - 40, size: 9, font: helvetica, color: rgb(0, 0, 0) });
  const neutBarWidth = (parseFloat(neutralPercent) / 100) * 80;
  page.drawRectangle({ x: margin + 420, y: tableRowY - 43, width: neutBarWidth, height: 10, color: rgb(0.8, 0.8, 0) });

  yPosition -= 100;

  page.drawText("TOPIC COVERAGE ANALYSIS", { x: margin, y: yPosition, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
  yPosition -= 20;

  const topicTableHeight = 20 + (Object.keys(topicCounts).length * 20) + 10;
  page.drawRectangle({ x: margin, y: yPosition - topicTableHeight, width: pageWidth, height: topicTableHeight, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  
  page.drawRectangle({ x: margin, y: yPosition - 20, width: pageWidth, height: 20, color: rgb(0.9, 0.9, 0.9) });
  page.drawText("TOPIC", { x: margin + 10, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("ARTICLES", { x: margin + 200, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("PERCENTAGE", { x: margin + 300, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });
  page.drawText("COVERAGE BAR", { x: margin + 420, y: yPosition - 15, size: 9, font: helveticaBold, color: rgb(0, 0, 0) });

  let topicRowY = yPosition - 40;
  const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
  const colors = [rgb(0.1, 0.3, 0.6), rgb(0.8, 0.4, 0), rgb(0.5, 0.4, 0), rgb(0.2, 0.5, 0.2), rgb(0.6, 0, 0.6), rgb(0.7, 0.5, 0.2)];

  for (let i = 0; i < sortedTopics.length; i++) {
    const [topic, count] = sortedTopics[i];
    const percent = totalArticles > 0 ? ((count / totalArticles) * 100).toFixed(1) : "0.0";
    page.drawText(topic, { x: margin + 10, y: topicRowY, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText(count.toString(), { x: margin + 200, y: topicRowY, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText(percent + "%", { x: margin + 300, y: topicRowY, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    const barWidth = (parseFloat(percent) / 100) * 80;
    page.drawRectangle({ x: margin + 420, y: topicRowY - 3, width: barWidth, height: 10, color: colors[i % colors.length] });
    topicRowY -= 20;
  }

  page.drawLine({ start: { x: margin, y: 70 }, end: { x: 595 - margin, y: 70 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawText("Page 5", { x: 595 - margin - 30, y: 58, size: 7, font: helvetica, color: rgb(0.4, 0.4, 0.4) });

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