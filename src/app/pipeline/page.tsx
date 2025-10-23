"use client";

import React, { useState } from "react";
import { PipelineSelector, type PipelineFormData } from "../components/PipelineSelector";

interface PipelineResponse {
  success: boolean;
  message: string;
  pipelineId?: string;
  status?: string;
  results?: {
    articlesCollected: number;
    sentimentAnalyzed: number;
    audioGenerated: boolean;
    emailSent: boolean;
  };
}

export default function PipelinePage() {
  const [isLoading, setIsLoading] = useState(false);

  const handlePipelineSubmit = async (data: PipelineFormData): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/run-pipeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result: PipelineResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to start pipeline");
      }

      // Show success with pipelineId
      if (result.pipelineId) {
        console.log(`Pipeline started with ID: ${result.pipelineId}`);
        // You could redirect to a status page or show details
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <PipelineSelector onSubmit={handlePipelineSubmit} isLoading={isLoading} />
    </div>
  );
}
