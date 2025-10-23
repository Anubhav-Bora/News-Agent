import { NextRequest, NextResponse } from "next/server";
import { executePipeline, type PipelineInput, type PipelineOutput } from "@/lib/orchestrator";
import logger from "@/lib/logger";

export interface PipelineResponse {
  success: boolean;
  message: string;
  pipelineId: string;
  status: string;
  results?: {
    newsCollected: number;
    audioGenerated: boolean;
    emailSent: boolean;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<PipelineResponse>> {
  const pipelineId = `pipeline-${Date.now()}`;

  try {
    const body = (await request.json()) as PipelineInput;

    const { userId, email, language, newsType, state, location } = body;

    if (!userId || !email || !language || !newsType) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields",
          pipelineId,
          status: "FAILED",
          error: "userId, email, language, and newsType are required",
        },
        { status: 400 }
      );
    }

    logger.info(`Starting pipeline ${pipelineId}`, {
      userId,
      newsType,
      language,
    });

    const result: PipelineOutput = await executePipeline({
      userId,
      email,
      language,
      newsType,
      state,
      location,
    });

    logger.info(`Pipeline ${pipelineId} completed successfully`, {
      articlesProcessed: result.newsCollected,
      audioGenerated: result.audioGenerated,
      emailSent: result.emailSent,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Pipeline executed successfully",
        pipelineId,
        status: "COMPLETED",
        results: {
          newsCollected: result.newsCollected,
          audioGenerated: result.audioGenerated,
          emailSent: result.emailSent,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Pipeline ${pipelineId} failed: ${errorMessage}`, error);

    return NextResponse.json(
      {
        success: false,
        message: "Pipeline execution failed",
        pipelineId,
        status: "FAILED",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const pipelineId = request.nextUrl.searchParams.get("pipelineId");

  if (!pipelineId) {
    return NextResponse.json(
      {
        success: false,
        message: "Missing pipelineId parameter",
        error: "pipelineId query parameter is required",
      },
      { status: 400 }
    );
  }

  logger.info(`Checking status of pipeline: ${pipelineId}`);

  return NextResponse.json(
    {
      pipelineId,
      status: "COMPLETED",
      message: "Pipeline status retrieved",
    },
    { status: 200 }
  );
}
