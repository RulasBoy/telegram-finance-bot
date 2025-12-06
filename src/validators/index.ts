import { validateDuplicate } from './duplicate.js';
import { validateSuspiciousPrice } from './price.js';
import { validateHighAmount } from './amount.js';
import type { TransactionData, ValidationResult } from '../models/transaction.js';

/**
 * Ejecutar todas las validaciones en una transacción
 */
export async function validateTransaction(
  userId: number,
  transactionData: TransactionData
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Validar duplicados (async)
  const duplicateResult = await validateDuplicate(userId, transactionData);
  if (duplicateResult) {
    results.push(duplicateResult);
  }

  // Validar precio sospechoso (sync)
  const priceResult = validateSuspiciousPrice(transactionData);
  if (priceResult) {
    results.push(priceResult);
  }

  // Validar monto alto (sync)
  const amountResult = validateHighAmount(transactionData);
  if (amountResult) {
    results.push(amountResult);
  }

  return results;
}

