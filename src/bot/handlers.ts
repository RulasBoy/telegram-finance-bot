import { Context } from 'telegraf';
import { logger, logWithContext } from '../utils/logger.js';
import { extractTransaction } from '../services/claude.js';
import {
  saveTransaction,
  savePendingValidation,
  resolvePendingValidation,
  getUserTransactions,
} from '../services/database.js';
import { validateTransaction } from '../validators/index.js';
import {
  getConversationState,
  setConversationState,
  clearConversationState,
  updateLastActivity,
  processContextualResponse,
} from '../utils/conversation.js';
import type { Telegraf } from 'telegraf';
import type { TransactionData } from '../models/transaction.js';

/**
 * Formatear una transacción para mostrar al usuario
 */
function formatTransaction(transaction: TransactionData): string {
  const typeEmoji = transaction.transaction_type === 'ingreso' ? '💰' : '💸';
  const paymentMethodText = transaction.payment_method
    ? ` (${transaction.payment_method})`
    : '';
  
  return `${typeEmoji} ${transaction.transaction_type.toUpperCase()}: $${transaction.amount} ${transaction.currency}\n` +
    `📝 ${transaction.description}\n` +
    `🏷️ ${transaction.category}${paymentMethodText}`;
}

/**
 * Obtener resumen básico de transacciones del mes
 */
async function getMonthlySummary(userId: number): Promise<string> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const transactions = await getUserTransactions(userId, {
    startDate: startOfMonth,
    endDate: now,
  });

  const gastos = transactions.filter(t => t.transaction_type === 'gasto');
  const ingresos = transactions.filter(t => t.transaction_type === 'ingreso');

  const totalGastos = gastos.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);
  const totalIngresos = ingresos.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

  return `📊 Resumen del mes:\n\n` +
    `💸 Gastos: $${totalGastos.toFixed(2)} MXN (${gastos.length} transacciones)\n` +
    `💰 Ingresos: $${totalIngresos.toFixed(2)} MXN (${ingresos.length} transacciones)\n` +
    `📈 Balance: $${(totalIngresos - totalGastos).toFixed(2)} MXN`;
}

/**
 * Configurar todos los handlers del bot
 */
export function setupHandlers(bot: Telegraf): void {
  // Comando /start
  bot.command('start', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    logWithContext('info', 'Start command received', { userId });

    await ctx.reply(
      '👋 ¡Hola! Soy tu bot de finanzas personales.\n\n' +
      'Puedes enviarme mensajes en lenguaje natural para registrar tus gastos e ingresos.\n\n' +
      'Ejemplos:\n' +
      '• "Compré un burrito de 28 pesos"\n' +
      '• "Pagué 500 pesos de luz con tarjeta"\n' +
      '• "Recibí 5000 pesos de mi trabajo"\n\n' +
      'Usa /help para ver más comandos.'
    );
  });

  // Comando /help
  bot.command('help', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    logWithContext('info', 'Help command received', { userId });

    await ctx.reply(
      '📚 Comandos disponibles:\n\n' +
      '/start - Iniciar el bot\n' +
      '/help - Mostrar esta ayuda\n' +
      '/resumen - Ver resumen del mes actual\n\n' +
      '💡 También puedes enviar mensajes en lenguaje natural para registrar transacciones.'
    );
  });

  // Comando /resumen
  bot.command('resumen', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    logWithContext('info', 'Resumen command received', { userId });

    try {
      const summary = await getMonthlySummary(userId);
      await ctx.reply(summary);
    } catch (error) {
      logWithContext('error', 'Error getting summary', { userId, error });
      await ctx.reply('Error al obtener el resumen. Por favor intenta más tarde.');
    }
  });

  // Handler principal de mensajes de texto
  bot.on('text', async (ctx: Context) => {
    const userId = ctx.from?.id;
    if (!ctx.message || !('text' in ctx.message)) return;
    const messageText = ctx.message.text;
    const messageId = ctx.message.message_id;

    if (!userId) return;

    updateLastActivity(userId);

    try {
      // Verificar si hay una respuesta contextual
      const contextualResponse = processContextualResponse(userId, messageText);

      if (contextualResponse.isContextual) {
        await handleContextualResponse(ctx, userId, contextualResponse);
        return;
      }

      // Procesar como mensaje nuevo
      await handleNewMessage(ctx, userId, messageText, messageId);
    } catch (error) {
      logWithContext('error', 'Error processing message', {
        userId,
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      await ctx.reply(
        'Ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo o reformula tu mensaje.'
      );
    }
  });
}

/**
 * Manejar respuesta contextual del usuario
 */
async function handleContextualResponse(
  ctx: Context,
  userId: number,
  response: {
    action?: 'confirm' | 'correct' | 'add_info';
    field?: string;
    value?: string;
  }
): Promise<void> {
  const state = getConversationState(userId);
  if (!state || !state.pendingTransaction) {
    clearConversationState(userId);
    await ctx.reply('No tengo ninguna transacción pendiente. ¿Qué quieres registrar?');
    return;
  }

  if (response.action === 'confirm') {
    // Confirmar y guardar la transacción
    const transaction = state.pendingTransaction;
    await saveTransaction(userId, 'Confirmed by user', transaction);

    if (state.pendingValidationId) {
      await resolvePendingValidation(state.pendingValidationId);
    }

    clearConversationState(userId);
    await ctx.reply(`✅ Transacción registrada:\n\n${formatTransaction(transaction)}`);
    return;
  }

  if (response.action === 'correct' && response.field && response.value) {
    // Corregir un campo
    const updatedTransaction = { ...state.pendingTransaction };
    
    if (response.field === 'amount') {
      updatedTransaction.amount = parseFloat(response.value);
    }

    // Re-extraer con el contexto de corrección
    const context = {
      userCorrection: {
        field: response.field,
        value: response.value,
      },
    };

    try {
      const corrected = await extractTransaction(
        `Corrección: ${response.field} = ${response.value}`,
        context
      );
      
      // Actualizar el estado
      setConversationState(
        userId,
        'awaiting_confirmation',
        corrected,
        state.pendingValidationId
      );

      await ctx.reply(
        `✅ Corrección aplicada. ¿Confirmas esta transacción?\n\n${formatTransaction(corrected)}`
      );
    } catch (error) {
      logger.error({ error, userId }, 'Error processing correction');
      await ctx.reply('Error al procesar la corrección. Por favor intenta de nuevo.');
    }
    return;
  }

  if (response.action === 'add_info' && response.field && response.value) {
    // Agregar información adicional
    const updatedTransaction = { ...state.pendingTransaction };
    
    if (response.field === 'payment_method') {
      updatedTransaction.payment_method = response.value as any;
    }

    setConversationState(
      userId,
      'awaiting_confirmation',
      updatedTransaction,
      state.pendingValidationId
    );

    await ctx.reply(
      `✅ Información agregada. ¿Confirmas esta transacción?\n\n${formatTransaction(updatedTransaction)}`
    );
    return;
  }
}

/**
 * Manejar mensaje nuevo del usuario
 */
async function handleNewMessage(
  ctx: Context,
  userId: number,
  messageText: string,
  messageId: number
): Promise<void> {
  // Extraer información con Claude
  let transactionData: TransactionData;
  try {
    transactionData = await extractTransaction(messageText);
  } catch (error) {
    logger.error({ error, userId, messageText }, 'Error extracting transaction');
    await ctx.reply(
      'No pude entender tu mensaje. Por favor intenta reformularlo.\n\n' +
      'Ejemplo: "Compré un burrito de 28 pesos"'
    );
    return;
  }

  // Ejecutar validaciones
  const validationResults = await validateTransaction(userId, transactionData);

  // Si hay validaciones que requieren confirmación
  if (validationResults.length > 0) {
    // Guardar validación pendiente
    const pendingValidation = await savePendingValidation(
      userId,
      transactionData,
      validationResults[0].type,
      messageId
    );

    // Establecer estado de conversación
    setConversationState(
      userId,
      'awaiting_confirmation',
      transactionData,
      pendingValidation.id
    );

    // Enviar mensaje con la validación
    const validationMessages = validationResults.map(v => v.message).join('\n\n');
    await ctx.reply(
      `⚠️ ${validationMessages}\n\n` +
      `Transacción propuesta:\n${formatTransaction(transactionData)}\n\n` +
      `Responde "sí" para confirmar o "no" para cancelar.`
    );
    return;
  }

  // Si no hay validaciones, guardar directamente
  try {
    const savedTransaction = await saveTransaction(userId, messageText, transactionData);
    logWithContext('info', 'Transaction saved', {
      userId,
      transactionId: savedTransaction.id,
    });

    await ctx.reply(`✅ Transacción registrada:\n\n${formatTransaction(transactionData)}`);
  } catch (error) {
    logger.error({ error, userId }, 'Error saving transaction');
    await ctx.reply('Error al guardar la transacción. Por favor intenta de nuevo.');
  }
}

