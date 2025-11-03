"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Download, Share2, Settings, User, LogOut, ChevronDown, Calendar } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState("digests")

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/signin")
    }
  }, [user, loading, router])

  const sentimentData = [
    { name: "Positive", value: 45, fill: "hsl(var(--color-chart-3))" },
    { name: "Neutral", value: 35, fill: "hsl(var(--color-chart-5))" },
    { name: "Negative", value: 20, fill: "hsl(var(--color-chart-4))" },
  ]

  const categoryData = [
    { name: "Technology", value: 28 },
    { name: "Business", value: 22 },
    { name: "Politics", value: 18 },
    { name: "Sports", value: 15 },
    { name: "Other", value: 17 },
  ]

  const recentDigests = [
    { id: 1, date: "Oct 23, 2025", category: "Technology", articles: 15, sentiment: "Positive" },
    { id: 2, date: "Oct 22, 2025", category: "All News", articles: 18, sentiment: "Neutral" },
    { id: 3, date: "Oct 21, 2025", category: "Business", articles: 12, sentiment: "Mixed" },
  ]

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
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Your news digest analytics and history</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              Last 30 Days
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Digests" value="24" />
          <StatCard label="Articles Processed" value="342" />
          <StatCard label="Avg Sentiment" value="62%" />
          <StatCard label="Languages" value="2" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-border">
          {[
            { id: "digests", label: "Recent Digests" },
            { id: "insights", label: "Article Insights" },
            { id: "preferences", label: "Preferences" },
            { id: "history", label: "History" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "digests" && (
          <div className="space-y-4">
            {recentDigests.map((digest) => (
              <Card key={digest.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="font-semibold">{digest.category}</p>
                    <p className="text-sm text-muted-foreground">{digest.date}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Articles</p>
                      <p className="font-semibold">{digest.articles}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Sentiment</p>
                      <p className="font-semibold text-accent">{digest.sentiment}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline">
                        <Share2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "insights" && (
          <div className="grid lg:grid-cols-2 gap-8">
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Sentiment Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name} ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-4">Category Breakdown</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--color-primary))" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {activeTab === "preferences" && (
          <Card className="p-6 max-w-2xl">
            <h3 className="font-semibold mb-6">Your Preferences</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  defaultValue="user@example.com"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Preferred Language</label>
                <select className="w-full px-4 py-2 border border-border rounded-lg bg-background">
                  <option>English</option>
                  <option>Hindi</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Delivery Frequency</label>
                <select className="w-full px-4 py-2 border border-border rounded-lg bg-background">
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4" />
                  <span className="text-sm">Include sentiment analysis</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4" />
                  <span className="text-sm">Include audio format</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4" />
                  <span className="text-sm">Include PDF format</span>
                </label>
              </div>
              <Button className="bg-primary hover:bg-primary/90">Save Preferences</Button>
            </div>
          </Card>
        )}

        {activeTab === "history" && (
          <Card className="p-6">
            <h3 className="font-semibold mb-4">All Digests</h3>
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 hover:bg-muted rounded-lg transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">Digest #{24 - i}</p>
                    <p className="text-xs text-muted-foreground">Oct {23 - i}, 2025</p>
                  </div>
                  <Button size="sm" variant="ghost">
                    View
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-6">
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <p className="text-3xl font-bold text-primary">{value}</p>
    </Card>
  )
}
