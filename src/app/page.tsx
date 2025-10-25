"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Mail, Globe, Zap, TrendingUp, Sparkles, ArrowRight, Newspaper } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold gradient-text">News Agent</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/app" className="text-foreground hover:text-primary transition-colors text-sm font-medium">
              App
            </Link>
            <Link
              href="/dashboard"
              className="text-foreground hover:text-primary transition-colors text-sm font-medium"
            >
              Dashboard
            </Link>
            <ThemeToggle />
            <Button asChild size="sm" className="rounded-full">
              <Link href="/app">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/30 bg-accent/5">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-accent text-sm font-medium">AI-Powered News Aggregation</span>
        </div>
        <h1 className="text-6xl md:text-7xl font-bold mb-6 text-balance leading-tight">
          <span className="gradient-text">Stay Informed</span>
          <br />
          <span className="text-foreground">Effortlessly</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto text-balance leading-relaxed">
          Get personalized news digests in multiple formats. AI-powered curation, sentiment analysis, and delivery to
          your inbox.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
          <Button size="lg" asChild className="rounded-full group">
            <Link href="/app" className="flex items-center gap-2">
              Get Started Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="rounded-full bg-transparent">
            Watch Demo
          </Button>
        </div>

        {/* Hero Visual - CHANGE: Replaced placeholder boxes with attractive delivery formats showcase */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 rounded-2xl blur-3xl" />
          <div className="relative glass rounded-2xl p-12 border-accent/20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Text Digest */}
              <div className="group">
                <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg flex items-center justify-center mb-4 group-hover:from-primary/30 group-hover:to-primary/10 transition-all">
                  <Newspaper className="w-12 h-12 text-primary/60 group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Text Digest</h3>
                <p className="text-xs text-muted-foreground">
                  Curated summaries with sentiment analysis and key insights
                </p>
              </div>

              {/* Audio Digest */}
              <div className="group">
                <div className="h-32 bg-gradient-to-br from-secondary/20 to-secondary/5 rounded-lg flex items-center justify-center mb-4 group-hover:from-secondary/30 group-hover:to-secondary/10 transition-all">
                  <svg
                    className="w-12 h-12 text-secondary/60 group-hover:text-secondary transition-colors"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 3v9.28c-.47-.46-1.12-.75-1.84-.75-1.66 0-3 1.34-3 3s1.34 3 3 3c1.66 0 3-1.34 3-3V7h4V3h-4z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-foreground mb-2">Audio Digest</h3>
                <p className="text-xs text-muted-foreground">Listen to news summaries on your commute or workout</p>
              </div>

              {/* PDF Report */}
              <div className="group">
                <div className="h-32 bg-gradient-to-br from-accent/20 to-accent/5 rounded-lg flex items-center justify-center mb-4 group-hover:from-accent/30 group-hover:to-accent/10 transition-all">
                  <svg
                    className="w-12 h-12 text-accent/60 group-hover:text-accent transition-colors"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-8-6z" />
                    <path d="M16 18H8v-2h8v2zm0-4H8v-2h8v2z" opacity="0.5" />
                  </svg>
                </div>
                <h3 className="font-semibold text-foreground mb-2">PDF Report</h3>
                <p className="text-xs text-muted-foreground">Professional formatted report ready to share or archive</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Powerful Features</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Everything you need to stay informed</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={<Mail className="w-6 h-6" />}
            title="Multi-Format"
            description="Text, audio, and PDF in one digest"
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="AI Curation"
            description="Smart filtering and topic selection"
          />
          <FeatureCard
            icon={<Globe className="w-6 h-6" />}
            title="50+ Languages"
            description="Global news in your language"
          />
          <FeatureCard
            icon={<TrendingUp className="w-6 h-6" />}
            title="Sentiment Analysis"
            description="Understand article tone and bias"
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <h2 className="text-4xl font-bold text-center mb-16">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-8">
          {[
            {
              step: 1,
              title: "Select",
              desc: "Choose categories and languages",
              icon: <Newspaper className="w-5 h-5" />,
            },
            { step: 2, title: "Process", desc: "AI analyzes 1000+ articles", icon: <Zap className="w-5 h-5" /> },
            {
              step: 3,
              title: "Generate",
              desc: "Creates multi-format content",
              icon: <Sparkles className="w-5 h-5" />,
            },
            { step: 4, title: "Deliver", desc: "Email with attachments ready", icon: <Mail className="w-5 h-5" /> },
          ].map((item) => (
            <div key={item.step} className="relative group">
              <div className="glass rounded-xl p-6 border-accent/20 h-full hover:border-accent/40 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground mb-4 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="font-semibold mb-2 text-foreground">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Formats Section - CHANGE: Replaced with Indian States Coverage */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Coverage Across India</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Get news from all major Indian states and union territories
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { state: "Delhi", emoji: "🏛️", stories: "2,450+" },
            { state: "Maharashtra", emoji: "🏢", stories: "3,120+" },
            { state: "Karnataka", emoji: "💻", stories: "2,890+" },
            { state: "Tamil Nadu", emoji: "🌊", stories: "2,670+" },
            { state: "Gujarat", emoji: "🏭", stories: "2,540+" },
            { state: "Uttar Pradesh", emoji: "🌾", stories: "3,450+" },
            { state: "West Bengal", emoji: "🎭", stories: "2,310+" },
            { state: "Telangana", emoji: "🔬", stories: "2,180+" },
          ].map((item) => (
            <Card
              key={item.state}
              className="glass border-accent/20 p-6 hover:border-accent/40 transition-all group hover:shadow-lg hover:shadow-primary/10 cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-3xl">{item.emoji}</div>
                <div className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full">
                  {item.stories}
                </div>
              </div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{item.state}</h3>
              <p className="text-xs text-muted-foreground mt-2">Regional & local news</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Footer */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent opacity-10" />
          <div className="relative glass border-accent/30 p-12 md:p-16 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Create your first digest in seconds. No credit card required.
            </p>
            <Button size="lg" asChild className="rounded-full group">
              <Link href="/app" className="flex items-center gap-2">
                Create Your First Digest
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="glass border-accent/20 p-6 hover:border-accent/40 transition-all group hover:shadow-lg hover:shadow-primary/10">
      <div className="text-primary mb-4 group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="font-semibold mb-2 text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  )
}
