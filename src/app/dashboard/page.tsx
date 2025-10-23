
"use client";

import React, { useState } from "react";
import { DigestCard, NewsItem } from "../components/DigestCard";

// Sample news data for demonstration
const SAMPLE_NEWS: NewsItem[] = [
  {
    title: "Tech Giant Announces Revolutionary AI Breakthrough",
    summary:
      "A major technology company has announced a significant breakthrough in artificial intelligence, promising to revolutionize how we interact with machines.",
    link: "https://example.com/news/1",
    source: "TechNews Daily",
    pubDate: "2024-10-21",
    sentiment: "positive",
    sentimentScore: 0.85,
  },
  {
    title: "Global Markets Show Strong Recovery",
    summary:
      "Stock markets across the globe have shown remarkable growth this quarter, with investors gaining confidence in economic recovery.",
    link: "https://example.com/news/2",
    source: "Financial Times",
    pubDate: "2024-10-21",
    sentiment: "positive",
    sentimentScore: 0.78,
  },
  {
    title: "Climate Summit Reaches Historic Agreement",
    summary:
      "World leaders have reached an unprecedented agreement on climate change mitigation, pledging to reduce carbon emissions significantly.",
    link: "https://example.com/news/3",
    source: "Environmental News",
    pubDate: "2024-10-20",
    sentiment: "positive",
    sentimentScore: 0.82,
  },
  {
    title: "Sports Team Wins Championship Title",
    summary:
      "In an exciting match, the home team clinched the championship title, bringing joy to thousands of fans worldwide.",
    link: "https://example.com/news/4",
    source: "Sports Central",
    pubDate: "2024-10-20",
    sentiment: "positive",
    sentimentScore: 0.9,
  },
  {
    title: "New Health Breakthrough in Medical Research",
    summary:
      "Scientists have discovered a promising new treatment that could revolutionize the way we approach a common disease.",
    link: "https://example.com/news/5",
    source: "Medical Journal",
    pubDate: "2024-10-20",
    sentiment: "positive",
    sentimentScore: 0.88,
  },
  {
    title: "Education Reform Gets Government Approval",
    summary:
      "The government has approved a comprehensive education reform plan aimed at improving student outcomes nationwide.",
    link: "https://example.com/news/6",
    source: "Education Weekly",
    pubDate: "2024-10-19",
    sentiment: "positive",
    sentimentScore: 0.75,
  },
  {
    title: "Infrastructure Project Nears Completion",
    summary:
      "A major infrastructure development project is on track to be completed ahead of schedule, boosting local economy.",
    link: "https://example.com/news/7",
    source: "Construction News",
    pubDate: "2024-10-19",
    sentiment: "positive",
    sentimentScore: 0.72,
  },
  {
    title: "International Trade Deal Signed Successfully",
    summary:
      "Two major economies have successfully negotiated and signed a comprehensive trade agreement benefiting both nations.",
    link: "https://example.com/news/8",
    source: "Business Report",
    pubDate: "2024-10-19",
    sentiment: "positive",
    sentimentScore: 0.79,
  },
  {
    title: "Technology Company Launches New Product Line",
    summary:
      "A leading tech company has unveiled its latest product line, featuring cutting-edge features and improved performance.",
    link: "https://example.com/news/9",
    source: "Tech Review",
    pubDate: "2024-10-18",
    sentiment: "positive",
    sentimentScore: 0.81,
  },
  {
    title: "Industry Report Shows Growth Potential",
    summary:
      "Recent industry analysis indicates significant growth potential for emerging sectors in the coming years.",
    link: "https://example.com/news/10",
    source: "Industry Insights",
    pubDate: "2024-10-18",
    sentiment: "positive",
    sentimentScore: 0.7,
  },
  {
    title: "Weather Advisory: Mild Temperatures Expected",
    summary:
      "Meteorologists predict mild and pleasant weather conditions for the next few days across most regions.",
    link: "https://example.com/news/11",
    source: "Weather Station",
    pubDate: "2024-10-21",
    sentiment: "neutral",
    sentimentScore: 0.5,
  },
  {
    title: "Community Event Draws Large Crowds",
    summary:
      "A local community gathering attracted thousands of participants, fostering unity and cultural exchange.",
    link: "https://example.com/news/12",
    source: "Local News",
    pubDate: "2024-10-21",
    sentiment: "neutral",
    sentimentScore: 0.55,
  },
  {
    title: "Market Volatility Causes Uncertainty",
    summary:
      "Recent market fluctuations have created some uncertainty among investors about future economic conditions.",
    link: "https://example.com/news/13",
    source: "Market Watch",
    pubDate: "2024-10-20",
    sentiment: "neutral",
    sentimentScore: 0.48,
  },
  {
    title: "Policy Changes Under Review",
    summary:
      "Government authorities are reviewing proposed policy changes that could affect various sectors of the economy.",
    link: "https://example.com/news/14",
    source: "Policy News",
    pubDate: "2024-10-20",
    sentiment: "neutral",
    sentimentScore: 0.52,
  },
  {
    title: "Transportation Update: Service Changes Announced",
    summary:
      "Public transportation officials have announced schedule changes affecting commuters in the metropolitan area.",
    link: "https://example.com/news/15",
    source: "Transit News",
    pubDate: "2024-10-19",
    sentiment: "neutral",
    sentimentScore: 0.5,
  },
  {
    title: "Environmental Concerns Require Attention",
    summary:
      "Environmental advocates are calling for increased efforts to address growing concerns about pollution levels.",
    link: "https://example.com/news/16",
    source: "Environment Watch",
    pubDate: "2024-10-19",
    sentiment: "negative",
    sentimentScore: 0.35,
  },
  {
    title: "Economic Challenges Persist in Region",
    summary:
      "Economic analysts warn that ongoing challenges could impact growth in the region over the next quarter.",
    link: "https://example.com/news/17",
    source: "Economic Report",
    pubDate: "2024-10-18",
    sentiment: "negative",
    sentimentScore: 0.32,
  },
  {
    title: "Health Crisis Alerts Issued",
    summary:
      "Health officials have issued alerts regarding a potential health crisis that requires immediate public attention.",
    link: "https://example.com/news/18",
    source: "Health Alert",
    pubDate: "2024-10-18",
    sentiment: "negative",
    sentimentScore: 0.25,
  },
  {
    title: "Traffic Accidents Rise During Rush Hour",
    summary:
      "Traffic authorities report increased accident rates during peak hours, urging drivers to exercise caution.",
    link: "https://example.com/news/19",
    source: "Safety News",
    pubDate: "2024-10-17",
    sentiment: "negative",
    sentimentScore: 0.3,
  },
  {
    title: "Supply Chain Disruptions Continue",
    summary:
      "Ongoing supply chain disruptions are affecting various industries, leading to potential shortages and delays.",
    link: "https://example.com/news/20",
    source: "Supply Chain Today",
    pubDate: "2024-10-17",
    sentiment: "negative",
    sentimentScore: 0.28,
  },
];

export default function Dashboard(): React.ReactNode {
  const [selectedSentiment, setSelectedSentiment] = useState<
    "all" | "positive" | "negative" | "neutral"
  >("all");

  const filteredNews =
    selectedSentiment === "all"
      ? SAMPLE_NEWS
      : SAMPLE_NEWS.filter((item) => item.sentiment === selectedSentiment);

  const sentimentStats = {
    positive: SAMPLE_NEWS.filter((item) => item.sentiment === "positive")
      .length,
    negative: SAMPLE_NEWS.filter((item) => item.sentiment === "negative")
      .length,
    neutral: SAMPLE_NEWS.filter((item) => item.sentiment === "neutral")
      .length,
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-4xl font-bold mb-2">News Agent Dashboard</h1>
      <p className="text-gray-600 mb-8">
        Personalized news digest with AI-powered sentiment analysis
      </p>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-gray-600 text-sm font-semibold mb-1">
            Total News
          </h3>
          <p className="text-3xl font-bold text-gray-900">{SAMPLE_NEWS.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow border-l-4 border-green-400">
          <h3 className="text-green-700 text-sm font-semibold mb-1">Positive</h3>
          <p className="text-3xl font-bold text-green-600">
            {sentimentStats.positive}
          </p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg shadow border-l-4 border-red-400">
          <h3 className="text-red-700 text-sm font-semibold mb-1">Negative</h3>
          <p className="text-3xl font-bold text-red-600">
            {sentimentStats.negative}
          </p>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg shadow border-l-4 border-blue-400">
          <h3 className="text-blue-700 text-sm font-semibold mb-1">Neutral</h3>
          <p className="text-3xl font-bold text-blue-600">
            {sentimentStats.neutral}
          </p>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="mb-8 flex gap-3 flex-wrap">
        <button
          onClick={() => setSelectedSentiment("all")}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            selectedSentiment === "all"
              ? "bg-gray-900 text-white"
              : "bg-gray-200 text-gray-900 hover:bg-gray-300"
          }`}
        >
          All News
        </button>
        <button
          onClick={() => setSelectedSentiment("positive")}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            selectedSentiment === "positive"
              ? "bg-green-600 text-white"
              : "bg-green-100 text-green-900 hover:bg-green-200"
          }`}
        >
          Positive ({sentimentStats.positive})
        </button>
        <button
          onClick={() => setSelectedSentiment("neutral")}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            selectedSentiment === "neutral"
              ? "bg-blue-600 text-white"
              : "bg-blue-100 text-blue-900 hover:bg-blue-200"
          }`}
        >
          Neutral ({sentimentStats.neutral})
        </button>
        <button
          onClick={() => setSelectedSentiment("negative")}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            selectedSentiment === "negative"
              ? "bg-red-600 text-white"
              : "bg-red-100 text-red-900 hover:bg-red-200"
          }`}
        >
          Negative ({sentimentStats.negative})
        </button>
      </div>

      {/* News Grid */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold mb-4">
          {selectedSentiment === "all" ? "All News" : `${selectedSentiment} News`} (
          {filteredNews.length})
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredNews.map((item, index) => (
            <DigestCard key={index} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
