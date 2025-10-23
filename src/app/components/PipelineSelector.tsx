"use client";

import React, { useState } from "react";

interface PipelineSelectorProps {
  onSubmit: (data: PipelineFormData) => Promise<void>;
  isLoading?: boolean;
}

export interface PipelineFormData {
  email: string;
  userId: string;
  language: string;
  newsType: "all" | "tech" | "national" | "international" | "sports" | "state";
  state?: string;
  location?: string;
}

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
];

const NEWS_TYPES = [
  { value: "all", label: "All News", icon: "📰" },
  { value: "tech", label: "Technology", icon: "💻" },
  { value: "national", label: "National", icon: "🏛️" },
  { value: "international", label: "International", icon: "🌍" },
  { value: "sports", label: "Sports", icon: "⚽" },
  { value: "state", label: "State News", icon: "📍" },
];

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export const PipelineSelector: React.FC<PipelineSelectorProps> = ({
  onSubmit,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<PipelineFormData>({
    email: "",
    userId: `user-${Date.now()}`,
    language: "en",
    newsType: "all",
    state: "Maharashtra",
  });

  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ): void => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
  };

  const handleNewsTypeChange = (
    type: "all" | "tech" | "national" | "international" | "sports" | "state"
  ): void => {
    setFormData((prev) => ({
      ...prev,
      newsType: type,
    }));
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (!formData.email) {
      setError("Please enter your email");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError("Please enter a valid email");
      return;
    }

    if (formData.newsType === "state" && !formData.state) {
      setError("Please select a state");
      return;
    }

    try {
      await onSubmit(formData);
      setSuccess("Pipeline started successfully! Check your email for updates.");
      setFormData({
        email: "",
        userId: `user-${Date.now()}`,
        language: "en",
        newsType: "all",
        state: "Maharashtra",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start pipeline"
      );
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-lg p-8 space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            News Digest Pipeline
          </h2>
          <p className="text-gray-600">
            Customize your news preferences and receive a personalized digest
          </p>
        </div>

        {/* Email Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            📧 Email Address
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="your.email@example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        {/* Language Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            🌐 Language
          </label>
          <select
            name="language"
            value={formData.language}
            onChange={handleInputChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* News Type Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            📰 News Category
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {NEWS_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() =>
                  handleNewsTypeChange(
                    type.value as
                      | "all"
                      | "tech"
                      | "national"
                      | "international"
                      | "sports"
                      | "state"
                  )
                }
                disabled={isLoading}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.newsType === type.value
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-300 hover:border-blue-300"
                } ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="text-2xl mb-1">{type.icon}</div>
                <div className="text-sm font-semibold text-gray-700">
                  {type.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* State Selection (conditional) */}
        {formData.newsType === "state" && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              📍 Select State
            </label>
            <select
              name="state"
              value={formData.state || ""}
              onChange={handleInputChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="">Choose a state...</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-semibold">❌ {error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800 font-semibold">✅ {success}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full py-3 rounded-lg font-semibold text-white transition-all ${
            isLoading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin h-5 w-5 mr-3"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            "🚀 Start Pipeline"
          )}
        </button>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>📋 What happens next:</strong>
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1">
            <li>✓ Your news preferences are processed</li>
            <li>✓ Articles are collected from RSS feeds</li>
            <li>✓ Audio digest is generated</li>
            <li>✓ Sentiment analysis is performed</li>
            <li>✓ Your interests are tracked</li>
            <li>✓ Email with audio is sent to you</li>
          </ul>
        </div>
      </form>
    </div>
  );
};
