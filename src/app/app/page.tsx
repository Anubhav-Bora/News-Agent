"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Mail, FileText, Volume2, Zap, Settings, User, LogOut, ChevronDown, Loader2, Calendar, Clock } from "lucide-react"
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
  const [deliveryMode, setDeliveryMode] = useState<'now' | 'schedule'>('now')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleDays, setScheduleDays] = useState(1)
  const [timezone, setTimezone] = useState('UTC')

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

  // Get current time for default schedule time
  useEffect(() => {
    if (!scheduleTime) {
      const now = new Date()
      const currentTime = now.toTimeString().slice(0, 5)
      setScheduleTime(currentTime)
    }
  }, [scheduleTime])

  const categories = [
    { id: "all", label: "All News", icon: "📰" },
    { id: "national", label: "National", icon: "🇮🇳" },
    { id: "international", label: "International", icon: "🌍" },
    { id: "technology", label: "Technology", icon: "💻" },
    { id: "sports", label: "Sports", icon: "⚽" },
    { id: "state", label: "State News", icon: "📍" },
  ]

  const languages = [
    { code: "Hindi", label: "हिंदी (Hindi)" },
    { code: "English", label: "English" },
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

  const timezones = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      alert("Please enter your email")
      return
    }

    if (deliveryMode === 'schedule' && (!scheduleTime || scheduleDays < 1)) {
      alert("Please set a valid schedule time and number of days")
      return
    }

    setIsLoading(true)
    setProgress(0)
    setCurrentStep(deliveryMode === 'now' ? "Starting pipeline..." : "Setting up schedule...")
    
    try {
      const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
      
      if (deliveryMode === 'now') {
        // Immediate generation - existing logic
        const progressSteps = [
          { name: "Collecting articles...", targetProgress: 15, expectedDuration: 8000 },
          { name: "Translating content...", targetProgress: 30, expectedDuration: 5000 },
          { name: "Analyzing sentiment...", targetProgress: 45, expectedDuration: 6000 },
          { name: "Generating audio...", targetProgress: 65, expectedDuration: 10000 },
          { name: "Creating PDF...", targetProgress: 80, expectedDuration: 5000 },
          { name: "Sending email...", targetProgress: 95, expectedDuration: 2000 }
        ]
        
        let currentStepIndex = 0
        let pipelineComplete = false
        
        const progressInterval = setInterval(() => {
          if (pipelineComplete) {
            clearInterval(progressInterval)
            return
          }
          
          if (currentStepIndex < progressSteps.length) {
            const step = progressSteps[currentStepIndex]
            setCurrentStep(step.name)
            
            setProgress(prev => {
              const target = step.targetProgress
              if (prev >= target - 1) {
                currentStepIndex++
                if (currentStepIndex >= progressSteps.length) {
                  pipelineComplete = true
                }
                return prev
              }
              return Math.min(target - 1, prev + Math.random() * 3 + 1)
            })
          }
        }, 200)
        
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
        clearInterval(progressInterval)
        pipelineComplete = true

        if (response.ok) {
          setProgress(100)
          setCurrentStep("Complete! ✓")
          await new Promise(resolve => setTimeout(resolve, 500))
          setShowSuccess(true)
        } else {
          alert(`Error: ${data.message || "Failed to generate digest"}`)
        }
      } else {
        // Schedule mode - create workflow schedule
        const scheduleData = {
          userId: user?.id || "user-" + Date.now(),
          userName: userName,
          email: email,
          language: selectedLanguage,
          newsType: selectedCategory === "state" ? "state" : selectedCategory,
          state: selectedState || undefined,
          location: weatherLocation || undefined,
          timing: 'schedule' as const,
          scheduleTime: scheduleTime,
          scheduleDays: scheduleDays,
          timezone: timezone,
        }

        const response = await fetch("/api/schedule-workflow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(scheduleData),
        })

        const data = await response.json()

        if (response.ok) {
          setCurrentStep("Schedule created successfully! ✓")
          setShowSuccess(true)
        } else {
          setCurrentStep(`Error: ${data.message || "Failed to schedule digest"}`)
        }
      }
    } catch (error) {
      console.error("Error:", error)
      setCurrentStep("An error occurred")
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
            <div className="relative group">
              <button className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg transition-colors">
                <User className="w-5 h-5" />
                <ChevronDown className="w-4 h-4" />
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <button 
                  onClick={async () => {
                    await signOut()
                    router.push("/")
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-muted flex items-center gap-2"
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

                {/* Delivery Mode Selection */}
                <div className="border-t border-border pt-6">
                  <Label className="text-base font-medium mb-4 block">Delivery Options</Label>
                  <RadioGroup value={deliveryMode} onValueChange={(value) => setDeliveryMode(value as 'now' | 'schedule')}>
                    <div className="flex items-center space-x-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value="now" id="now" />
                      <Label htmlFor="now" className="flex items-center gap-2 cursor-pointer flex-1">
                        <Zap className="w-4 h-4 text-green-600" />
                        <div>
                          <div className="font-medium">Generate Now</div>
                          <div className="text-sm text-muted-foreground">
                            Get your news digest immediately
                          </div>
                        </div>
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value="schedule" id="schedule" />
                      <Label htmlFor="schedule" className="flex items-center gap-2 cursor-pointer flex-1">
                        <Clock className={`w-4 h-4 ${deliveryMode === 'schedule' ? 'text-white' : 'text-blue-600'}`} />
                        <div>
                          <div className="font-medium">Schedule Daily Delivery</div>
                          <div className="text-sm text-muted-foreground">
                            Set a time for daily news delivery
                          </div>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>

                  {/* Schedule Options */}
                  {deliveryMode === 'schedule' && (
                    <div className="mt-6 space-y-4 p-4 bg-black rounded-lg border border-black/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4 text-white" />
                        <Label className="font-medium text-white">Schedule Settings</Label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="scheduleTime" className="text-sm font-medium mb-1 block text-white">
                            Daily Time
                          </Label>
                          <Input
                            type="time"
                            id="scheduleTime"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            required
                            className="w-full"
                          />
                        </div>

                        <div>
                          <Label htmlFor="scheduleDays" className="text-sm font-medium mb-1 block text-white">
                            Number of Days
                          </Label>
                          <Input
                            type="number"
                            id="scheduleDays"
                            value={scheduleDays}
                            onChange={(e) => setScheduleDays(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                            max="365"
                            required
                            className="w-full"
                          />
                        </div>

                        <div>
                          <Label htmlFor="timezone" className="text-sm font-medium mb-1 block text-white">
                            Timezone
                          </Label>
                          <select
                            id="timezone"
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-md bg-background"
                          >
                            {timezones.map((tz) => (
                              <option key={tz.value} value={tz.value}>
                                {tz.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="p-3 bg-black/80 border border-white/20 rounded-md">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-white" />
                          <span className="text-sm font-medium text-white">
                            Schedule Summary
                          </span>
                        </div>
                        <p className="text-sm text-white/90 mt-1">
                          Daily digest at <strong>{scheduleTime || "00:00"}</strong> ({timezone}) for <strong>{scheduleDays}</strong> day{scheduleDays !== 1 ? 's' : ''}
                          {scheduleDays > 0 && (
                            <span className="block mt-1">
                              Expires: {new Date(Date.now() + scheduleDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
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
                      {deliveryMode === 'now' ? 'Generating...' : 'Setting up schedule...'}
                    </>
                  ) : (
                    deliveryMode === 'now' ? 'Generate Digest Now' : 'Schedule Daily Digest'
                  )}
                </Button>

                {/* Progress Bar */}
                {isLoading && deliveryMode === 'now' && (
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

                {/* Schedule Status */}
                {isLoading && deliveryMode === 'schedule' && (
                  <div className="p-4 rounded-lg bg-black border border-white/20">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                      <span className="font-medium text-white">{currentStep}</span>
                    </div>
                  </div>
                )}
              </form>

              {/* Success Message */}
              {showSuccess && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-start gap-3">
                  <span className="text-xl">✓</span>
                  <div>
                    <p className="font-semibold">
                      {deliveryMode === 'now' ? 'Email digest sent successfully!' : 'Daily digest scheduled successfully!'}
                    </p>
                    <p className="text-sm opacity-90">
                      {deliveryMode === 'now' 
                        ? `Check ${email} for your personalized news digest with PDF, audio, and analysis.`
                        : `You'll receive daily digests at ${scheduleTime} (${timezone}) for ${scheduleDays} days.`
                      }
                    </p>
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

            {deliveryMode === 'schedule' && (
              <Card className="p-6 bg-black border-white/20">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-white" />
                  <h3 className="font-semibold text-white">Daily Schedule</h3>
                </div>
                <div className="space-y-3 text-sm text-white/90">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                    <span>Automated daily delivery</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                    <span>Same time every day</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                    <span>Automatic expiry</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                    <span>Fresh content daily</span>
                  </div>
                </div>
              </Card>
            )}

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
                {deliveryMode === 'schedule' && (
                  <div className="flex justify-between border-t border-border pt-2 mt-3">
                    <span className="text-muted-foreground">Frequency</span>
                    <span className="font-medium">Daily</span>
                  </div>
                )}
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
                    {deliveryMode === 'schedule' && (
                      <li>✓ Automated scheduling</li>
                    )}
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}