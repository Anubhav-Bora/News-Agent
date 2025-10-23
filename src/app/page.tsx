"use client";

import { ReactNode } from "react";

export default function Home(): ReactNode {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-4">News Agent</h1>
        <p className="text-lg text-gray-600 mb-8">
          Your personalized news digest powered by AI
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="rounded-lg border border-gray-300 p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold mb-2">📰 News Digest</h2>
            <p className="text-gray-600">
              Get personalized news summaries tailored to your interests.
            </p>
          </div>

          <div className="rounded-lg border border-gray-300 p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold mb-2">🎯 Smart Filtering</h2>
            <p className="text-gray-600">
              AI-powered sentiment analysis and topic categorization.
            </p>
          </div>

          <div className="rounded-lg border border-gray-300 p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold mb-2">🔊 Audio News</h2>
            <p className="text-gray-600">
              Listen to your news digest as a podcast.
            </p>
          </div>

          <div className="rounded-lg border border-gray-300 p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold mb-2">📧 Email Delivery</h2>
            <p className="text-gray-600">
              Receive daily digests directly in your inbox.
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </main>
  );
}
