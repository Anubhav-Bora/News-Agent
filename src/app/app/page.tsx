"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Mail, FileText, Volume2, Zap, Settings, User, LogOut, ChevronDown, Loader2 } from "lucide-react"
import Link from "next/link"

export default function AppPage() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const [email, setEmail] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedState, setSelectedState] = useState("")
  const [selectedLanguage, setSelectedLanguage] = useState("hindi")
  const [weatherLocation, setWeatherLocation] = useState("")
  const [includeAudio, setIncludeAudio] = useState(true)
  const [includePDF, setIncludePDF] = useState(true)
  const [includeSentiment, setIncludeSentiment] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState("")

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/signin")
    }
  }, [user, loading, router])

  // Set email from user if logged in
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email)
    }
  }, [user?.email])

  const categories = [
    { id: "all", label: "All News", icon: "📰" },
    { id: "india", label: "India", icon: "🇮🇳" },
    { id: "international", label: "International", icon: "🌍" },
    { id: "tech", label: "Technology", icon: "💻" },
    { id: "sports", label: "Sports", icon: "⚽" },
    { id: "state", label: "State News", icon: "📍" },
  ]

  const languages = [
    { code: "hindi", label: "हिंदी (Hindi)" },
    { code: "english", label: "English" },
    { code: "gujarati", label: "ગુજરાતી (Gujarati)" },
    { code: "marathi", label: "मराठी (Marathi)" },
    { code: "assamese", label: "অসমীয়া (Assamese)" },
    { code: "bengali", label: "বাংলা (Bengali)" },
    { code: "tamil", label: "தமிழ் (Tamil)" },
    { code: "telugu", label: "తెలుగు (Telugu)" },
    { code: "kannada", label: "ಕನ್ನಡ (Kannada)" },
    { code: "malayalam", label: "മലയാളം (Malayalam)" },
    { code: "punjabi", label: "ਪੰਜਾਬੀ (Punjabi)" },
  ]

  const indianStates = [
    { code: "ap", label: "Andhra Pradesh" },
    { code: "ar", label: "Arunachal Pradesh" },
    { code: "as", label: "Assam" },
    { code: "br", label: "Bihar" },
    { code: "cg", label: "Chhattisgarh" },
    { code: "ga", label: "Goa" },
    { code: "gj", label: "Gujarat" },
    { code: "hr", label: "Haryana" },
    { code: "hp", label: "Himachal Pradesh" },
    { code: "jk", label: "Jammu & Kashmir" },
    { code: "jh", label: "Jharkhand" },
    { code: "ka", label: "Karnataka" },
    { code: "kl", label: "Kerala" },
    { code: "mp", label: "Madhya Pradesh" },
    { code: "mh", label: "Maharashtra" },
    { code: "mn", label: "Manipur" },
    { code: "ml", label: "Meghalaya" },
    { code: "mz", label: "Mizoram" },
    { code: "nl", label: "Nagaland" },
    { code: "od", label: "Odisha" },
    { code: "pb", label: "Punjab" },
    { code: "rj", label: "Rajasthan" },
    { code: "sk", label: "Sikkim" },
    { code: "tn", label: "Tamil Nadu" },
    { code: "tg", label: "Telangana" },
    { code: "tr", label: "Tripura" },
    { code: "up", label: "Uttar Pradesh" },
    { code: "uk", label: "Uttarakhand" },
    { code: "wb", label: "West Bengal" },
    { code: "dl", label: "Delhi" },
    { code: "ch", label: "Chandigarh" },
    { code: "ld", label: "Lakshadweep" },
    { code: "py", label: "Puducherry" },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      alert("Please enter your email")
      return
    }

    setIsLoading(true)
    setProgress(0)
    setCurrentStep("Collecting articles...")
    
    try {
      const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
      
      const steps = [
        { name: "Collecting articles...", duration: 2000 },
        { name: "Translating content...", duration: 2000 },
        { name: "Generating audio...", duration: 2000 },
        { name: "Analyzing sentiment...", duration: 1500 },
        { name: "Creating PDF...", duration: 1500 },
        { name: "Sending email...", duration: 1000 }
      ]
      
      let currentProgress = 0
      for (const step of steps) {
        setCurrentStep(step.name)
        const startTime = Date.now()
        while (Date.now() - startTime < step.duration && currentProgress < 95) {
          currentProgress = Math.min(95, currentProgress + Math.random() * 8)
          setProgress(currentProgress)
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
      
      const response = await fetch("/api/run-pipeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user?.id || "user-" + Date.now(),
          userName: userName,
          email: email,
          language: selectedLanguage,
          newsType: selectedCategory === "state" ? "state" : selectedCategory,
          state: selectedState || undefined,
          location: weatherLocation || undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setProgress(100)
        setCurrentStep("Complete! ✓")
        await new Promise(resolve => setTimeout(resolve, 500))
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 5000)
        setEmail("")
        setSelectedCategory("all")
        setSelectedState("")
        setWeatherLocation("")
      } else {
        alert(`Error: ${data.message || "Failed to generate digest"}`)
      }
    } catch (error) {
      console.error("Error:", error)
      alert("An error occurred while generating your digest")
    } finally {
      setIsLoading(false)
      setProgress(0)
      setCurrentStep("")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary">
            News Agent
          </Link>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-muted rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
            <div className="relative group">
              <button className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg transition-colors">
                <User className="w-5 h-5" />
                <ChevronDown className="w-4 h-4" />
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <button className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {user?.email || "Profile"}
                </button>
                <button 
                  onClick={async () => {
                    await signOut()
                    router.push("/")
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2 border-t border-border"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Form */}
          <div className="lg:col-span-2">
            <Card className="p-8">
              <h1 className="text-3xl font-bold mb-8">Create Your News Digest</h1>
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Email Input */}
                <div>
                  <label className="block text-sm font-medium mb-2">Email Address</label>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pr-10"
                      required
                    />
                    {email && email.includes("@") && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-accent">✓</div>
                    )}
                  </div>
                </div>

                {/* Language Selector */}
                <div>
                  <label className="block text-sm font-medium mb-2">Language</label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-background"
                  >
                    {languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Selector */}
                <div>
                  <label className="block text-sm font-medium mb-4">News Category</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`p-4 rounded-lg border-2 transition-all text-center ${
                          selectedCategory === cat.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="text-2xl mb-2">{cat.icon}</div>
                        <div className="text-sm font-medium">{cat.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* State Selector - Conditional */}
                {selectedCategory === "state" && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Select State</label>
                    <select
                      value={selectedState}
                      onChange={(e) => setSelectedState(e.target.value)}
                      className="w-full px-4 py-2 border border-border rounded-lg bg-background"
                    >
                      <option value="">Choose a state...</option>
                      {indianStates.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Weather Location (Optional) */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    <span>📍 Weather Location</span>
                    <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., New Delhi, Mumbai, New York"
                    value={weatherLocation}
                    onChange={(e) => setWeatherLocation(e.target.value)}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter a city name to include weather information in your digest</p>
                </div>

                {/* Advanced Options */}
                <div className="border-t border-border pt-6">
                  <details className="group">
                    <summary className="cursor-pointer font-medium flex items-center gap-2">
                      <span>Advanced Options</span>
                      <span className="group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-4 space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeSentiment}
                          onChange={(e) => setIncludeSentiment(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Include sentiment analysis</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeAudio}
                          onChange={(e) => setIncludeAudio(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Include audio (MP3)</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includePDF}
                          onChange={(e) => setIncludePDF(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">Include PDF</span>
                      </label>
                    </div>
                  </details>
                </div>

                {/* Submit Button */}
                <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate Digest"
                  )}
                </Button>

                {/* Progress Bar */}
                {isLoading && (
                  <div className="space-y-3 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-foreground">{currentStep}</p>
                      <span className="text-xs font-semibold text-primary">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-primary via-secondary to-accent rounded-full transition-all duration-300 ease-out shadow-lg shadow-primary/50"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex gap-1 mt-3">
                      {[...Array(6)].map((_, i) => (
                        <div 
                          key={i}
                          className={`flex-1 h-1 rounded-full transition-all ${
                            (progress / 100) * 6 > i 
                              ? 'bg-primary' 
                              : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </form>

              {/* Success Message */}
              {showSuccess && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-start gap-3">
                  <span className="text-xl">✓</span>
                  <div>
                    <p className="font-semibold">Email digest sent successfully!</p>
                    <p className="text-sm opacity-90">Check <span className="font-medium">{email}</span> for your personalized news digest with PDF, audio, and analysis.</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Right Column - Preview */}
          <div className="space-y-6">
            <Card className="p-6 bg-gradient-to-br from-accent/10 to-primary/10">
              <h3 className="font-semibold mb-4">What You'll Get</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-medium text-sm">Email Digest</p>
                    <p className="text-xs text-muted-foreground">Personalized summary</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-medium text-sm">PDF Report</p>
                    <p className="text-xs text-muted-foreground">8-page professional digest</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Volume2 className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-medium text-sm">Audio Podcast</p>
                    <p className="text-xs text-muted-foreground">MP3 format, 15 min</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-4">Digest Preview</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Articles</span>
                  <span className="font-medium">15+</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Generation Time</span>
                  <span className="font-medium">~30 sec</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Format</span>
                  <span className="font-medium">Multi-format</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-accent/50 bg-accent/5">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-accent flex-shrink-0 mt-1" />
                <div>
                  <p className="font-medium text-sm mb-1">Pro Features</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>✓ Sentiment analysis</li>
                    <li>✓ Topic extraction</li>
                    <li>✓ Custom categories</li>
                  </ul>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10 border-2 border-dashed border-purple-300/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full -mr-10 -mt-10 blur-xl" />
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-orange-400/20 to-yellow-400/20 rounded-full -ml-8 -mb-8 blur-xl" />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    🎨 Coming Soon
                  </h3>
                  <span className="text-xl animate-bounce">✨</span>
                </div>
                
                <p className="text-sm font-semibold text-foreground mb-3">PDF in Your Own Language</p>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Soon you'll receive PDF reports fully formatted in Hindi, Gujarati, Tamil, Telugu, and 20+ other Indian languages. Beautifully designed, fully readable.
                </p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>Native language fonts</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                    <span>Professional formatting</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    <span>Full content support</span>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-purple-200/30">
                  <p className="text-xs text-purple-600 font-medium">📧 We'll notify you when it's ready</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
