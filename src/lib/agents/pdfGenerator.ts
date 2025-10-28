import { PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib"
import dayjs from "dayjs"
import { uploadPDFToSupabase, savePDFMetadata } from "../storage"

interface Article {
  title: string
  summary: string
  source?: string
  topic: string
  sentiment: "positive" | "negative" | "neutral"
  pubDate: string
  keywords?: string[]
  reliability?: number
  category?: string
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim())
      currentLine = word
    } else {
      currentLine += (currentLine ? " " : "") + word
    }
  }

  if (currentLine) lines.push(currentLine.trim())
  return lines
}

function sanitizeTextForPDF(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "").trim()
}

function getTopicColor(index: number): ReturnType<typeof rgb> {
  const colors = [
    rgb(0.15, 0.45, 0.85),
    rgb(0.85, 0.25, 0.15),
    rgb(0.15, 0.75, 0.35),
    rgb(0.85, 0.65, 0.15),
    rgb(0.55, 0.15, 0.75),
    rgb(0.15, 0.65, 0.75),
    rgb(0.75, 0.15, 0.35),
    rgb(0.45, 0.45, 0.15),
  ]
  return colors[index % colors.length]
}

function drawGradientBar(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  percentage: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.92, 0.92, 0.92),
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 0.5,
  })

  page.drawRectangle({
    x,
    y,
    width: (width * percentage) / 100,
    height,
    color,
    borderWidth: 0,
  })
}

function calculateTrendDirection(current: number, previous: number): { direction: string; percentage: number } {
  if (previous === 0) return { direction: "→", percentage: 0 }
  const change = ((current - previous) / previous) * 100
  return {
    direction: change > 0 ? "↑" : change < 0 ? "↓" : "→",
    percentage: Math.abs(change),
  }
}

function calculateSentimentByTopic(articles: Article[]): Map<string, Record<string, number>> {
  const topicSentiments = new Map<string, Record<string, number>>()

  for (const article of articles) {
    if (!topicSentiments.has(article.topic)) {
      topicSentiments.set(article.topic, { positive: 0, negative: 0, neutral: 0 })
    }
    const sentiments = topicSentiments.get(article.topic)!
    sentiments[article.sentiment]++
  }

  return topicSentiments
}

function calculateAverageReliability(articles: Article[]): number {
  const reliable = articles.filter((a) => a.reliability !== undefined)
  if (reliable.length === 0) return 0.8
  return reliable.reduce((sum, a) => sum + (a.reliability || 0), 0) / reliable.length
}

function calculateVolatilityIndex(sentimentCounts: Record<string, number>): number {
  const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0)
  if (total === 0) return 0

  const positive = sentimentCounts.positive / total
  const negative = sentimentCounts.negative / total
  const neutral = sentimentCounts.neutral / total

  const variance = Math.pow(positive - 0.33, 2) + Math.pow(negative - 0.33, 2) + Math.pow(neutral - 0.33, 2)
  return Math.min(100, Math.round(variance * 300))
}

function calculateMarketConfidence(articles: Article[], avgReliability: number): number {
  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 }
  for (const a of articles) {
    sentimentCounts[a.sentiment]++
  }

  const total = articles.length
  const positiveRatio = sentimentCounts.positive / total
  const reliabilityFactor = avgReliability

  return Math.round((positiveRatio * 0.6 + reliabilityFactor * 0.4) * 100)
}

export async function generateDigestPDF(
  articles: Article[],
  historicalDigests: Record<string, { topicCounts: Record<string, number>; sentimentCounts: Record<string, number> }>,
  userId: string,
  language = "en",
  weather?: { location: string; temperature: number; condition: string; humidity?: number; windSpeed?: number },
  newsType?: string,
): Promise<string | null> {
  const sanitizedArticles = articles.map((article) => ({
    ...article,
    title: sanitizeTextForPDF(article.title),
    summary: sanitizeTextForPDF(article.summary),
    source: article.source ? sanitizeTextForPDF(article.source) : undefined,
    topic: sanitizeTextForPDF(article.topic),
  }))

  const pdfDoc = await PDFDocument.create()
  const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 }
  const topicCounts: Record<string, number> = {}
  const sourceCount: Record<string, number> = {}
  const topicSentiments = calculateSentimentByTopic(sanitizedArticles)

  for (const a of sanitizedArticles) {
    sentimentCounts[a.sentiment]++
    topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1
    if (a.source) sourceCount[a.source] = (sourceCount[a.source] || 0) + 1
  }

  const margin = 35
  const pageWidth = 595 - 2 * margin
  const currentDate = dayjs().format("dddd, MMMM DD, YYYY")

  let pageNumber = 1

  const addMasthead = (page: PDFPage) => {
    page.drawRectangle({
      x: 0,
      y: 755,
      width: 595,
      height: 87,
      color: rgb(1, 1, 1),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0,
    })

    page.drawLine({
      start: { x: margin, y: 755 },
      end: { x: 595 - margin, y: 755 },
      thickness: 4,
      color: rgb(0, 0, 0),
    })

    page.drawText("DAILY DIGEST", {
      x: margin,
      y: 810,
      size: 52,
      font: timesBold,
      color: rgb(0, 0, 0),
    })

    page.drawText("NEW DELHI | THURSDAY, OCTOBER 28, 2025 | Vol. 38, No. 302", {
      x: margin,
      y: 790,
      size: 8,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    })

    page.drawText("Published since 2025 | www.dailydigest.news", {
      x: margin,
      y: 778,
      size: 7,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    })

    page.drawLine({
      start: { x: margin, y: 774 },
      end: { x: 595 - margin, y: 774 },
      thickness: 1,
      color: rgb(0, 0, 0),
    })

    return 745
  }

  const addPageHeader = (page: PDFPage, num: number) => {
    page.drawLine({
      start: { x: margin, y: 800 },
      end: { x: 595 - margin, y: 800 },
      thickness: 1,
      color: rgb(0, 0, 0),
    })

    page.drawText("DAILY DIGEST", {
      x: margin,
      y: 810,
      size: 10,
      font: timesBold,
      color: rgb(0, 0, 0),
    })

    page.drawText(`Page ${num} | ${currentDate}`, {
      x: 595 - margin - 150,
      y: 810,
      size: 9,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    })

    page.drawLine({
      start: { x: margin, y: 805 },
      end: { x: 595 - margin, y: 805 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    })

    return 790
  }

  const addFooter = (page: PDFPage, num: number) => {
    page.drawLine({
      start: { x: margin, y: 50 },
      end: { x: 595 - margin, y: 50 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    })

    page.drawText("© 2025 Daily Digest News | All rights reserved", {
      x: margin,
      y: 35,
      size: 6,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    })

    page.drawText(`Generated: ${dayjs().format("YYYY-MM-DD HH:mm")}`, {
      x: 595 - margin - 120,
      y: 35,
      size: 6,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    })

    page.drawText(`${num}`, {
      x: 595 - margin - 20,
      y: 35,
      size: 8,
      font: timesBold,
      color: rgb(0, 0, 0),
    })
  }

  let page = pdfDoc.addPage([595, 842])
  let yPos = addMasthead(page)

  const totalArticles = sanitizedArticles.length
  const avgReliability = calculateAverageReliability(sanitizedArticles)
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])
  const topSources = Object.entries(sourceCount).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const volatilityIndex = calculateVolatilityIndex(sentimentCounts)
  const marketConfidence = calculateMarketConfidence(sanitizedArticles, avgReliability)

  const sentimentTotal = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral
  const positivePercent = sentimentTotal > 0 ? (sentimentCounts.positive / sentimentTotal) * 100 : 0
  const negativePercent = sentimentTotal > 0 ? (sentimentCounts.negative / sentimentTotal) * 100 : 0
  const neutralPercent = sentimentTotal > 0 ? (sentimentCounts.neutral / sentimentTotal) * 100 : 0

  yPos -= 15

  page.drawText("TOP STORIES", {
    x: margin,
    y: yPos,
    size: 14,
    font: timesBold,
    color: rgb(0, 0, 0),
  })

  page.drawLine({
    start: { x: margin, y: yPos - 4 },
    end: { x: margin + 80, y: yPos - 4 },
    thickness: 3,
    color: rgb(0.8, 0.1, 0.1),
  })

  yPos -= 25

  const topArticles = sanitizedArticles.slice(0, 4)
  for (let i = 0; i < topArticles.length; i++) {
    const article = topArticles[i]

    const sentimentColor = article.sentiment === "positive" ? rgb(0.1, 0.7, 0.1) : article.sentiment === "negative" ? rgb(0.8, 0.1, 0.1) : rgb(0.4, 0.4, 0.4)
    const sentimentLabel = article.sentiment === "positive" ? "BULLISH" : article.sentiment === "negative" ? "BEARISH" : "NEUTRAL"

    if (i > 0) {
      page.drawLine({
        start: { x: margin, y: yPos },
        end: { x: 595 - margin, y: yPos },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      })
      yPos -= 8
    }

    const titleLines = wrapText(article.title, 85)
    page.drawText(titleLines[0], {
      x: margin,
      y: yPos,
      size: 16,
      font: timesBold,
      color: rgb(0, 0, 0),
    })

    if (titleLines.length > 1) {
      page.drawText(titleLines[1], {
        x: margin,
        y: yPos - 14,
        size: 16,
        font: timesBold,
        color: rgb(0, 0, 0),
      })
      yPos -= 14
    }

    yPos -= 18

    const summaryLines = wrapText(article.summary.substring(0, 280), 100)
    for (let j = 0; j < Math.min(summaryLines.length, 3); j++) {
      page.drawText(summaryLines[j], {
        x: margin,
        y: yPos,
        size: 9,
        font: timesFont,
        color: rgb(0.2, 0.2, 0.2),
      })
      yPos -= 11
    }

    page.drawText(`${article.source || "SPECIAL CORRESPONDENT"} | ${article.pubDate}`, {
      x: margin,
      y: yPos - 3,
      size: 7,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    })

    page.drawRectangle({
      x: 595 - margin - 75,
      y: yPos - 14,
      width: 70,
      height: 14,
      color: sentimentColor,
    })

    page.drawText(sentimentLabel, {
      x: 595 - margin - 72,
      y: yPos - 11,
      size: 7,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    })

    yPos -= 28
  }

  yPos -= 10

  page.drawText("MARKET SNAPSHOT", {
    x: margin,
    y: yPos,
    size: 12,
    font: timesBold,
    color: rgb(0, 0, 0),
  })

  page.drawLine({
    start: { x: margin, y: yPos - 4 },
    end: { x: margin + 70, y: yPos - 4 },
    thickness: 2,
    color: rgb(0.8, 0.1, 0.1),
  })

  yPos -= 18

  const colWidth = (pageWidth - 10) / 4
  const metrics = [
    { label: "COVERAGE", value: totalArticles.toString(), color: rgb(0.15, 0.45, 0.85) },
    { label: "CONFIDENCE", value: marketConfidence + "%", color: rgb(0.1, 0.7, 0.1) },
    { label: "VOLATILITY", value: volatilityIndex.toString(), color: rgb(0.8, 0.1, 0.1) },
    { label: "CREDIBILITY", value: Math.round(avgReliability * 100) + "%", color: rgb(0.8, 0.65, 0) },
  ]

  for (let i = 0; i < metrics.length; i++) {
    const xPos = margin + i * colWidth

    page.drawRectangle({
      x: xPos,
      y: yPos - 50,
      width: colWidth - 5,
      height: 50,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: metrics[i].color,
      borderWidth: 2,
    })

    page.drawText(metrics[i].label, {
      x: xPos + 8,
      y: yPos - 18,
      size: 7,
      font: helveticaBold,
      color: rgb(0.5, 0.5, 0.5),
    })

    page.drawText(metrics[i].value, {
      x: xPos + 8,
      y: yPos - 35,
      size: 18,
      font: timesBold,
      color: metrics[i].color,
    })
  }

  yPos -= 65

  page.drawText("SENTIMENT PULSE", {
    x: margin,
    y: yPos,
    size: 12,
    font: timesBold,
    color: rgb(0, 0, 0),
  })

  page.drawLine({
    start: { x: margin, y: yPos - 4 },
    end: { x: margin + 60, y: yPos - 4 },
    thickness: 2,
    color: rgb(0.8, 0.1, 0.1),
  })

  yPos -= 18

  const sentiments = [
    { label: "BULLISH", value: sentimentCounts.positive, percent: positivePercent, color: rgb(0.1, 0.7, 0.1) },
    { label: "NEUTRAL", value: sentimentCounts.neutral, percent: neutralPercent, color: rgb(0.5, 0.5, 0.5) },
    { label: "BEARISH", value: sentimentCounts.negative, percent: negativePercent, color: rgb(0.8, 0.1, 0.1) },
  ]

  for (const sentiment of sentiments) {
    page.drawText(sentiment.label, {
      x: margin,
      y: yPos,
      size: 9,
      font: helveticaBold,
      color: sentiment.color,
    })

    drawGradientBar(page, margin + 80, yPos - 6, 200, 12, sentiment.percent, sentiment.color)

    page.drawText(`${sentiment.value} (${sentiment.percent.toFixed(0)}%)`, {
      x: margin + 285,
      y: yPos,
      size: 8,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    })

    yPos -= 20
  }

  addFooter(page, pageNumber)
  pageNumber++

  page = pdfDoc.addPage([595, 842])
  yPos = addPageHeader(page, pageNumber)

  page.drawText("FEATURED ANALYSIS", {
    x: margin,
    y: yPos,
    size: 14,
    font: timesBold,
    color: rgb(0, 0, 0),
  })

  page.drawLine({
    start: { x: margin, y: yPos - 4 },
    end: { x: margin + 100, y: yPos - 4 },
    thickness: 3,
    color: rgb(0.8, 0.1, 0.1),
  })

  yPos -= 20

  const articlesToShow = Math.min(sanitizedArticles.length, 6)

  for (let i = 0; i < articlesToShow; i++) {
    const article = sanitizedArticles[i]
    const sentimentColor = article.sentiment === "positive" ? rgb(0.1, 0.7, 0.1) : article.sentiment === "negative" ? rgb(0.8, 0.1, 0.1) : rgb(0.5, 0.5, 0.5)

    if (yPos < 150) {
      addFooter(page, pageNumber)
      pageNumber++
      page = pdfDoc.addPage([595, 842])
      yPos = addPageHeader(page, pageNumber)
    }

    page.drawRectangle({
      x: margin,
      y: yPos - 80,
      width: 4,
      height: 80,
      color: sentimentColor,
    })

    const titleLines = wrapText(article.title, 85)
    page.drawText(titleLines[0], {
      x: margin + 10,
      y: yPos,
      size: 13,
      font: timesBold,
      color: rgb(0, 0, 0),
    })

    if (titleLines[1]) {
      page.drawText(titleLines[1], {
        x: margin + 10,
        y: yPos - 14,
        size: 13,
        font: timesBold,
        color: rgb(0, 0, 0),
      })
      yPos -= 14
    }

    yPos -= 18

    page.drawText(`${article.source || "STAFF REPORTER"} • ${article.pubDate}`, {
      x: margin + 10,
      y: yPos,
      size: 7,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    })

    const summaryLines = wrapText(article.summary.substring(0, 300), 95)
    yPos -= 12
    for (let j = 0; j < Math.min(summaryLines.length, 3); j++) {
      page.drawText(summaryLines[j], {
        x: margin + 10,
        y: yPos,
        size: 8,
        font: timesFont,
        color: rgb(0.2, 0.2, 0.2),
      })
      yPos -= 10
    }

    yPos -= 15
  }

  addFooter(page, pageNumber)
  pageNumber++

  page = pdfDoc.addPage([595, 842])
  yPos = addPageHeader(page, pageNumber)

  page.drawText("SECTOR ANALYSIS", {
    x: margin,
    y: yPos,
    size: 14,
    font: timesBold,
    color: rgb(0, 0, 0),
  })

  page.drawLine({
    start: { x: margin, y: yPos - 4 },
    end: { x: margin + 90, y: yPos - 4 },
    thickness: 3,
    color: rgb(0.8, 0.1, 0.1),
  })

  yPos -= 20

  const maxTopic = Math.max(...topTopics.map((t) => t[1]), 1)

  for (let i = 0; i < Math.min(topTopics.length, 5); i++) {
    const [topic, count] = topTopics[i]
    const percent = (count / maxTopic) * 100
    const topicColor = getTopicColor(i)
    const share = ((count / totalArticles) * 100).toFixed(1)

    page.drawText(topic.toUpperCase(), {
      x: margin,
      y: yPos,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    })

    drawGradientBar(page, margin + 120, yPos - 8, 280, 14, percent, topicColor)

    page.drawText(`${count} articles (${share}%)`, {
      x: margin + 405,
      y: yPos,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    })

    yPos -= 25
  }

  yPos -= 10

  page.drawText("SOURCE CREDIBILITY", {
    x: margin,
    y: yPos,
    size: 12,
    font: timesBold,
    color: rgb(0, 0, 0),
  })

  page.drawLine({
    start: { x: margin, y: yPos - 4 },
    end: { x: margin + 80, y: yPos - 4 },
    thickness: 2,
    color: rgb(0.8, 0.1, 0.1),
  })

  yPos -= 18

  const maxSource = Math.max(...topSources.map((s) => s[1]), 1)

  for (const [source, count] of topSources.slice(0, 3)) {
    const percent = (count / maxSource) * 100
    const share = ((count / totalArticles) * 100).toFixed(1)

    page.drawRectangle({
      x: margin,
      y: yPos - 35,
      width: pageWidth,
      height: 35,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
    })

    page.drawText(source.substring(0, 40), {
      x: margin + 10,
      y: yPos - 10,
      size: 9,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    })

    drawGradientBar(page, margin + 180, yPos - 18, 220, 10, percent, rgb(0.15, 0.45, 0.85))

    page.drawText(`${count} articles (${share}%)`, {
      x: margin + 405,
      y: yPos - 10,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    })

    yPos -= 45
  }

  yPos -= 10

  page.drawText("EDITORIAL INSIGHT", {
    x: margin,
    y: yPos,
    size: 12,
    font: timesBold,
    color: rgb(0, 0, 0),
  })

  page.drawLine({
    start: { x: margin, y: yPos - 4 },
    end: { x: margin + 75, y: yPos - 4 },
    thickness: 2,
    color: rgb(0.8, 0.1, 0.1),
  })

  yPos -= 18

  const insights = [
    topTopics[0] ? `Market focus centres on ${topTopics[0][0].toLowerCase()}, which accounts for ${topTopics[0][1]} articles.` : "",
    `Sentiment analysis shows ${sentimentCounts.positive} positive, ${sentimentCounts.neutral} neutral, and ${sentimentCounts.negative} negative reports.`,
    `Source credibility rating: ${Math.round(avgReliability * 100)}% institutional grade.`,
  ]

  for (const insight of insights) {
    if (!insight) continue
    const lines = wrapText(insight, 105)
    for (const line of lines) {
      page.drawText(line, {
        x: margin + 15,
        y: yPos,
        size: 8,
        font: timesFont,
        color: rgb(0.2, 0.2, 0.2),
      })
      yPos -= 11
    }
    yPos -= 5
  }

  addFooter(page, pageNumber)

  const pdfBytes = await pdfDoc.save()
  const pdfBuffer = Buffer.from(pdfBytes)
  const fileName = `daily_digest_${dayjs().format("YYYY_MM_DD_HHmmss")}.pdf`
  const publicUrl = await uploadPDFToSupabase(new Uint8Array(pdfBuffer), userId, fileName)

  await savePDFMetadata(userId, fileName, publicUrl, {
    articlesCount: articles.length,
    hasHistorical: Object.keys(historicalDigests).length > 0,
    generatedAt: new Date().toISOString(),
    fileSizeBytes: pdfBuffer.length,
  })

  return publicUrl
}