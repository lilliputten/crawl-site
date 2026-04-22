// src/lib/logger.ts

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ANSI color codes for console output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m', // For errors
  yellow: '\x1b[33m', // For warnings (closest to orange in ANSI)
  blue: '\x1b[34m', // For info
  cyan: '\x1b[36m', // For debug
};

// Check if we're in a test environment
const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  typeof jest !== 'undefined' ||
  process.env.JEST_WORKER_ID !== undefined;

export class Logger {
  private logLevel: string;
  private noColor: boolean;

  constructor(logLevel: string = 'info', noColor: boolean = false) {
    this.logLevel = logLevel;
    this.noColor = noColor;
  }

  /**
   * Update logger settings dynamically
   */
  configure(options: { logLevel?: string; noColor?: boolean }): void {
    if (options.logLevel !== undefined) {
      this.logLevel = options.logLevel;
    }
    if (options.noColor !== undefined) {
      this.noColor = options.noColor;
    }
  }

  /**
   * Check if colors should be used
   */
  private shouldUseColors(): boolean {
    // Disable colors if noColor is set or NO_COLOR env var is set
    if (this.noColor) {
      return false;
    }

    // Disable in test environment
    if (isTestEnvironment) {
      return false;
    }

    // Only use colors if stdout is a TTY
    return process.stdout.isTTY === true;
  }

  debug(...args: any[]): void {
    if (this.shouldLog('debug')) {
      const prefix = this.shouldUseColors() ? `${COLORS.cyan}[DEBUG]${COLORS.reset}` : '[DEBUG]';
      console.log(prefix, ...args);
    }
  }

  info(...args: any[]): void {
    if (this.shouldLog('info')) {
      const prefix = this.shouldUseColors() ? `${COLORS.blue}[INFO]${COLORS.reset}` : '[INFO]';
      console.info(prefix, ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.shouldLog('warn')) {
      const prefix = this.shouldUseColors() ? `${COLORS.yellow}[WARN]${COLORS.reset}` : '[WARN]';
      console.warn(prefix, ...args);
    }
  }

  error(...args: any[]): void {
    if (this.shouldLog('error')) {
      const prefix = this.shouldUseColors() ? `${COLORS.red}[ERROR]${COLORS.reset}` : '[ERROR]';
      console.error(prefix, ...args);
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
