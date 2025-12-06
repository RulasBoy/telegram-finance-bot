import { Telegraf } from 'telegraf';
import { config } from 'dotenv';
import { logger, logWithContext } from '../utils/logger.js';
import { setupHandlers } from './handlers.js';

config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  logger.error('TELEGRAM_BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

export const bot = new Telegraf(botToken);

// Middleware de logging
bot.use((ctx, next) => {
  const userId = ctx.from?.id;
  const messageId = ctx.message && 'message_id' in ctx.message ? ctx.message.message_id : undefined;
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;

  logWithContext('debug', 'Message received', {
    userId,
    messageId,
    messageText,
  });

  return next();
});

// Configurar handlers
setupHandlers(bot);

// Manejo de errores
bot.catch((err, ctx) => {
  const userId = ctx.from?.id;
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorStack = err instanceof Error ? err.stack : undefined;
  
  logWithContext('error', 'Bot error occurred', {
    userId,
    error: errorMessage,
    stack: errorStack,
  });

  ctx.reply('Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.');
});

/**
 * Inicializar el bot
 */
export async function startBot(): Promise<void> {
  try {
    await bot.launch();
    logger.info('Telegram bot started successfully');
    
    // Graceful shutdown
    process.once('SIGINT', () => {
      logger.info('SIGINT received, shutting down bot gracefully');
      bot.stop('SIGINT');
    });
    
    process.once('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down bot gracefully');
      bot.stop('SIGTERM');
    });
  } catch (error) {
    logger.error({ error }, 'Error starting Telegram bot');
    throw error;
  }
}

/**
 * Detener el bot
 */
export async function stopBot(): Promise<void> {
  try {
    bot.stop();
    logger.info('Telegram bot stopped');
  } catch (error) {
    logger.error({ error }, 'Error stopping Telegram bot');
    throw error;
  }
}

