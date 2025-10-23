import React from "react";

export interface NewsItem {
  title: string;
  link: string | null;
  summary: string;
  source: string | null;
  pubDate: string | null;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
}

interface DigestCardProps {
  item: NewsItem;
}

export const DigestCard: React.FC<DigestCardProps> = ({ item }) => {
  const getSentimentColor = (sentiment: string): string => {
    switch (sentiment) {
      case "positive":
        return "border-green-400 bg-green-50";
      case "negative":
        return "border-red-400 bg-red-50";
      case "neutral":
        return "border-blue-400 bg-blue-50";
      default:
        return "border-gray-400 bg-gray-50";
    }
  };

  const getSentimentBadgeColor = (sentiment: string): string => {
    switch (sentiment) {
      case "positive":
        return "bg-green-200 text-green-800";
      case "negative":
        return "bg-red-200 text-red-800";
      case "neutral":
        return "bg-blue-200 text-blue-800";
      default:
        return "bg-gray-200 text-gray-800";
    }
  };

  return (
    <div
      className={`border-l-4 p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow ${getSentimentColor(
        item.sentiment
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-2 line-clamp-2">{item.title}</h3>
          <p className="text-gray-700 text-sm mb-3 line-clamp-3">{item.summary}</p>

          <div className="flex items-center gap-2 flex-wrap">
            {item.source && (
              <span className="text-xs bg-gray-200 text-gray-800 px-2 py-1 rounded">
                {item.source}
              </span>
            )}
            {item.pubDate && (
              <span className="text-xs text-gray-600">
                {new Date(item.pubDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`text-xs font-semibold px-2 py-1 rounded capitalize ${getSentimentBadgeColor(
              item.sentiment
            )}`}
          >
            {item.sentiment}
          </span>
          <div className="text-xs text-gray-600 flex items-center">
            <span className="mr-1">Score:</span>
            <span className="font-bold">
              {(item.sentimentScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-blue-600 hover:text-blue-800 text-sm font-semibold underline"
        >
          Read Full Article →
        </a>
      )}
    </div>
  );
};
