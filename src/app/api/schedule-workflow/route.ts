import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";

interface ScheduleWorkflowRequest {
  userId: string;
  userName: string;
  email: string;
  language: string;
  newsType: string;
  state?: string;
  location?: string;
  timing: 'now' | 'schedule';
  scheduleTime?: string;
  scheduleDays?: number;
  timezone?: string;
}

interface GitHubWorkflowDispatch {
  ref: string;
  inputs: {
    userId: string;
    userName: string;
    email: string;
    language: string;
    newsType: string;
    state?: string;
    location?: string;
    schedule_time?: string;
    schedule_date?: string;
    run_now: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ScheduleWorkflowRequest;

    const {
      userId,
      userName,
      email,
      language,
      newsType,
      state,
      location,
      timing,
      scheduleTime,
      scheduleDays,
      timezone
    } = body;

    // Validate required fields
    if (!userId || !email || !language || !newsType) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields",
          error: "userId, email, language, and newsType are required",
        },
        { status: 400 }
      );
    }

    // If timing is 'now', run the pipeline immediately via the existing endpoint
    if (timing === 'now') {
      logger.info(`Running pipeline immediately for user: ${userName}`);
      
      // Call the existing run-pipeline endpoint
      const pipelineResponse = await fetch(`${request.nextUrl.origin}/api/run-pipeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          userName,
          email,
          language,
          newsType,
          state,
          location,
        }),
      });

      const pipelineResult = await pipelineResponse.json();
      
      return NextResponse.json({
        success: true,
        message: "Pipeline executed immediately",
        mode: "immediate",
        result: pipelineResult,
      });
    }

    // For scheduled execution, trigger GitHub workflow
    if (!scheduleTime || !scheduleDays || scheduleDays < 1) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing schedule information",
          error: "scheduleTime and scheduleDays are required for scheduled execution",
        },
        { status: 400 }
      );
    }

    // Calculate schedule dates for the duration
    const currentDate = new Date();
    const scheduleDateTime = `${currentDate.toISOString().split('T')[0]} ${scheduleTime}`;
    logger.info(`Scheduling workflow for ${scheduleDays} days starting ${scheduleDateTime} (${timezone})`);

    // For now, we'll create a single workflow that handles the daily scheduling
    // In a production setup, you might want to use GitHub's schedule cron jobs
    // or a proper job scheduler like AWS EventBridge or Azure Logic Apps
    
    const scheduleData = {
      userId,
      userName,
      email,
      scheduleTime: scheduleTime,
      scheduleDays: scheduleDays,
      timezone: timezone || 'UTC',
      frequency: 'daily',
      newsType,
      language,
      state,
      location,
    };

    // Store schedule in database for tracking
    await storeSchedule(scheduleData);

    logger.info(`Daily schedule created for user: ${userName} - ${scheduleTime} (${timezone}) for ${scheduleDays} days`);

    return NextResponse.json({
      success: true,
      message: "Daily schedule created successfully",
      mode: "scheduled",
      schedule: {
        time: scheduleTime,
        timezone: timezone || 'UTC',
        days: scheduleDays,
        frequency: 'daily',
        expiryDate: new Date(Date.now() + scheduleDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Schedule workflow failed: ${errorMessage}`, error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to schedule workflow",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Helper function to store schedule in database
async function storeSchedule(scheduleData: {
  userId: string;
  userName: string;
  email: string;
  scheduleTime: string;
  scheduleDays: number;
  timezone: string;
  frequency: string;
  newsType: string;
  language: string;
  state?: string;
  location?: string;
}) {
  try {
    // This would typically save to your database
    // For now, just log it
    logger.info('Schedule stored:', scheduleData);
    
    // TODO: Implement database storage
    // Example with Supabase:
    // const { data, error } = await supabase
    //   .from('scheduled_news')
    //   .insert([{
    //     user_id: scheduleData.userId,
    //     user_name: scheduleData.userName,
    //     user_email: scheduleData.email,
    //     schedule_time: scheduleData.scheduleTime,
    //     schedule_days: scheduleData.scheduleDays,
    //     timezone: scheduleData.timezone,
    //     frequency: scheduleData.frequency,
    //     news_type: scheduleData.newsType,
    //     language: scheduleData.language,
    //     state: scheduleData.state,
    //     location: scheduleData.location,
    //     status: 'scheduled',
    //     created_at: new Date().toISOString(),
    //   }]);
    
  } catch (error) {
    logger.error('Failed to store schedule:', error);
    // Don't throw - this is non-critical
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      {
        success: false,
        message: "Missing userId parameter",
        error: "userId query parameter is required",
      },
      { status: 400 }
    );
  }

  // TODO: Retrieve user's scheduled workflows from database
  
  return NextResponse.json({
    success: true,
    message: "Scheduled workflows retrieved",
    schedules: [], // TODO: Return actual schedules from database
  });
}