import { Pool, QueryResult } from 'pg';
import { config } from 'dotenv';
import { logger } from '../utils/logger.js';
import type {
  Transaction,
  TransactionData,
  PendingValidation,
} from '../models/transaction.js';

config();

// Crear pool de conexiones
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Verificar conexión al inicializar
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

/**
 * Guardar una transacción en la base de datos
 */
export async function saveTransaction(
  userId: number,
  messageText: string,
  data: TransactionData
): Promise<Transaction> {
  const query = `
    INSERT INTO transactions (
      user_id, message_text, transaction_type, amount, currency,
      category, description, payment_method, tags, processed_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    RETURNING *
  `;

  const values = [
    userId,
    messageText,
    data.transaction_type,
    data.amount,
    data.currency,
    data.category,
    data.description,
    data.payment_method,
    null, // tags por ahora
  ];

  try {
    const result: QueryResult<Transaction> = await pool.query(query, values);
    logger.info(
      { userId, transactionId: result.rows[0].id },
      'Transaction saved successfully'
    );
    return result.rows[0];
  } catch (error) {
    logger.error({ error, userId }, 'Error saving transaction');
    throw error;
  }
}

/**
 * Buscar transacciones similares (para detección de duplicados)
 */
export async function findSimilarTransactions(
  userId: number,
  amount: number,
  description: string,
  timeWindowMinutes: number = 30
): Promise<Transaction[]> {
  const query = `
    SELECT * FROM find_similar_transactions($1, $2, $3, $4)
  `;

  try {
    const result: QueryResult<Transaction> = await pool.query(query, [
      userId,
      amount,
      description,
      timeWindowMinutes,
    ]);

    return result.rows;
  } catch (error) {
    logger.error({ error, userId }, 'Error finding similar transactions');
    throw error;
  }
}

/**
 * Obtener transacciones de un usuario con filtros opcionales
 */
export async function getUserTransactions(
  userId: number,
  filters?: {
    startDate?: Date;
    endDate?: Date;
    category?: string;
    transactionType?: 'ingreso' | 'gasto';
    limit?: number;
  }
): Promise<Transaction[]> {
  let query = 'SELECT * FROM transactions WHERE user_id = $1';
  const values: unknown[] = [userId];
  let paramIndex = 2;

  if (filters?.startDate) {
    query += ` AND created_at >= $${paramIndex}`;
    values.push(filters.startDate);
    paramIndex++;
  }

  if (filters?.endDate) {
    query += ` AND created_at <= $${paramIndex}`;
    values.push(filters.endDate);
    paramIndex++;
  }

  if (filters?.category) {
    query += ` AND category = $${paramIndex}`;
    values.push(filters.category);
    paramIndex++;
  }

  if (filters?.transactionType) {
    query += ` AND transaction_type = $${paramIndex}`;
    values.push(filters.transactionType);
    paramIndex++;
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ` LIMIT $${paramIndex}`;
    values.push(filters.limit);
  }

  try {
    const result: QueryResult<Transaction> = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error({ error, userId }, 'Error getting user transactions');
    throw error;
  }
}

/**
 * Guardar una validación pendiente
 */
export async function savePendingValidation(
  userId: number,
  transactionData: TransactionData,
  validationType: string,
  messageId?: number
): Promise<PendingValidation> {
  const query = `
    INSERT INTO pending_validations (
      user_id, transaction_data, validation_type, message_id
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  try {
    const result: QueryResult<PendingValidation> = await pool.query(query, [
      userId,
      JSON.stringify(transactionData),
      validationType,
      messageId || null,
    ]);

    logger.info(
      { userId, validationId: result.rows[0].id },
      'Pending validation saved'
    );
    return result.rows[0];
  } catch (error) {
    logger.error({ error, userId }, 'Error saving pending validation');
    throw error;
  }
}

/**
 * Resolver una validación pendiente
 */
export async function resolvePendingValidation(
  validationId: number
): Promise<void> {
  const query = `
    UPDATE pending_validations
    SET resolved = TRUE
    WHERE id = $1
  `;

  try {
    await pool.query(query, [validationId]);
    logger.info({ validationId }, 'Pending validation resolved');
  } catch (error) {
    logger.error({ error, validationId }, 'Error resolving pending validation');
    throw error;
  }
}

/**
 * Obtener validación pendiente por ID
 */
export async function getPendingValidation(
  validationId: number
): Promise<PendingValidation | null> {
  const query = `
    SELECT * FROM pending_validations
    WHERE id = $1 AND resolved = FALSE
  `;

  try {
    const result: QueryResult<PendingValidation> = await pool.query(query, [
      validationId,
    ]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error({ error, validationId }, 'Error getting pending validation');
    throw error;
  }
}

/**
 * Obtener validación pendiente activa de un usuario
 */
export async function getActivePendingValidation(
  userId: number
): Promise<PendingValidation | null> {
  const query = `
    SELECT * FROM pending_validations
    WHERE user_id = $1 AND resolved = FALSE
    ORDER BY created_at DESC
    LIMIT 1
  `;

  try {
    const result: QueryResult<PendingValidation> = await pool.query(query, [
      userId,
    ]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error({ error, userId }, 'Error getting active pending validation');
    throw error;
  }
}

/**
 * Cerrar todas las conexiones del pool
 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

