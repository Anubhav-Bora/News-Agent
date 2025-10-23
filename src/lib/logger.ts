/**
 * Logger utility for the News Agent application
 */

interface LogContext {
  [key: string]: unknown;
}

const log = (level: string, message: string, context?: LogContext): void => {
  const timestamp = new Date().toISOString();
  const contextStr = context ? JSON.stringify(context) : "";
  console.log(`[${timestamp}] [${level}] ${message} ${contextStr}`);
};

export default {
  info: (message: string, context?: LogContext): void => {
    log("INFO", message, context);
  },
  error: (message: string, error?: unknown): void => {
    const errorStr = error instanceof Error ? error.stack : String(error);
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, errorStr);
  },
  warn: (message: string, context?: LogContext): void => {
    log("WARN", message, context);
  },
  debug: (message: string, context?: LogContext): void => {
    if (process.env.DEBUG) {
      log("DEBUG", message, context);
    }
  },
};
