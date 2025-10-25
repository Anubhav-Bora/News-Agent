"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Mail, FileText, Volume2, Download, Share2, ArrowLeft, Play } from "lucide-react"
import Link from "next/link"

export default function DigestPreviewPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary">
            News Agent
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Email Preview */}
        <Card className="p-8 mb-8 bg-white text-foreground">
          <div className="border-b border-border pb-6 mb-6">
            <p className="text-sm text-muted-foreground mb-2">From: News Agent &lt;digest@newsagent.ai&gt;</p>
            <p className="text-sm text-muted-foreground mb-4">To: user@example.com</p>
            <h2 className="text-2xl font-bold">Your Daily News Digest - October 23, 2025</h2>
          </div>

          <div className="prose prose-sm max-w-none mb-8">
            <p className="text-lg mb-6">Hello,</p>
            <p className="mb-6">
              Here's your personalized news digest for today, curated from 1000+ articles across multiple sources.
            </p>

            <h3 className="text-lg font-semibold mt-8 mb-4">Top Stories</h3>
            <div className="space-y-4">
              {[
                { title: "AI Breakthrough: New Model Achieves Human-Level Performance", source: "TechNews" },
                { title: "Global Markets Rally on Economic Data", source: "Bloomberg" },
                { title: "Climate Summit Reaches Historic Agreement", source: "Reuters" },
              ].map((story, i) => (
                <div key={i} className="border-l-4 border-accent pl-4">
                  <p className="font-semibold">{story.title}</p>
                  <p className="text-sm text-muted-foreground">{story.source}</p>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-semibold mt-8 mb-4">Sentiment Analysis</h3>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm">
                <strong>Overall Sentiment:</strong> 62% Positive | 25% Neutral | 13% Negative
              </p>
            </div>

            <p className="mt-8">
              Best regards,
              <br />
              The News Agent Team
            </p>
          </div>

          <div className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">
              <a href="#" className="text-accent hover:underline">
                Unsubscribe
              </a>
            </p>
          </div>
        </Card>

        {/* Attachments */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">PDF Report</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  8-page professional digest with charts and analysis
                </p>
                <Button size="sm" variant="outline" className="w-full bg-transparent">
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-accent/10 rounded-lg">
                <Volume2 className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Audio Podcast</h3>
                <p className="text-sm text-muted-foreground mb-4">15-minute narrated digest in MP3 format</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 bg-transparent">
                    <Play className="w-4 h-4 mr-2" />
                    Play
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button className="bg-primary hover:bg-primary/90 flex-1">
            <Mail className="w-4 h-4 mr-2" />
            Resend Email
          </Button>
          <Button variant="outline" className="flex-1 bg-transparent">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button variant="outline" className="flex-1 bg-transparent">
            Adjust Preferences
          </Button>
        </div>
      </div>
    </div>
  )
}
