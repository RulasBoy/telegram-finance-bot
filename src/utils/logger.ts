import pino from 'pino';
import { config } from 'dotenv';

config();

const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * Logger configurado con Pino
 * Output estructurado a consola con formato legible
 */
export const logger = pino({
  level: logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

/**
 * Helper para crear logs con contexto de usuario
 */
export function logWithContext(
  level: 'info' | 'error' | 'warn' | 'debug',
  message: string,
  context?: {
    userId?: number;
    messageId?: number;
    transactionId?: number;
    [key: string]: unknown;
  }
): void {
  const logData = {
    ...context,
    msg: message,
  };

  switch (level) {
    case 'error':
      logger.error(logData);
      break;
    case 'warn':
      logger.warn(logData);
      break;
    case 'debug':
      logger.debug(logData);
      break;
    default:
      logger.info(logData);
  }
}

