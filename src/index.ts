import { config } from 'dotenv';
import { logger } from './utils/logger.js';
import { startBot, stopBot } from './bot/index.js';
import { closeDatabase } from './services/database.js';
import { cleanupExpiredContexts } from './utils/conversation.js';

// Cargar variables de entorno
config();

/**
 * Verificar que todas las variables de entorno requeridas estén presentes
 */
function validateEnvironment(): void {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'ANTHROPIC_API_KEY',
    'DATABASE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error(
      { missing },
      'Missing required environment variables'
    );
    process.exit(1);
  }
}

/**
 * Función principal
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Telegram Finance Bot...');

    // Validar variables de entorno
    validateEnvironment();

    // Iniciar el bot
    await startBot();

    // Limpiar contextos expirados cada 5 minutos
    setInterval(() => {
      cleanupExpiredContexts();
    }, 5 * 60 * 1000);

    logger.info('Telegram Finance Bot is running');
  } catch (error) {
    logger.error({ error }, 'Fatal error starting bot');
    process.exit(1);
  }
}

// Manejar cierre graceful
process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await stopBot();
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await stopBot();
  await closeDatabase();
  process.exit(0);
});

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception');
  process.exit(1);
});

// Iniciar la aplicación
main().catch((error) => {
  logger.error({ error }, 'Error in main function');
  process.exit(1);
});

