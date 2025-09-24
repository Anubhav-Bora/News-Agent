// Central logging util
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  
  private log(level: LogLevel, message: string, data?: any) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    
    this.logs.push(logEntry);
    
    // Console output with colors
    const colors = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      debug: '\x1b[37m',   // White
    };
    
    const reset = '\x1b[0m';
    const timestamp = new Date().toLocaleTimeString();
    
    console.log(
      `${colors[level]}[${level.toUpperCase()}] ${timestamp}${reset}:`,
      message,
      data ? JSON.stringify(data, null, 2) : ''
    );
  }
  
  info(message: string, data?: any) {
    this.log('info', message, data);
  }
  
  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }
  
  error(message: string, data?: any) {
    this.log('error', message, data);
  }
  
  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }
  
  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return this.logs;
  }
  
  clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();