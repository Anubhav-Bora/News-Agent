import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info("🧪 Testing scheduling system...");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create a test schedule for 2 minutes from now
    const now = new Date();
    const testTime = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes from now
    const scheduleTime = testTime.toTimeString().substring(0, 5); // HH:MM format

    const testTask = {
      user_id: 'test-user-' + Date.now(),
      user_name: 'Test User',
      user_email: 'test@example.com',
      schedule_time: scheduleTime,
      schedule_days: 1,
      timezone: 'UTC',
      news_type: 'technology',
      language: 'English',
      status: 'active',
      expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };

    // Insert test task
    const { data: insertedTask, error: insertError } = await supabase
      .from('scheduled_news_tasks')
      .insert([testTask])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    logger.info(`✅ Test task created for ${scheduleTime} UTC`);

    // Check current tasks
    const { data: allTasks, error: selectError } = await supabase
      .from('scheduled_news_tasks')
      .select('*')
      .eq('status', 'active');

    if (selectError) {
      throw selectError;
    }

    return NextResponse.json({
      success: true,
      message: "Test scheduling system setup complete",
      testTask: {
        id: insertedTask.id,
        scheduleTime: scheduleTime,
        willRunAt: testTime.toISOString(),
        currentTime: now.toISOString()
      },
      activeTasks: allTasks?.length || 0,
      instructions: [
        "1. The test task is scheduled to run in 2 minutes",
        "2. The GitHub Actions workflow runs every 15 minutes",
        "3. You can manually test by calling /api/check-scheduled-tasks",
        "4. Check your email or logs to see if the pipeline executes"
      ]
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Test setup failed: ${errorMessage}`, error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to setup test",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all scheduled tasks for monitoring
    const { data: tasks, error } = await supabase
      .from('scheduled_news_tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Current scheduled tasks",
      tasks: tasks || [],
      count: tasks?.length || 0
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return NextResponse.json(
      {
        success: false,
        message: "Failed to get tasks",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}