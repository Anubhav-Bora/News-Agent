"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Newspaper, User, ChevronDown, LogOut } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"

export function Header() {
  const router = useRouter()
  const { user, signOut } = useAuth()

  return (
    <nav className="sticky top-0 z-50 glass border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Newspaper className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold gradient-text">News Agent</span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-foreground hover:text-primary transition-colors text-sm font-medium"
          >
            Dashboard
          </Link>
          <ThemeToggle />
          {user ? (
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
          ) : (
            <Button asChild size="sm" className="rounded-full">
              <Link href="/app">Get Started</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
