import { logger } from '../utils/logger.js';
import { findSimilarTransactions } from '../services/database.js';
import type { TransactionData, ValidationResult } from '../models/transaction.js';

const DEFAULT_TIME_WINDOW_MINUTES = parseInt(
  process.env.DUPLICATE_TIME_WINDOW_MINUTES || '30',
  10
);

/**
 * Validar si una transacción es un posible duplicado
 */
export async function validateDuplicate(
  userId: number,
  transactionData: TransactionData
): Promise<ValidationResult | null> {
  try {
    const similar = await findSimilarTransactions(
      userId,
      transactionData.amount,
      transactionData.description,
      DEFAULT_TIME_WINDOW_MINUTES
    );

    if (similar.length > 0) {
      const mostRecent = similar[0];
      const minutesAgo = Math.floor(
        (Date.now() - new Date(mostRecent.created_at).getTime()) / 60000
      );

      return {
        type: 'duplicate',
        message: `Ya registraste un gasto similar hace ${minutesAgo} minutos: ${mostRecent.description} por $${mostRecent.amount} ${transactionData.currency}. ¿Es el mismo?`,
        shouldBlock: false, // No bloquear, solo alertar
      };
    }

    return null;
  } catch (error) {
    logger.error({ error, userId }, 'Error validating duplicate');
    return null; // En caso de error, no bloquear
  }
}

