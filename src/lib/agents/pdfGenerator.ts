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
    rgb(0.15, 0.45, 0.85), // Deep blue
    rgb(0.85, 0.25, 0.15), // Deep red
    rgb(0.15, 0.75, 0.35), // Forest green
    rgb(0.85, 0.65, 0.15), // Gold
    rgb(0.55, 0.15, 0.75), // Deep purple
    rgb(0.15, 0.65, 0.75), // Teal
    rgb(0.75, 0.15, 0.35), // Burgundy
    rgb(0.45, 0.45, 0.15), // Olive
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
  // Background bar
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(0.92, 0.92, 0.92),
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.3,
  })

  // Filled portion with subtle shadow effect
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
  if (reliable.length === 0) return 0
  return reliable.reduce((sum, a) => sum + (a.reliability || 0), 0) / reliable.length
}

function calculateVolatilityIndex(sentimentCounts: Record<string, number>): number {
  const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0)
  if (total === 0) return 0

  const positive = sentimentCounts.positive / total
  const negative = sentimentCounts.negative / total
  const neutral = sentimentCounts.neutral / total

  // Volatility increases when sentiment is polarized
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

  // Confidence is higher with positive sentiment and reliable sources
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
  const articlesToProcess = articles

  const sanitizedArticles = articlesToProcess.map((article) => ({
    ...article,
    title: sanitizeTextForPDF(article.title),
    summary: sanitizeTextForPDF(article.summary),
    source: article.source ? sanitizeTextForPDF(article.source) : undefined,
    topic: sanitizeTextForPDF(article.topic),
  }))

  const pdfDoc = await PDFDocument.create()

  const contentFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const contentFontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const headingFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const headingFontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 }
  const topicCounts: Record<string, number> = {}
  const sourceCount: Record<string, number> = {}
  const topicSentiments = calculateSentimentByTopic(sanitizedArticles)

  for (const a of sanitizedArticles) {
    sentimentCounts[a.sentiment]++
    topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1
    if (a.source) {
      sourceCount[a.source] = (sourceCount[a.source] || 0) + 1
    }
  }

  const margin = 40
  const pageWidth = 595 - 2 * margin
  const currentDate = dayjs().format("dddd, MMMM DD, YYYY")
  const generatedTime = dayjs().format("HH:mm")

  let pageNumber = 1

  const addHeader = (page: PDFPage, isFirst = false) => {
    if (isFirst) {
      // Masthead background
      page.drawRectangle({
        x: 0,
        y: 760,
        width: 595,
        height: 82,
        color: rgb(0.05, 0.15, 0.35),
      })

      // Decorative line
      page.drawLine({
        start: { x: 0, y: 758 },
        end: { x: 595, y: 758 },
        thickness: 2,
        color: rgb(0.85, 0.65, 0.15),
      })

      page.drawText("MARKET INTELLIGENCE DIGEST", {
        x: margin,
        y: 820,
        size: 32,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      })

      page.drawText("AI-Powered Financial News Analysis & Market Sentiment Report", {
        x: margin,
        y: 795,
        size: 9,
        font: contentFont,
        color: rgb(0.75, 0.85, 0.95),
      })

      page.drawText(currentDate, {
        x: 595 - margin - 120,
        y: 820,
        size: 10,
        font: contentFont,
        color: rgb(0.85, 0.85, 0.85),
      })

      return 740
    } else {
      // Secondary page header
      page.drawRectangle({
        x: margin,
        y: 790,
        width: pageWidth,
        height: 30,
        color: rgb(0.05, 0.15, 0.35),
      })

      page.drawLine({
        start: { x: margin, y: 788 },
        end: { x: 595 - margin, y: 788 },
        thickness: 1,
        color: rgb(0.85, 0.65, 0.15),
      })

      page.drawText("Market Intelligence Digest", {
        x: margin + 10,
        y: 803,
        size: 12,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      })

      page.drawText(`Page ${pageNumber}`, {
        x: 595 - margin - 30,
        y: 803,
        size: 10,
        font: contentFont,
        color: rgb(0.85, 0.85, 0.85),
      })

      return 775
    }
  }

  const addFooter = (page: PDFPage, num: number) => {
    page.drawLine({
      start: { x: margin, y: 45 },
      end: { x: 595 - margin, y: 45 },
      thickness: 1,
      color: rgb(0.85, 0.65, 0.15),
    })

    page.drawText("© 2025 Market Intelligence Digest | Confidential", {
      x: margin,
      y: 32,
      size: 7,
      font: contentFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    page.drawText(`Generated: ${dayjs().format("YYYY-MM-DD HH:mm")}`, {
      x: 595 - margin - 120,
      y: 32,
      size: 7,
      font: contentFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    page.drawText(`${num}`, {
      x: 595 - margin - 15,
      y: 32,
      size: 8,
      font: contentFontBold,
      color: rgb(0.05, 0.15, 0.35),
    })
  }

  let page = pdfDoc.addPage([595, 842])
  let yPos = addHeader(page, true)

  yPos -= 15

  const totalArticles = sanitizedArticles.length
  const avgReliability = calculateAverageReliability(sanitizedArticles)
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])
  const topSources = Object.entries(sourceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  const volatilityIndex = calculateVolatilityIndex(sentimentCounts)
  const marketConfidence = calculateMarketConfidence(sanitizedArticles, avgReliability)

  page.drawRectangle({
    x: margin,
    y: yPos - 85,
    width: pageWidth,
    height: 85,
    color: rgb(0.94, 0.96, 0.99),
    borderColor: rgb(0.05, 0.15, 0.35),
    borderWidth: 2,
  })

  page.drawText("EXECUTIVE SUMMARY", {
    x: margin + 12,
    y: yPos - 15,
    size: 12,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  const summaryLines = wrapText(
    `This comprehensive digest analyzes ${totalArticles} articles from ${topSources.length} premium news sources. Market sentiment is predominantly ${Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0]} with ${topTopics[0]?.[1] || 0} articles focused on ${topTopics[0]?.[0] || "general"} developments. Source credibility averages ${(avgReliability * 100).toFixed(0)}%, indicating institutional-grade coverage.`,
    95,
  )

  let summaryY = yPos - 32
  for (const line of summaryLines) {
    page.drawText(line, {
      x: margin + 12,
      y: summaryY,
      size: 8,
      font: contentFont,
      color: rgb(0.1, 0.1, 0.1),
    })
    summaryY -= 10
  }

  yPos -= 105

  page.drawText("KEY PERFORMANCE INDICATORS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const kpis = [
    { label: "Total Coverage", value: totalArticles.toString(), unit: "articles", color: rgb(0.15, 0.45, 0.85) },
    { label: "Market Confidence", value: marketConfidence.toString(), unit: "%", color: rgb(0.15, 0.75, 0.35) },
    { label: "Volatility Index", value: volatilityIndex.toString(), unit: "pts", color: rgb(0.85, 0.25, 0.15) },
    { label: "Source Credibility", value: (avgReliability * 100).toFixed(0), unit: "%", color: rgb(0.85, 0.65, 0.15) },
  ]

  const kpiWidth = (pageWidth - 20) / 4

  for (let i = 0; i < kpis.length; i++) {
    const kpiX = margin + 10 + i * kpiWidth

    page.drawRectangle({
      x: kpiX,
      y: yPos - 70,
      width: kpiWidth - 5,
      height: 70,
      color: rgb(1, 1, 1),
      borderColor: kpis[i].color,
      borderWidth: 2,
    })

    // Color accent bar at top
    page.drawRectangle({
      x: kpiX,
      y: yPos - 8,
      width: kpiWidth - 5,
      height: 8,
      color: kpis[i].color,
    })

    page.drawText(kpis[i].label, {
      x: kpiX + 8,
      y: yPos - 25,
      size: 7,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    })

    page.drawText(kpis[i].value + kpis[i].unit, {
      x: kpiX + 8,
      y: yPos - 50,
      size: 18,
      font: headingFontBold,
      color: kpis[i].color,
    })
  }

  yPos -= 90

  page.drawText("MARKET SENTIMENT ANALYSIS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const sentimentTotal = sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral
  const positivePercent = sentimentTotal > 0 ? (sentimentCounts.positive / sentimentTotal) * 100 : 0
  const negativePercent = sentimentTotal > 0 ? (sentimentCounts.negative / sentimentTotal) * 100 : 0
  const neutralPercent = sentimentTotal > 0 ? (sentimentCounts.neutral / sentimentTotal) * 100 : 0

  const sentiments = [
    {
      label: "Bullish",
      value: sentimentCounts.positive,
      percent: positivePercent,
      color: rgb(0.15, 0.75, 0.35),
      signal: "[+]",
    },
    {
      label: "Neutral",
      value: sentimentCounts.neutral,
      percent: neutralPercent,
      color: rgb(0.5, 0.5, 0.5),
      signal: "[=]",
    },
    {
      label: "Bearish",
      value: sentimentCounts.negative,
      percent: negativePercent,
      color: rgb(0.85, 0.25, 0.15),
      signal: "[-]",
    },
  ]

  for (const sentiment of sentiments) {
    page.drawText(`${sentiment.signal} ${sentiment.label}`, {
      x: margin,
      y: yPos,
      size: 10,
      font: contentFontBold,
      color: sentiment.color,
    })

    drawGradientBar(page, margin + 100, yPos - 10, 220, 16, sentiment.percent, sentiment.color)

    page.drawText(`${sentiment.value} (${sentiment.percent.toFixed(1)}%)`, {
      x: margin + 330,
      y: yPos,
      size: 9,
      font: contentFontBold,
      color: rgb(0.1, 0.1, 0.1),
    })

    yPos -= 26
  }

  addFooter(page, pageNumber)
  pageNumber++

  page = pdfDoc.addPage([595, 842])
  yPos = addHeader(page)

  page.drawText("FEATURED STORIES", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const articlesToShow = Math.min(sanitizedArticles.length, 5)

  for (let i = 0; i < articlesToShow; i++) {
    const article = sanitizedArticles[i]
    const sentimentColor =
      article.sentiment === "positive"
        ? rgb(0.15, 0.75, 0.35)
        : article.sentiment === "negative"
          ? rgb(0.85, 0.25, 0.15)
          : rgb(0.5, 0.5, 0.5)

    const sentimentLabel =
      article.sentiment === "positive" ? "BULLISH" : article.sentiment === "negative" ? "BEARISH" : "NEUTRAL"

    page.drawRectangle({
      x: margin,
      y: yPos - 80,
      width: pageWidth,
      height: 80,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: 1,
    })

    // Left accent bar
    page.drawRectangle({
      x: margin,
      y: yPos - 80,
      width: 4,
      height: 80,
      color: sentimentColor,
    })

    const titleLines = wrapText(article.title, 80)
    page.drawText(titleLines[0], {
      x: margin + 12,
      y: yPos - 15,
      size: 11,
      font: headingFontBold,
      color: rgb(0, 0, 0),
    })

    page.drawText(`${article.source || "Unknown"} • ${article.pubDate || "N/A"}`, {
      x: margin + 12,
      y: yPos - 32,
      size: 7,
      font: contentFont,
      color: rgb(0.5, 0.5, 0.5),
    })

    const summaryLines = wrapText(article.summary, 85)
    let summaryY = yPos - 45
    for (let j = 0; j < Math.min(summaryLines.length, 2); j++) {
      page.drawText(summaryLines[j], {
        x: margin + 12,
        y: summaryY,
        size: 7,
        font: contentFont,
        color: rgb(0.3, 0.3, 0.3),
      })
      summaryY -= 9
    }

    // Sentiment badge
    page.drawRectangle({
      x: 595 - margin - 85,
      y: yPos - 30,
      width: 80,
      height: 16,
      color: sentimentColor,
    })

    page.drawText(sentimentLabel, {
      x: 595 - margin - 82,
      y: yPos - 27,
      size: 8,
      font: contentFontBold,
      color: rgb(1, 1, 1),
    })

    yPos -= 95
  }

  addFooter(page, pageNumber)
  pageNumber++

  // If newsType is "all", show articles organized by category
  if (newsType?.toLowerCase() === "all") {
    // Group articles by category
    const articlesByCategory: Record<string, typeof sanitizedArticles> = {}
    const categoryOrder = ["national", "international", "tech", "sports", "regional", "general"]

    for (const article of sanitizedArticles) {
      const category = article.category || article.topic || "general"
      if (!articlesByCategory[category]) {
        articlesByCategory[category] = []
      }
      articlesByCategory[category].push(article)
    }

    // Sort categories by order
    const sortedCategories = Object.keys(articlesByCategory).sort((a, b) => {
      const indexA = categoryOrder.indexOf(a.toLowerCase())
      const indexB = categoryOrder.indexOf(b.toLowerCase())
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
    })

    for (const category of sortedCategories) {
      const categoryArticles = articlesByCategory[category]

      // Check if we need a new page
      if (yPos < 200) {
        addFooter(page, pageNumber)
        pageNumber++
        page = pdfDoc.addPage([595, 842])
        yPos = addHeader(page)
      }

      // Category header
      const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1)
      page.drawRectangle({
        x: margin,
        y: yPos - 22,
        width: pageWidth,
        height: 22,
        color: rgb(0.05, 0.15, 0.35),
      })

      page.drawText(categoryTitle.toUpperCase(), {
        x: margin + 10,
        y: yPos - 16,
        size: 11,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      })

      yPos -= 32

      // Show up to 3 articles per category
      for (let i = 0; i < Math.min(categoryArticles.length, 3); i++) {
        const article = categoryArticles[i]

        if (yPos < 140) {
          addFooter(page, pageNumber)
          pageNumber++
          page = pdfDoc.addPage([595, 842])
          yPos = addHeader(page)
        }

        const sentimentColor =
          article.sentiment === "positive"
            ? rgb(0.15, 0.75, 0.35)
            : article.sentiment === "negative"
              ? rgb(0.85, 0.25, 0.15)
              : rgb(0.5, 0.5, 0.5)

        page.drawRectangle({
          x: margin,
          y: yPos - 55,
          width: pageWidth,
          height: 55,
          color: rgb(0.98, 0.98, 0.99),
          borderColor: rgb(0.75, 0.75, 0.75),
          borderWidth: 0.5,
        })

        const titleLines = wrapText(article.title, 85)
        page.drawText(titleLines[0], {
          x: margin + 10,
          y: yPos - 12,
          size: 9,
          font: headingFontBold,
          color: rgb(0.05, 0.15, 0.35),
        })

        page.drawText(`${article.source || "Unknown"}`, {
          x: margin + 10,
          y: yPos - 25,
          size: 7,
          font: contentFont,
          color: rgb(0.5, 0.5, 0.5),
        })

        const summaryLines = wrapText(article.summary, 100)
        let summaryY = yPos - 35
        if (summaryLines.length > 0) {
          page.drawText(summaryLines[0], {
            x: margin + 10,
            y: summaryY,
            size: 7,
            font: contentFont,
            color: rgb(0.3, 0.3, 0.3),
          })
        }

        page.drawRectangle({
          x: 595 - margin - 60,
          y: yPos - 20,
          width: 55,
          height: 12,
          color: sentimentColor,
        })

        page.drawText(article.sentiment.toUpperCase(), {
          x: 595 - margin - 57,
          y: yPos - 18,
          size: 6,
          font: contentFontBold,
          color: rgb(1, 1, 1),
        })

        yPos -= 65
      }

      yPos -= 8
    }

    addFooter(page, pageNumber)
    pageNumber++
  }

  page = pdfDoc.addPage([595, 842])
  yPos = addHeader(page)

  page.drawText("TOPIC DISTRIBUTION & MARKET FOCUS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const maxTopic = Math.max(...topTopics.map((t) => t[1]), 1)

  for (let i = 0; i < Math.min(topTopics.length, 6); i++) {
    const [topic, count] = topTopics[i]
    const percent = (count / maxTopic) * 100
    const topicColor = getTopicColor(i)
    const marketShare = ((count / totalArticles) * 100).toFixed(1)

    page.drawText(topic, {
      x: margin,
      y: yPos,
      size: 10,
      font: contentFontBold,
      color: rgb(0.05, 0.15, 0.35),
    })

    drawGradientBar(page, margin + 150, yPos - 10, 240, 16, percent, topicColor)

    page.drawText(`${count} articles (${marketShare}%)`, {
      x: margin + 400,
      y: yPos,
      size: 9,
      font: contentFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    yPos -= 26
  }

  yPos -= 15

  page.drawText("SENTIMENT BREAKDOWN BY TOPIC", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const tableHeight = Math.min(topTopics.length, 5) * 24 + 30

  page.drawRectangle({
    x: margin,
    y: yPos - tableHeight,
    width: pageWidth,
    height: tableHeight,
    borderColor: rgb(0.05, 0.15, 0.35),
    borderWidth: 1.5,
  })

  // Table header
  page.drawRectangle({
    x: margin,
    y: yPos - 25,
    width: pageWidth,
    height: 25,
    color: rgb(0.05, 0.15, 0.35),
  })

  page.drawText("TOPIC", {
    x: margin + 10,
    y: yPos - 17,
    size: 9,
    font: headingFontBold,
    color: rgb(1, 1, 1),
  })

  page.drawText("BULLISH", {
    x: margin + 180,
    y: yPos - 17,
    size: 9,
    font: headingFontBold,
    color: rgb(0.85, 1, 0.85),
  })

  page.drawText("BEARISH", {
    x: margin + 270,
    y: yPos - 17,
    size: 9,
    font: headingFontBold,
    color: rgb(1, 0.85, 0.85),
  })

  page.drawText("NEUTRAL", {
    x: margin + 360,
    y: yPos - 17,
    size: 9,
    font: headingFontBold,
    color: rgb(0.95, 0.95, 0.95),
  })

  let topicRowY = yPos - 48
  for (let i = 0; i < Math.min(topTopics.length, 5); i++) {
    const topic = topTopics[i][0]
    const sentiments = topicSentiments.get(topic) || { positive: 0, negative: 0, neutral: 0 }

    const bgColor = i % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1)
    page.drawRectangle({
      x: margin,
      y: topicRowY - 20,
      width: pageWidth,
      height: 20,
      color: bgColor,
    })

    page.drawText(topic.substring(0, 25), {
      x: margin + 10,
      y: topicRowY - 15,
      size: 9,
      font: contentFont,
      color: rgb(0.05, 0.15, 0.35),
    })

    page.drawText(sentiments.positive.toString(), {
      x: margin + 180,
      y: topicRowY - 15,
      size: 9,
      font: contentFontBold,
      color: rgb(0.15, 0.75, 0.35),
    })

    page.drawText(sentiments.negative.toString(), {
      x: margin + 270,
      y: topicRowY - 15,
      size: 9,
      font: contentFontBold,
      color: rgb(0.85, 0.25, 0.15),
    })

    page.drawText(sentiments.neutral.toString(), {
      x: margin + 360,
      y: topicRowY - 15,
      size: 9,
      font: contentFontBold,
      color: rgb(0.5, 0.5, 0.5),
    })

    topicRowY -= 24
  }

  addFooter(page, pageNumber)
  pageNumber++

  page = pdfDoc.addPage([595, 842])
  yPos = addHeader(page)

  page.drawText("SOURCE ANALYSIS & CREDIBILITY ASSESSMENT", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const maxSource = Math.max(...topSources.map((s) => s[1]), 1)

  for (const [source, count] of topSources) {
    const percent = (count / maxSource) * 100
    const sourceShare = ((count / totalArticles) * 100).toFixed(1)

    page.drawRectangle({
      x: margin,
      y: yPos - 40,
      width: pageWidth,
      height: 40,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: 1,
    })

    page.drawText(source, {
      x: margin + 12,
      y: yPos - 12,
      size: 10,
      font: contentFontBold,
      color: rgb(0.05, 0.15, 0.35),
    })

    drawGradientBar(page, margin + 200, yPos - 25, 200, 14, percent, rgb(0.15, 0.45, 0.85))

    page.drawText(`${count} articles (${sourceShare}%)`, {
      x: margin + 410,
      y: yPos - 12,
      size: 9,
      font: contentFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    yPos -= 50
  }

  yPos -= 10

  page.drawText("MARKET INTELLIGENCE & STRATEGIC INSIGHTS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const insights = []

  const topicLeader = topTopics[0]
  if (topicLeader) {
    insights.push(
      `Market Focus: ${topicLeader[0]} dominates institutional coverage with ${topicLeader[1]} articles, representing ${((topicLeader[1] / totalArticles) * 100).toFixed(1)}% of total market discourse.`,
    )
  }

  const sentimentLeader = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]
  const sentimentPercent = sentimentTotal > 0 ? ((sentimentLeader[1] / totalArticles) * 100).toFixed(1) : "0"
  const outlookText =
    sentimentLeader[0] === "positive"
      ? "bullish market outlook with growth potential"
      : sentimentLeader[0] === "negative"
        ? "bearish market conditions requiring defensive positioning"
        : "neutral market stance with balanced risk-reward dynamics"
  insights.push(
    `Sentiment Profile: ${sentimentPercent}% of coverage exhibits ${sentimentLeader[0]} sentiment, indicating ${outlookText}.`,
  )

  if (avgReliability >= 0.8) {
    insights.push(
      `Data Quality: High-credibility sources dominate (${(avgReliability * 100).toFixed(0)}% institutional grade), ensuring reliable market intelligence for strategic decision-making.`,
    )
  }

  if (volatilityIndex > 60) {
    insights.push(
      `Market Volatility: Elevated volatility index (${volatilityIndex} pts) indicates polarized sentiment distribution, suggesting heightened market uncertainty and potential trading opportunities.`,
    )
  }

  for (let i = 0; i < insights.length; i++) {
    const lines = wrapText(insights[i], 100)
    const boxHeight = lines.length * 11 + 18

    const bgColor = i === 0 ? rgb(0.94, 0.97, 1) : i === 1 ? rgb(0.97, 0.94, 1) : rgb(0.94, 1, 0.97)
    const borderColor = i === 0 ? rgb(0.15, 0.45, 0.85) : i === 1 ? rgb(0.55, 0.15, 0.75) : rgb(0.15, 0.75, 0.35)

    page.drawRectangle({
      x: margin,
      y: yPos - boxHeight,
      width: pageWidth,
      height: boxHeight,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 1.5,
    })

    page.drawText(`• ${lines[0]}`, {
      x: margin + 12,
      y: yPos - 13,
      size: 8,
      font: contentFontBold,
      color: borderColor,
    })

    let insightY = yPos - 24
    for (let j = 1; j < lines.length; j++) {
      page.drawText(lines[j], {
        x: margin + 15,
        y: insightY,
        size: 8,
        font: contentFont,
        color: rgb(0.1, 0.1, 0.1),
      })
      insightY -= 11
    }

    yPos -= boxHeight + 14
  }

  addFooter(page, pageNumber)
  pageNumber++

  if (Object.keys(historicalDigests).length > 0) {
    page = pdfDoc.addPage([595, 842])
    yPos = addHeader(page)

    page.drawText("7-DAY HISTORICAL TREND ANALYSIS", {
      x: margin,
      y: yPos,
      size: 13,
      font: headingFontBold,
      color: rgb(0.05, 0.15, 0.35),
    })

    yPos -= 25

    const historicalDates = Object.keys(historicalDigests).sort().slice(-7)

    page.drawRectangle({
      x: margin,
      y: yPos - (historicalDates.length * 22 + 35),
      width: pageWidth,
      height: historicalDates.length * 22 + 35,
      borderColor: rgb(0.05, 0.15, 0.35),
      borderWidth: 1.5,
    })

    page.drawRectangle({
      x: margin,
      y: yPos - 30,
      width: pageWidth,
      height: 30,
      color: rgb(0.05, 0.15, 0.35),
    })

    page.drawText("DATE", {
      x: margin + 10,
      y: yPos - 19,
      size: 9,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    })

    page.drawText("COVERAGE", {
      x: margin + 100,
      y: yPos - 19,
      size: 9,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    })

    page.drawText("SENTIMENT", {
      x: margin + 200,
      y: yPos - 19,
      size: 9,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    })

    page.drawText("TREND", {
      x: margin + 310,
      y: yPos - 19,
      size: 9,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    })

    page.drawText("TOP TOPIC", {
      x: margin + 380,
      y: yPos - 19,
      size: 9,
      font: headingFontBold,
      color: rgb(1, 1, 1),
    })

    let histRowY = yPos - 58
    let previousCount = 0

    for (const date of historicalDates) {
      const digest = historicalDigests[date]
      const totalArt = Object.values(digest.topicCounts).reduce((a, b) => a + b, 0)
      const topicHist = Object.entries(digest.topicCounts).sort((a, b) => b[1] - a[1])[0]
      const sentimentHist = Object.entries(digest.sentimentCounts).sort((a, b) => b[1] - a[1])[0][0]
      const trend = calculateTrendDirection(totalArt, previousCount)

      const bgColor = histRowY % 44 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1)
      page.drawRectangle({
        x: margin,
        y: histRowY - 20,
        width: pageWidth,
        height: 20,
        color: bgColor,
      })

      page.drawText(date, {
        x: margin + 10,
        y: histRowY - 14,
        size: 8,
        font: contentFont,
        color: rgb(0.05, 0.15, 0.35),
      })

      page.drawText(totalArt.toString(), {
        x: margin + 100,
        y: histRowY - 14,
        size: 9,
        font: contentFontBold,
        color: rgb(0.15, 0.45, 0.85),
      })

      page.drawText(sentimentHist, {
        x: margin + 200,
        y: histRowY - 14,
        size: 8,
        font: contentFont,
        color: rgb(0.05, 0.15, 0.35),
      })

      const trendColor =
        trend.direction === "↑"
          ? rgb(0.15, 0.75, 0.35)
          : trend.direction === "↓"
            ? rgb(0.85, 0.25, 0.15)
            : rgb(0.5, 0.5, 0.5)
      page.drawText(`${trend.direction} ${trend.percentage.toFixed(1)}%`, {
        x: margin + 310,
        y: histRowY - 14,
        size: 8,
        font: contentFontBold,
        color: trendColor,
      })

      page.drawText((topicHist?.[0] || "N/A").substring(0, 18), {
        x: margin + 380,
        y: histRowY - 14,
        size: 8,
        font: contentFont,
        color: rgb(0.05, 0.15, 0.35),
      })

      histRowY -= 22
      previousCount = totalArt
    }

    addFooter(page, pageNumber)
    pageNumber++
  }

  page = pdfDoc.addPage([595, 842])
  yPos = addHeader(page)

  page.drawText("STRATEGIC RECOMMENDATIONS & ACTION ITEMS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.15, 0.35),
  })

  yPos -= 25

  const recommendations = []

  if (positivePercent > 55) {
    recommendations.push({
      type: "BULLISH",
      text: "Strong positive sentiment detected. Consider increasing exposure to growth opportunities in dominant sectors.",
    })
  } else if (negativePercent > 45) {
    recommendations.push({
      type: "BEARISH",
      text: "Significant negative sentiment warrants defensive positioning. Implement risk management protocols and monitor volatility.",
    })
  } else {
    recommendations.push({
      type: "NEUTRAL",
      text: "Balanced sentiment suggests stable conditions. Maintain current positioning with heightened monitoring.",
    })
  }

  if (volatilityIndex > 70) {
    recommendations.push({
      type: "ALERT",
      text: "High volatility index indicates market uncertainty. Exercise caution in new positions and consider hedging strategies.",
    })
  }

  if (avgReliability < 0.75) {
    recommendations.push({
      type: "WARNING",
      text: "Source credibility below institutional threshold. Cross-reference findings with additional premium sources.",
    })
  }

  if (topSources.length < 4) {
    recommendations.push({
      type: "INFO",
      text: "Limited source diversity detected. Expand monitoring network to reduce potential bias in market analysis.",
    })
  }

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i]
    const lines = wrapText(rec.text, 100)
    const boxHeight = lines.length * 11 + 22

    let bgColor = rgb(0.94, 0.96, 0.99)
    let borderColor = rgb(0.05, 0.15, 0.35)

    if (rec.type === "BULLISH") {
      bgColor = rgb(0.94, 1, 0.94)
      borderColor = rgb(0.15, 0.75, 0.35)
    } else if (rec.type === "BEARISH") {
      bgColor = rgb(1, 0.94, 0.94)
      borderColor = rgb(0.85, 0.25, 0.15)
    } else if (rec.type === "ALERT" || rec.type === "WARNING") {
      bgColor = rgb(1, 0.97, 0.94)
      borderColor = rgb(0.85, 0.65, 0.15)
    }

    page.drawRectangle({
      x: margin,
      y: yPos - boxHeight,
      width: pageWidth,
      height: boxHeight,
      color: bgColor,
      borderColor: borderColor,
      borderWidth: 2,
    })

    page.drawText(`[${rec.type}] ${lines[0]}`, {
      x: margin + 12,
      y: yPos - 15,
      size: 9,
      font: headingFontBold,
      color: borderColor,
    })

    let recY = yPos - 26
    for (let j = 1; j < lines.length; j++) {
      page.drawText(lines[j], {
        x: margin + 12,
        y: recY,
        size: 8,
        font: contentFont,
        color: rgb(0.1, 0.1, 0.1),
      })
      recY -= 11
    }

    yPos -= boxHeight + 16
  }

  addFooter(page, pageNumber)

  const pdfBytes = await pdfDoc.save()
  const pdfBuffer = Buffer.from(pdfBytes)
  const fileName = `market_digest_${dayjs().format("YYYY_MM_DD_HHmmss")}.pdf`
  const publicUrl = await uploadPDFToSupabase(new Uint8Array(pdfBuffer), userId, fileName)

  await savePDFMetadata(userId, fileName, publicUrl, {
    articlesCount: articles.length,
    hasHistorical: Object.keys(historicalDigests).length > 0,
    generatedAt: new Date().toISOString(),
    fileSizeBytes: pdfBuffer.length,
  })

  return publicUrl
}
