// src/lib/logger.ts

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Check if we're in a test environment
const isTestEnvironment = process.env.NODE_ENV === 'test' ||
                          typeof jest !== 'undefined' ||
                          process.env.JEST_WORKER_ID !== undefined;

export class Logger {
  private logLevel: string;

  constructor(logLevel: string = 'info') {
    this.logLevel = logLevel;
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log('[DEBUG]', ...args);
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info('[INFO]', ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn('[WARN]', ...args);
    }
  }

  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error('[ERROR]', ...args);
    }
  }

  private shouldLog(level: string): boolean {
    // Disable all logging in test environment to keep test output clean
    if (isTestEnvironment) {
      return false;
    }

    return (
      LOG_LEVELS[level as keyof typeof LOG_LEVELS] >=
      LOG_LEVELS[this.logLevel as keyof typeof LOG_LEVELS]
    );
  }
}
