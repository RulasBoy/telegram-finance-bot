import type { TransactionData, ValidationResult, Category } from '../models/transaction.js';

// Umbrales esperados por categoría (en MXN)
// Si el monto es más de 10x el umbral, se considera sospechoso
const EXPECTED_PRICE_RANGES: Record<Category, { min: number; max: number }> = {
  comida: { min: 20, max: 500 },
  entretenimiento: { min: 50, max: 2000 },
  electronica: { min: 500, max: 50000 },
  hogar: { min: 100, max: 10000 },
  transporte: { min: 10, max: 1000 },
  servicios: { min: 200, max: 5000 },
  salud: { min: 300, max: 10000 },
  educacion: { min: 500, max: 50000 },
  otro: { min: 10, max: 100000 },
};

/**
 * Validar si un precio es sospechosamente alto para su categoría
 */
export function validateSuspiciousPrice(
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

  const range = EXPECTED_PRICE_RANGES[transactionData.category];
  const maxExpected = range.max * 10; // 10x el máximo esperado

  if (transactionData.amount > maxExpected) {
    const suggestedAmount = transactionData.amount / 10;
    return {
      type: 'suspicious_price',
      message: `¿Un ${transactionData.description} de $${transactionData.amount}? ¿Quisiste decir $${suggestedAmount.toFixed(2)}?`,
      shouldBlock: false,
    };
  }

  // También verificar si es mucho menor al mínimo (posible error de decimal)
  const minExpected = range.min / 10;
  if (transactionData.amount < minExpected && transactionData.amount > 0) {
    const suggestedAmount = transactionData.amount * 10;
    return {
      type: 'suspicious_price',
      message: `¿Un ${transactionData.description} de $${transactionData.amount}? ¿Quisiste decir $${suggestedAmount.toFixed(2)}?`,
      shouldBlock: false,
    };
  }

  return null;
}

