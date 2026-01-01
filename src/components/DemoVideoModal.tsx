"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { X } from "lucide-react"

interface DemoVideoModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DemoVideoModal({ isOpen, onClose }: DemoVideoModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-2xl font-bold">News Agent Demo</DialogTitle>
          <DialogDescription>
            Watch how News Agent works to deliver personalized news digests
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative w-full aspect-video bg-black">
          <iframe
            className="w-full h-full"
            src="https://drive.google.com/file/d/1-vNUOVjg8Lbpf9H0BEDiR1LQV6JSEceC/preview"
            title="News Agent Demo Video"
            allow="autoplay"
            allowFullScreen
          />
        </div>

        <div className="p-6 pt-4 bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Want to try it yourself? <a href="/app" className="text-primary hover:underline font-medium">Get started for free</a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
