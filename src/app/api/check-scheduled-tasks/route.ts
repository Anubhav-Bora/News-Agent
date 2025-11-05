import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    logger.info("🕒 Checking for scheduled tasks to execute");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current time
    const now = new Date();
    const currentTime = now.toTimeString().substring(0, 5); // HH:MM format
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    logger.info(`🕐 Current time: ${currentTime}, checking active tasks`);

    // Query for active tasks that haven't expired
    const { data: scheduledTasks, error } = await supabase
      .from('scheduled_news_tasks')
      .select('*')
      .eq('status', 'active')
      .gte('expiry_date', currentDate);

    if (error) {
      throw error;
    }

    if (!scheduledTasks || scheduledTasks.length === 0) {
      logger.info("📭 No active scheduled tasks found");
      return NextResponse.json({
        success: true,
        message: "No scheduled tasks to execute",
        currentTime,
        tasksExecuted: 0
      });
    }

    logger.info(`📋 Found ${scheduledTasks.length} active scheduled tasks`);

    let executedTasks = 0;
    const results = [];

    // Execute each scheduled task that's due
    for (const task of scheduledTasks) {
      try {
        if (shouldExecuteTask(task, currentTime, currentDate)) {
          logger.info(`🚀 Executing scheduled task for user: ${task.user_name} (${task.user_email})`);

          // Call the pipeline API
          const pipelineResponse = await fetch(`${request.nextUrl.origin}/api/run-pipeline`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: task.user_id,
              userName: task.user_name,
              email: task.user_email,
              language: task.language,
              newsType: task.news_type,
              state: task.state,
              location: task.location,
              source: 'scheduled-execution'
            }),
          });

          const pipelineResult = await pipelineResponse.json();
          
          if (pipelineResponse.ok) {
            executedTasks++;
            results.push({
              taskId: task.id,
              userName: task.user_name,
              email: task.user_email,
              scheduleTime: task.schedule_time,
              status: 'success',
              executedAt: now.toISOString()
            });

            // Update last_run timestamp in database
            await supabase
              .from('scheduled_news_tasks')
              .update({ last_run: now.toISOString() })
              .eq('id', task.id);

            logger.info(`✅ Task executed successfully for ${task.user_name}`);
          } else {
            results.push({
              taskId: task.id,
              userName: task.user_name,
              email: task.user_email,
              scheduleTime: task.schedule_time,
              status: 'failed',
              error: pipelineResult.message || 'Pipeline execution failed'
            });
            logger.error(`❌ Task failed for ${task.user_name}: ${pipelineResult.message}`);
          }
        } else {
          logger.info(`⏭️ Skipping task for ${task.user_name} - not due yet (scheduled: ${task.schedule_time})`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error executing task for ${task.user_name}: ${errorMessage}`);
        results.push({
          taskId: task.id,
          userName: task.user_name,
          email: task.user_email,
          scheduleTime: task.schedule_time,
          status: 'error',
          error: errorMessage
        });
      }
    }

    logger.info(`📊 Scheduled task check complete: ${executedTasks}/${scheduledTasks.length} tasks executed`);

    return NextResponse.json({
      success: true,
      message: `Checked ${scheduledTasks.length} tasks, executed ${executedTasks}`,
      currentTime,
      tasksFound: scheduledTasks.length,
      tasksExecuted: executedTasks,
      results
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to check scheduled tasks: ${errorMessage}`, error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to check scheduled tasks",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Helper function to determine if a task should be executed
function shouldExecuteTask(task: any, currentTime: string, currentDate: string): boolean {
  // Handle timezone conversion
  let scheduleTimeToCheck = task.schedule_time;
  
  // If timezone is IST/Asia/Kolkata, convert to UTC for comparison
  if (task.timezone === 'Asia/Kolkata' || task.timezone === 'IST') {
    const [scheduleHour, scheduleMinute] = task.schedule_time.split(':').map(Number);
    // Convert IST to UTC (IST = UTC + 5:30)
    let utcHour = scheduleHour - 5;
    let utcMinute = scheduleMinute - 30;
    
    if (utcMinute < 0) {
      utcMinute += 60;
      utcHour -= 1;
    }
    
    if (utcHour < 0) {
      utcHour += 24;
    }
    
    scheduleTimeToCheck = `${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')}`;
    
    logger.info(`🕐 Converting ${task.schedule_time} IST to ${scheduleTimeToCheck} UTC for task: ${task.user_name}`);
  }
  
  const [scheduleHour, scheduleMinute] = scheduleTimeToCheck.split(':').map(Number);
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  
  // Convert times to minutes for easier comparison
  const scheduleMinutes = scheduleHour * 60 + scheduleMinute;
  const currentMinutes = currentHour * 60 + currentMinute;
  
  // Check if we're within a 15-minute window of the scheduled time
  const timeDiff = Math.abs(currentMinutes - scheduleMinutes);
  const isWithinTimeWindow = timeDiff <= 15;
  
  // Check if this task was already run today
  const lastRun = task.last_run ? new Date(task.last_run).toISOString().split('T')[0] : null;
  const hasRunToday = lastRun === currentDate;
  
  // Execute if within time window and hasn't run today
  const shouldExecute = isWithinTimeWindow && !hasRunToday;
  
  if (shouldExecute) {
    logger.info(`⏰ Task ready to execute: ${task.user_name} - scheduled: ${task.schedule_time} ${task.timezone} (${scheduleTimeToCheck} UTC), current: ${currentTime} UTC, last run: ${lastRun || 'never'}`);
  } else if (isWithinTimeWindow && hasRunToday) {
    logger.info(`⏭️ Task already executed today: ${task.user_name} - last run: ${lastRun}`);
  } else {
    logger.info(`⏭️ Task not in time window: ${task.user_name} - scheduled: ${scheduleTimeToCheck} UTC, current: ${currentTime} UTC, diff: ${timeDiff} minutes`);
  }
  
  return shouldExecute;
}