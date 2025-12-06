import type { TransactionData, ValidationResult } from '../models/transaction.js';

const HIGH_AMOUNT_THRESHOLD = parseFloat(
  process.env.HIGH_AMOUNT_THRESHOLD || '5000'
);

/**
 * Validar si un monto es excepcionalmente grande y requiere confirmación
 */
export function validateHighAmount(
  transactionData: TransactionData
): ValidationResult | null {
  // Solo validar gastos
  if (transactionData.transaction_type !== 'gasto') {
    return null;
  }

  // Solo validar MXN por ahora
  if (transactionData.currency !== 'MXN') {
    return null;
  }

  if (transactionData.amount >= HIGH_AMOUNT_THRESHOLD) {
    return {
      type: 'high_amount',
      message: `Vas a registrar un gasto de $${transactionData.amount} ${transactionData.currency} (${transactionData.description}). ¿Es correcto?`,
      shouldBlock: false, // No bloquear, solo pedir confirmación
    };
  }

  return null;
}

/**
 * Ejecutar todas las validaciones de monto
 */
export function validateAmount(transactionData: TransactionData): ValidationResult[] {
  const results: ValidationResult[] = [];

  const highAmountResult = validateHighAmount(transactionData);
  if (highAmountResult) {
    results.push(highAmountResult);
  }

  return results;
}

