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

function wrapText(text: string | null | undefined, maxCharsPerLine: number): string[] {
  if (!text) {
    return [""]
  }
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

function sanitizeTextForPDF(text: string | null | undefined): string {
  if (!text) {
    return ""
  }
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
    .replace(/₹/g, "Rs.")
    .replace(/°/g, "deg")
    .replace(/•/g, "|")
    .replace(/©/g, "(C)")
    .replace(/▲/g, "^")
    .replace(/▼/g, "v")
    .replace(/↑/g, "^")
    .replace(/↓/g, "v")
    .replace(/→/g, "->")
    .replace(/⚠/g, "!")
    .replace(/[^\x00-\x7F]/g, "")
    .trim()
}

// Helper function to safely draw text to PDF
function drawTextSafe(page: PDFPage, text: string | null | undefined, options: any) {
  const sanitizedText = sanitizeTextForPDF(text)
  if (sanitizedText) {
    page.drawText(sanitizedText, options)
  }
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
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.3,
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
  if (previous === 0) return { direction: "->", percentage: 0 }
  const change = ((current - previous) / previous) * 100
  return {
    direction: change > 0 ? "^" : change < 0 ? "v" : "->",
    percentage: Math.abs(change),
  }
}

function calculateSentimentByTopic(articles: Article[]): Map<string, Record<string, number>> {
  const topicSentiments = new Map<string, Record<string, number>>()

  for (const article of articles) {
    const topic = article.topic || "general"
    if (!topicSentiments.has(topic)) {
      topicSentiments.set(topic, { positive: 0, negative: 0, neutral: 0 })
    }
    const sentiments = topicSentiments.get(topic)!
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

interface WeatherData {
  location: string
  temperature: number
  condition: string
  humidity?: number
  windSpeed?: number
  forecast?: Array<{
    day: string
    high: number
    low: number
    condition: string
    clouds?: number
  }>
}

interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume?: number
  marketCap?: string
  sector?: string
}

interface MarketIndices {
  nifty50?: StockData
  sensex?: StockData
  bankNifty?: StockData
  timestamp: string
}

async function fetchWeatherForCities(cities: string[]): Promise<WeatherData[]> {
  const weatherPromises = cities.map(async (city) => {
    try {
      if (!process.env.OPENWEATHER_API_KEY) {
        console.warn("⚠️ OPENWEATHER_API_KEY not configured, skipping weather data")
        return null
      }

      // Fetch current weather
      const currentResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
      )

      // Fetch 5-day forecast
      const forecastResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
      )

      if (!currentResponse.ok || !forecastResponse.ok) {
        console.warn(`⚠️ Failed to fetch weather for ${city}`)
        return null
      }

      const currentData = await currentResponse.json()
      const forecastData = await forecastResponse.json()

      // Process forecast data to get daily forecasts
      const dailyForecasts: Array<{
        day: string
        high: number
        low: number
        condition: string
        clouds?: number
      }> = []

      // Group forecast by day and get min/max temperatures
      const dailyData: Record<string, any> = {}
      
      forecastData.list.slice(0, 35).forEach((item: any) => { // 7 days * 5 forecasts per day
        const date = new Date(item.dt * 1000)
        const dayKey = date.toDateString()
        
        if (!dailyData[dayKey]) {
          dailyData[dayKey] = {
            temps: [],
            conditions: [],
            clouds: []
          }
        }
        
        dailyData[dayKey].temps.push(item.main.temp)
        dailyData[dayKey].conditions.push(item.weather[0].main)
        dailyData[dayKey].clouds.push(item.clouds?.all || 0)
      })

      // Convert to forecast array
      Object.entries(dailyData).slice(0, 7).forEach(([dateStr, data]: [string, any]) => {
        const date = new Date(dateStr)
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
        
        dailyForecasts.push({
          day: dayName,
          high: Math.round(Math.max(...data.temps)),
          low: Math.round(Math.min(...data.temps)),
          condition: data.conditions[0] || "Clear",
          clouds: Math.round(data.clouds.reduce((a: number, b: number) => a + b, 0) / data.clouds.length)
        })
      })

      return {
        location: `${currentData.name}`,
        temperature: Math.round(currentData.main.temp),
        condition: currentData.weather[0]?.main || "Unknown",
        humidity: currentData.main.humidity,
        windSpeed: Math.round(currentData.wind.speed * 3.6),
        forecast: dailyForecasts
      }
    } catch (err) {
      console.error(`Error fetching weather data for ${city}:`, err)
      return null
    }
  })

  const results = await Promise.all(weatherPromises)
  return results.filter(Boolean) as WeatherData[]
}

function getWeatherIcon(condition: string): string {
  const iconMap: Record<string, string> = {
    'Clear': 'SUN',
    'Clouds': 'CLO',
    'Rain': 'RAI',
    'Drizzle': 'DRZ',
    'Thunderstorm': 'THU',
    'Snow': 'SNO',
    'Mist': 'MIS',
    'Fog': 'FOG',
    'Haze': 'HAZ'
  }
  return iconMap[condition] || 'PAR'
}

async function fetchMarketIndices(): Promise<MarketIndices | null> {
  try {
    // Using Yahoo Finance API for real market data
    const symbols = [
      { symbol: '%5ENSEI', name: 'NIFTY 50', key: 'nifty50' },
      { symbol: '%5EBSESN', name: 'BSE SENSEX', key: 'sensex' },
      { symbol: '%5ENSMIDCP', name: 'NIFTY BANK', key: 'bankNifty' }
    ]

    const marketData: MarketIndices = {
      timestamp: new Date().toISOString()
    }

    // Fetch data for each index
    for (const { symbol, name, key } of symbols) {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        )

        if (!response.ok) {
          console.warn(`⚠️ Failed to fetch data for ${name}`)
          continue
        }

        const data = await response.json()
        const chart = data.chart?.result?.[0]
        
        if (!chart) {
          console.warn(`⚠️ No chart data for ${name}`)
          continue
        }

        const meta = chart.meta
        const quote = chart.indicators?.quote?.[0]
        
        if (!meta || !quote) {
          console.warn(`⚠️ Invalid data structure for ${name}`)
          continue
        }

        const currentPrice = meta.regularMarketPrice || quote.close?.[quote.close.length - 1]
        const previousClose = meta.previousClose || meta.chartPreviousClose
        
        if (currentPrice && previousClose) {
          const change = currentPrice - previousClose
          const changePercent = (change / previousClose) * 100

          const stockData: StockData = {
            symbol: symbol.replace('%5E', '^'),
            name: name,
            price: Math.round(currentPrice * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            volume: meta.regularMarketVolume,
            marketCap: meta.marketCap ? `Rs.${(meta.marketCap / 1e12).toFixed(2)}T` : undefined
          }

          marketData[key as keyof MarketIndices] = stockData as any
        }
      } catch (error) {
        console.error(`Error fetching ${name}:`, error)
      }
    }

    return Object.keys(marketData).length > 1 ? marketData : null
  } catch (error) {
    console.error('Error fetching market indices:', error)
    return null
  }
}

export async function generateDigestPDF(
  articles: Article[],
  historicalDigests: Record<string, { topicCounts: Record<string, number>; sentimentCounts: Record<string, number> }>,
  userId: string,
  language = "en",
  weather?: { location: string; temperature: number; condition: string; humidity?: number; windSpeed?: number },
  newsType?: string,
  selectedTopic?: string,
): Promise<string | null> {
  try {
    const articlesToProcess = articles

    const sanitizedArticles = articlesToProcess.map((article) => ({
      ...article,
      title: sanitizeTextForPDF(article.title),
      summary: sanitizeTextForPDF(article.summary),
      source: sanitizeTextForPDF(article.source),
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

  let pageNumber = 1

  const addHeader = (page: PDFPage, isFirst = false) => {
    if (isFirst) {
      page.drawRectangle({
        x: 0,
        y: 755,
        width: 595,
        height: 87,
        color: rgb(0.05, 0.1, 0.2),
      })

      page.drawLine({
        start: { x: 0, y: 753 },
        end: { x: 595, y: 753 },
        thickness: 3,
        color: rgb(0, 0, 0),
      })

      page.drawText("DAILY DIGEST", {
        x: margin,
        y: 820,
        size: 48,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      })

      const subtitleText = selectedTopic && selectedTopic !== "all" 
        ? `AI-Powered ${selectedTopic.charAt(0).toUpperCase() + selectedTopic.slice(1)} News Analysis & Market Sentiment Report`
        : "AI-Powered News Analysis & Market Sentiment Report"

      page.drawText(subtitleText, {
        x: margin,
        y: 795,
        size: 8,
        font: contentFont,
        color: rgb(0.85, 0.85, 0.85),
      })

      page.drawLine({
        start: { x: 0, y: 753 },
        end: { x: 595, y: 753 },
        thickness: 1,
        color: rgb(0.85, 0.65, 0.15),
      })

      page.drawText(currentDate, {
        x: 595 - margin - 150,
        y: 820,
        size: 10,
        font: contentFont,
        color: rgb(0.9, 0.9, 0.9),
      })

      return 740
    } else {
      page.drawRectangle({
        x: margin,
        y: 790,
        width: pageWidth,
        height: 25,
        color: rgb(0.05, 0.1, 0.2),
      })

      page.drawLine({
        start: { x: margin, y: 788 },
        end: { x: 595 - margin, y: 788 },
        thickness: 1,
        color: rgb(0.85, 0.65, 0.15),
      })

      page.drawText("DAILY DIGEST", {
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

    page.drawText("(C) 2025 Daily Digest News | All Rights Reserved", {
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
      color: rgb(0.05, 0.1, 0.2),
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
    y: yPos - 90,
    width: pageWidth,
    height: 90,
    color: rgb(0.94, 0.96, 0.99),
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
  })

  page.drawText("EXECUTIVE SUMMARY", {
    x: margin + 12,
    y: yPos - 15,
    size: 12,
    font: headingFontBold,
    color: rgb(0.05, 0.1, 0.2),
  })

  const summaryLines = wrapText(
    `This comprehensive digest analyzes ${sanitizedArticles.length} articles from ${topSources.length} premium news sources. Market sentiment is predominantly ${Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0]} with ${topTopics[0]?.[1] || 0} articles focused on ${topTopics[0]?.[0] || "general"} developments. Source credibility averages ${(avgReliability * 100).toFixed(0)}%, indicating institutional-grade coverage.`,
    100,
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

  yPos -= 110

  if (weather) {
    if (yPos < 180) {
      addFooter(page, pageNumber)
      pageNumber++
      page = pdfDoc.addPage([595, 842])
      yPos = addHeader(page)
    }

    page.drawRectangle({
      x: margin,
      y: yPos - 95,
      width: pageWidth,
      height: 95,
      color: rgb(0.92, 0.96, 0.99),
      borderColor: rgb(0.15, 0.45, 0.85),
      borderWidth: 2,
    })

    page.drawText("WEATHER REPORT", {
      x: margin + 12,
      y: yPos - 15,
      size: 12,
      font: headingFontBold,
      color: rgb(0.15, 0.45, 0.85),
    })

    drawTextSafe(page, `Location: ${weather.location}`, {
      x: margin + 12,
      y: yPos - 32,
      size: 10,
      font: contentFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    drawTextSafe(page, `Temperature: ${weather.temperature}degC | Condition: ${weather.condition}`, {
      x: margin + 12,
      y: yPos - 48,
      size: 10,
      font: contentFont,
      color: rgb(0.1, 0.1, 0.1),
    })

    page.drawText(
      `Humidity: ${weather.humidity || "N/A"}% | Wind Speed: ${weather.windSpeed || "N/A"} km/h`,
      {
        x: margin + 12,
        y: yPos - 64,
        size: 10,
        font: contentFont,
        color: rgb(0.1, 0.1, 0.1),
      }
    )

    page.drawText("Prepared for news digest context and travel planning", {
      x: margin + 12,
      y: yPos - 80,
      size: 8,
      font: contentFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    yPos -= 115
  }

  // Add Stock Analysis Report
  const marketData = await fetchMarketIndices()
  if (marketData) {
    if (yPos < 200) {
      addFooter(page, pageNumber)
      pageNumber++
      page = pdfDoc.addPage([595, 842])
      yPos = addHeader(page)
    }

    page.drawRectangle({
      x: margin,
      y: yPos - 140,
      width: pageWidth,
      height: 140,
      color: rgb(0.94, 0.99, 0.96),
      borderColor: rgb(0.15, 0.75, 0.35),
      borderWidth: 2,
    })

    page.drawText("MARKET ANALYSIS REPORT", {
      x: margin + 12,
      y: yPos - 15,
      size: 12,
      font: headingFontBold,
      color: rgb(0.15, 0.75, 0.35),
    })

    page.drawText(`Real-time data as of ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`, {
      x: margin + 12,
      y: yPos - 30,
      size: 8,
      font: contentFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    let stockY = yPos - 50

    // Display each index
    const indices = [
      { key: 'nifty50', label: 'NIFTY 50' },
      { key: 'sensex', label: 'BSE SENSEX' },
      { key: 'bankNifty', label: 'NIFTY BANK' }
    ]

    for (const { key, label } of indices) {
      const stockData = marketData[key as keyof MarketIndices] as StockData | undefined
      if (stockData) {
        const changeColor = stockData.change >= 0 ? rgb(0.15, 0.75, 0.35) : rgb(0.85, 0.25, 0.15)
        const changeSymbol = stockData.change >= 0 ? '^' : 'v'

        page.drawText(`${label}:`, {
          x: margin + 12,
          y: stockY,
          size: 10,
          font: contentFontBold,
          color: rgb(0.05, 0.1, 0.2),
        })

        page.drawText(`Rs.${stockData.price.toLocaleString()}`, {
          x: margin + 120,
          y: stockY,
          size: 10,
          font: contentFontBold,
          color: rgb(0.05, 0.1, 0.2),
        })

        drawTextSafe(page, `${changeSymbol} ${stockData.change.toFixed(2)} (${stockData.changePercent.toFixed(2)}%)`, {
          x: margin + 220,
          y: stockY,
          size: 9,
          font: contentFontBold,
          color: changeColor,
        })

        if (stockData.volume) {
          page.drawText(`Vol: ${(stockData.volume / 1000000).toFixed(1)}M`, {
            x: margin + 380,
            y: stockY,
            size: 8,
            font: contentFont,
            color: rgb(0.3, 0.3, 0.3),
          })
        }

        stockY -= 18
      }
    }

    // Market summary
    const indices_data = [marketData.nifty50, marketData.sensex, marketData.bankNifty].filter(Boolean) as StockData[]
    if (indices_data.length > 0) {
      const positiveCount = indices_data.filter(stock => stock.change >= 0).length
      const marketSentiment = positiveCount >= indices_data.length / 2 ? 'BULLISH' : 'BEARISH'
      const sentimentColor = marketSentiment === 'BULLISH' ? rgb(0.15, 0.75, 0.35) : rgb(0.85, 0.25, 0.15)

      page.drawText(`Market Sentiment: ${marketSentiment} (${positiveCount}/${indices_data.length} indices positive)`, {
        x: margin + 12,
        y: yPos - 125,
        size: 9,
        font: contentFontBold,
        color: sentimentColor,
      })
    }

    yPos -= 160
  }

  page.drawText("KEY PERFORMANCE INDICATORS", {
    x: margin,
    y: yPos,
    size: 13,
    font: headingFontBold,
    color: rgb(0.05, 0.1, 0.2),
  })

  yPos -= 25

  const kpis = [
    { label: "Total Coverage", value: sanitizedArticles.length.toString(), unit: "articles", color: rgb(0.15, 0.45, 0.85) },
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
    color: rgb(0.05, 0.1, 0.2),
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
    color: rgb(0.05, 0.1, 0.2),
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

    const sourceText = article.source ? `Source: ${article.source}` : ""
    const pubDateText = article.pubDate ? `Published: ${article.pubDate}` : ""
    const sourceInfo = [sourceText, pubDateText].filter(Boolean).join(" | ")
    
    if (sourceInfo) {
      page.drawText(sourceInfo, {
        x: margin + 12,
        y: yPos - 32,
        size: 8,
        font: contentFontBold,
        color: rgb(0.15, 0.45, 0.85),
      })
    }

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

  if (newsType?.toLowerCase() === "all") {
    const articlesByCategory: Record<string, typeof sanitizedArticles> = {}
    const categoryOrder = ["national", "international", "tech", "sports", "regional", "general"]

    for (const article of sanitizedArticles) {
      const category = article.category || article.topic || "general"
      if (!articlesByCategory[category]) {
        articlesByCategory[category] = []
      }
      articlesByCategory[category].push(article)
    }

    const sortedCategories = Object.keys(articlesByCategory).sort((a, b) => {
      const indexA = categoryOrder.indexOf(a.toLowerCase())
      const indexB = categoryOrder.indexOf(b.toLowerCase())
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
    })

    for (const category of sortedCategories) {
      const categoryArticles = articlesByCategory[category]

      if (yPos < 200) {
        addFooter(page, pageNumber)
        pageNumber++
        page = pdfDoc.addPage([595, 842])
        yPos = addHeader(page)
      }

      const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1)
      page.drawRectangle({
        x: margin,
        y: yPos - 22,
        width: pageWidth,
        height: 22,
        color: rgb(0.05, 0.1, 0.2),
      })

      page.drawText(categoryTitle.toUpperCase(), {
        x: margin + 10,
        y: yPos - 16,
        size: 11,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      })

      yPos -= 32

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
          color: rgb(0.05, 0.1, 0.2),
        })

        // Only show source if it's available and not unknown
        if (article.source && article.source.toLowerCase() !== "unknown") {
          page.drawRectangle({
            x: margin + 10,
            y: yPos - 32,
            width: 100,
            height: 10,
            color: rgb(0.95, 0.97, 1),
            borderColor: rgb(0.7, 0.8, 0.9),
            borderWidth: 0.3,
          })

          page.drawText(`SOURCE: ${article.source}`, {
            x: margin + 12,
            y: yPos - 29,
            size: 6,
            font: contentFontBold,
            color: rgb(0.15, 0.45, 0.85),
          })
        }

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



  if (Object.keys(historicalDigests).length > 0) {
    page = pdfDoc.addPage([595, 842])
    yPos = addHeader(page)

    page.drawText("7-DAY HISTORICAL TREND ANALYSIS", {
      x: margin,
      y: yPos,
      size: 13,
      font: headingFontBold,
      color: rgb(0.05, 0.1, 0.2),
    })

    yPos -= 25

    const historicalDates = Object.keys(historicalDigests).sort().slice(-7)

    page.drawRectangle({
      x: margin,
      y: yPos - (historicalDates.length * 22 + 35),
      width: pageWidth,
      height: historicalDates.length * 22 + 35,
      borderColor: rgb(0.05, 0.1, 0.2),
      borderWidth: 1.5,
    })

    page.drawRectangle({
      x: margin,
      y: yPos - 30,
      width: pageWidth,
      height: 30,
      color: rgb(0.05, 0.1, 0.2),
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
        color: rgb(0.05, 0.1, 0.2),
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
        color: rgb(0.05, 0.1, 0.2),
      })

      const trendColor =
        trend.direction === "^"
          ? rgb(0.15, 0.75, 0.35)
          : trend.direction === "v"
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
        color: rgb(0.05, 0.1, 0.2),
      })

      histRowY -= 22
      previousCount = totalArt
    }

    addFooter(page, pageNumber)
    pageNumber++
  }

  // STRATEGIC RECOMMENDATIONS & ACTION ITEMS section removed

  // Add comprehensive weather report for major Indian cities
  const weatherCities = ['Delhi', 'Mumbai', 'Bangalore']
  const cityWeatherData = await fetchWeatherForCities(weatherCities)

  if (cityWeatherData.length > 0) {
    page = pdfDoc.addPage([595, 842])
    yPos = addHeader(page)

    page.drawText("WEEKLY WEATHER OUTLOOK - MAJOR CITIES", {
      x: margin,
      y: yPos,
      size: 13,
      font: headingFontBold,
      color: rgb(0.05, 0.1, 0.2),
    })

    yPos -= 25

    page.drawText("7-Day Forecast with Cloud Coverage & Conditions", {
      x: margin,
      y: yPos,
      size: 9,
      font: contentFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    yPos -= 20

    for (let i = 0; i < cityWeatherData.length; i++) {
      const cityWeather = cityWeatherData[i]
      
      if (yPos < 200) {
        addFooter(page, pageNumber)
        pageNumber++
        page = pdfDoc.addPage([595, 842])
        yPos = addHeader(page)
      }

      // City header
      page.drawRectangle({
        x: margin,
        y: yPos - 25,
        width: pageWidth,
        height: 25,
        color: rgb(0.15, 0.45, 0.85),
      })

      page.drawText(cityWeather.location.toUpperCase(), {
        x: margin + 10,
        y: yPos - 17,
        size: 12,
        font: headingFontBold,
        color: rgb(1, 1, 1),
      })

      // Current weather condition text
      page.drawText(getWeatherIcon(cityWeather.condition), {
        x: margin + pageWidth - 50,
        y: yPos - 17,
        size: 10,
        font: contentFontBold,
        color: rgb(1, 1, 1),
      })

      yPos -= 35

      // Current conditions
      page.drawRectangle({
        x: margin,
        y: yPos - 40,
        width: pageWidth,
        height: 40,
        color: rgb(0.96, 0.98, 1),
        borderColor: rgb(0.85, 0.85, 0.85),
        borderWidth: 1,
      })

      page.drawText("TODAY", {
        x: margin + 10,
        y: yPos - 12,
        size: 9,
        font: headingFontBold,
        color: rgb(0.15, 0.45, 0.85),
      })

      page.drawText(`${cityWeather.temperature}degC | ${cityWeather.condition}`, {
        x: margin + 80,
        y: yPos - 12,
        size: 10,
        font: contentFontBold,
        color: rgb(0.05, 0.1, 0.2),
      })

      page.drawText(`Humidity: ${cityWeather.humidity || 'N/A'}% | Wind: ${cityWeather.windSpeed || 'N/A'} km/h`, {
        x: margin + 10,
        y: yPos - 28,
        size: 8,
        font: contentFont,
        color: rgb(0.3, 0.3, 0.3),
      })

      yPos -= 50

      // 7-day forecast
      if (cityWeather.forecast && cityWeather.forecast.length > 0) {
        page.drawText("7-DAY FORECAST", {
          x: margin,
          y: yPos,
          size: 9,
          font: headingFontBold,
          color: rgb(0.05, 0.1, 0.2),
        })

        yPos -= 15

        // Forecast table header
        page.drawRectangle({
          x: margin,
          y: yPos - 20,
          width: pageWidth,
          height: 20,
          color: rgb(0.9, 0.9, 0.9),
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 0.5,
        })

        const colWidth = pageWidth / 5
        const headers = ['DAY', 'HIGH/LOW', 'CONDITION', 'CLOUDS', 'CODE']
        
        headers.forEach((header, index) => {
          page.drawText(header, {
            x: margin + 5 + (index * colWidth),
            y: yPos - 14,
            size: 7,
            font: headingFontBold,
            color: rgb(0.2, 0.2, 0.2),
          })
        })

        yPos -= 25

        // Forecast rows
        cityWeather.forecast.slice(0, 7).forEach((forecast, index) => {
          const rowColor = index % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1)
          
          page.drawRectangle({
            x: margin,
            y: yPos - 18,
            width: pageWidth,
            height: 18,
            color: rowColor,
            borderColor: rgb(0.9, 0.9, 0.9),
            borderWidth: 0.3,
          })

          // Day
          page.drawText(forecast.day, {
            x: margin + 5,
            y: yPos - 13,
            size: 8,
            font: contentFont,
            color: rgb(0.1, 0.1, 0.1),
          })

          // High/Low
          page.drawText(`${forecast.high}deg/${forecast.low}deg`, {
            x: margin + 5 + colWidth,
            y: yPos - 13,
            size: 8,
            font: contentFontBold,
            color: rgb(0.1, 0.1, 0.1),
          })

          // Condition
          page.drawText(forecast.condition, {
            x: margin + 5 + (2 * colWidth),
            y: yPos - 13,
            size: 8,
            font: contentFont,
            color: rgb(0.1, 0.1, 0.1),
          })

          // Clouds
          page.drawText(`${forecast.clouds || 0}%`, {
            x: margin + 5 + (3 * colWidth),
            y: yPos - 13,
            size: 8,
            font: contentFont,
            color: rgb(0.1, 0.1, 0.1),
          })

          // Weather code
          page.drawText(getWeatherIcon(forecast.condition), {
            x: margin + 5 + (4 * colWidth),
            y: yPos - 13,
            size: 8,
            font: contentFontBold,
            color: rgb(0.1, 0.1, 0.1),
          })

          yPos -= 20
        })
      }

      yPos -= 15
    }

    // Weather summary
    if (yPos > 100) {
      yPos -= 10
      page.drawRectangle({
        x: margin,
        y: yPos - 45,
        width: pageWidth,
        height: 45,
        color: rgb(0.94, 0.97, 1),
        borderColor: rgb(0.15, 0.45, 0.85),
        borderWidth: 1.5,
      })

      page.drawText("WEATHER INSIGHTS", {
        x: margin + 10,
        y: yPos - 15,
        size: 9,
        font: headingFontBold,
        color: rgb(0.15, 0.45, 0.85),
      })

      const avgTemp = Math.round(cityWeatherData.reduce((sum, city) => sum + city.temperature, 0) / cityWeatherData.length)
      const commonCondition = cityWeatherData
        .map(city => city.condition)
        .reduce((a, b, i, arr) => 
          arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
        )

      page.drawText(`Average temperature across major cities: ${avgTemp}degC | Most common condition: ${commonCondition}`, {
        x: margin + 10,
        y: yPos - 30,
        size: 8,
        font: contentFont,
        color: rgb(0.1, 0.1, 0.1),
      })
    }

    addFooter(page, pageNumber)
    pageNumber++
  }

  // Add comprehensive stock market analysis section
  const detailedMarketData = await fetchMarketIndices()
  if (detailedMarketData) {
    page = pdfDoc.addPage([595, 842])
    yPos = addHeader(page)

    page.drawText("COMPREHENSIVE STOCK MARKET ANALYSIS", {
      x: margin,
      y: yPos,
      size: 13,
      font: headingFontBold,
      color: rgb(0.05, 0.1, 0.2),
    })

    yPos -= 25

    page.drawText(`Market Data Updated: ${new Date().toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    })} IST`, {
      x: margin,
      y: yPos,
      size: 9,
      font: contentFont,
      color: rgb(0.4, 0.4, 0.4),
    })

    yPos -= 30

    // Market indices detailed analysis
    const indices = [
      { key: 'nifty50', label: 'NIFTY 50', description: 'Top 50 companies by market capitalization' },
      { key: 'sensex', label: 'BSE SENSEX', description: '30 well-established and financially sound companies' },
      { key: 'bankNifty', label: 'NIFTY BANK', description: 'Banking sector performance indicator' }
    ]

    for (let i = 0; i < indices.length; i++) {
      const { key, label, description } = indices[i]
      const stockData = detailedMarketData[key as keyof MarketIndices] as StockData | undefined
      
      if (stockData) {
        if (yPos < 150) {
          addFooter(page, pageNumber)
          pageNumber++
          page = pdfDoc.addPage([595, 842])
          yPos = addHeader(page)
        }

        const changeColor = stockData.change >= 0 ? rgb(0.15, 0.75, 0.35) : rgb(0.85, 0.25, 0.15)
        const trendIcon = stockData.change >= 0 ? '^' : 'v'
        const trendBg = stockData.change >= 0 ? rgb(0.9, 0.98, 0.9) : rgb(0.98, 0.9, 0.9)

        // Index header box
        page.drawRectangle({
          x: margin,
          y: yPos - 85,
          width: pageWidth,
          height: 85,
          color: trendBg,
          borderColor: changeColor,
          borderWidth: 2,
        })

        // Index name and trend indicator
        page.drawText(label, {
          x: margin + 12,
          y: yPos - 18,
          size: 14,
          font: headingFontBold,
          color: rgb(0.05, 0.1, 0.2),
        })

        page.drawRectangle({
          x: margin + pageWidth - 80,
          y: yPos - 25,
          width: 70,
          height: 20,
          color: changeColor,
        })

        drawTextSafe(page, `${trendIcon} ${stockData.changePercent.toFixed(2)}%`, {
          x: margin + pageWidth - 75,
          y: yPos - 19,
          size: 10,
          font: contentFontBold,
          color: rgb(1, 1, 1),
        })

        // Current price and change
        page.drawText(`Current Price: Rs.${stockData.price.toLocaleString()}`, {
          x: margin + 12,
          y: yPos - 38,
          size: 11,
          font: contentFontBold,
          color: rgb(0.05, 0.1, 0.2),
        })

        page.drawText(`Change: ${stockData.change >= 0 ? '+' : ''}Rs.${stockData.change.toFixed(2)}`, {
          x: margin + 200,
          y: yPos - 38,
          size: 11,
          font: contentFontBold,
          color: changeColor,
        })

        // Additional details
        page.drawText(description, {
          x: margin + 12,
          y: yPos - 55,
          size: 8,
          font: contentFont,
          color: rgb(0.3, 0.3, 0.3),
        })

        if (stockData.volume) {
          page.drawText(`Trading Volume: ${(stockData.volume / 10000000).toFixed(2)} Cr`, {
            x: margin + 12,
            y: yPos - 70,
            size: 8,
            font: contentFont,
            color: rgb(0.3, 0.3, 0.3),
          })
        }

        if (stockData.marketCap) {
          page.drawText(`Market Cap: ${stockData.marketCap}`, {
            x: margin + 200,
            y: yPos - 70,
            size: 8,
            font: contentFont,
            color: rgb(0.3, 0.3, 0.3),
          })
        }

        yPos -= 100
      }
    }

    // Market summary and insights
    const validIndices = [detailedMarketData.nifty50, detailedMarketData.sensex, detailedMarketData.bankNifty].filter(Boolean) as StockData[]
    
    if (validIndices.length > 0 && yPos > 120) {
      page.drawRectangle({
        x: margin,
        y: yPos - 80,
        width: pageWidth,
        height: 80,
        color: rgb(0.94, 0.96, 0.99),
        borderColor: rgb(0.15, 0.45, 0.85),
        borderWidth: 2,
      })

      page.drawText("MARKET INSIGHTS", {
        x: margin + 12,
        y: yPos - 15,
        size: 12,
        font: headingFontBold,
        color: rgb(0.15, 0.45, 0.85),
      })

      const positiveIndices = validIndices.filter(stock => stock.change >= 0).length
      const avgChange = validIndices.reduce((sum, stock) => sum + stock.changePercent, 0) / validIndices.length
      const marketSentiment = avgChange >= 0 ? 'BULLISH' : 'BEARISH'
      const sentimentColor = avgChange >= 0 ? rgb(0.15, 0.75, 0.35) : rgb(0.85, 0.25, 0.15)

      page.drawText(`Market Sentiment: ${marketSentiment}`, {
        x: margin + 12,
        y: yPos - 35,
        size: 10,
        font: contentFontBold,
        color: sentimentColor,
      })

      page.drawText(`${positiveIndices}/${validIndices.length} indices showing positive momentum`, {
        x: margin + 12,
        y: yPos - 50,
        size: 9,
        font: contentFont,
        color: rgb(0.3, 0.3, 0.3),
      })

      page.drawText(`Average change: ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%`, {
        x: margin + 12,
        y: yPos - 65,
        size: 9,
        font: contentFont,
        color: rgb(0.3, 0.3, 0.3),
      })
    }

    addFooter(page, pageNumber)
    pageNumber++
  }

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
  } catch (error) {
    console.error('PDF generation failed:', error)
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}