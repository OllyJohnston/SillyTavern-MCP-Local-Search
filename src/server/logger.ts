import pino from 'pino';

/**
 * Logger Service for MCP Local Search.
 *
 * Provides a structured logging interface using 'pino'.
 * - Detects TTY environments to automatically apply human-readable 'pino-pretty' output.
 * - Supports child loggers for module-specific telemetry and context.
 * - Configures production-ready JSON formatting when stdout is piped.
 */

// Detect if we are in a TTY (terminal) environment
const isTTY = process.stdout.isTTY;

const transport = isTTY
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    }
  : undefined;

// Create the base logger
const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
  },
  transport ? pino.transport(transport) : undefined,
);

/**
 * Standardized Logger Class for Dependency Injection.
 * Wraps a pino instance to provide a consistent logging API.
 */
export class Logger {
  private logger: pino.Logger;
  private prefix: string;

  /**
   * Creates a new Logger instance.
   * @param prefix Module name or prefix for categorizing logs (e.g., 'Search', 'Extraction').
   */
  constructor(prefix: string = 'MCPLocalSearch') {
    this.prefix = prefix;
    this.logger = baseLogger.child({ module: prefix });
  }

  /**
   * Logs an informational message.
   * @param msg The message string (supports placeholders).
   * @param args Optional arguments for interpolation or metadata objects.
   */
  info(msg: string, ...args: any[]) {
    this.logger.info(msg, ...args);
  }

  /**
   * Logs an error message with full stack trace if available.
   * @param msg The error description.
   * @param args Metadata objects including the error instance.
   */
  error(msg: string, ...args: any[]) {
    this.logger.error(msg, ...args);
  }

  /**
   * Logs a warning message.
   * @param msg The warning description.
   * @param args Metadata objects.
   */
  warn(msg: string, ...args: any[]) {
    this.logger.warn(msg, ...args);
  }

  /**
   * Logs a debug message (visible only if LOG_LEVEL=debug).
   * @param msg The debug information.
   * @param args Metadata objects.
   */
  debug(msg: string, ...args: any[]) {
    this.logger.debug(msg, ...args);
  }
}

// Export a default instance for non-DI usage if needed
export const logger = new Logger();
