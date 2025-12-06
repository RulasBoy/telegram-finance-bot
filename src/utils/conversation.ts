import type {
  ConversationState,
  ConversationStateType,
  TransactionData,
} from '../models/transaction.js';

// Almacenar contexto en memoria (Map<userId, ConversationState>)
const conversationContexts = new Map<number, ConversationState>();

// Tiempo de expiración del contexto (5 minutos)
const CONTEXT_EXPIRATION_MS = 5 * 60 * 1000;

/**
 * Obtener el estado de conversación de un usuario
 */
export function getConversationState(userId: number): ConversationState | null {
  const state = conversationContexts.get(userId);

  if (!state) {
    return null;
  }

  // Verificar si el contexto expiró
  const now = new Date();
  const timeSinceLastActivity = now.getTime() - state.lastActivity.getTime();

  if (timeSinceLastActivity > CONTEXT_EXPIRATION_MS) {
    conversationContexts.delete(userId);
    return null;
  }

  return state;
}

/**
 * Establecer el estado de conversación de un usuario
 */
export function setConversationState(
  userId: number,
  state: ConversationStateType,
  pendingTransaction?: TransactionData,
  pendingValidationId?: number
): void {
  conversationContexts.set(userId, {
    state,
    pendingTransaction,
    pendingValidationId,
    lastActivity: new Date(),
  });
}

/**
 * Limpiar el estado de conversación de un usuario
 */
export function clearConversationState(userId: number): void {
  conversationContexts.delete(userId);
}

/**
 * Actualizar la última actividad de un usuario
 */
export function updateLastActivity(userId: number): void {
  const state = conversationContexts.get(userId);
  if (state) {
    state.lastActivity = new Date();
  }
}

/**
 * Procesar respuesta contextual del usuario
 * Retorna true si se procesó como respuesta contextual, false si es un mensaje nuevo
 */
export function processContextualResponse(
  userId: number,
  message: string
): {
  isContextual: boolean;
  action?: 'confirm' | 'correct' | 'add_info';
  field?: string;
  value?: string;
} {
  const state = getConversationState(userId);

  if (!state || state.state === 'normal') {
    return { isContextual: false };
  }

  const lowerMessage = message.toLowerCase().trim();

  // Respuestas de confirmación
  if (
    lowerMessage === 'sí' ||
    lowerMessage === 'si' ||
    lowerMessage === 'yes' ||
    lowerMessage === 'correcto' ||
    lowerMessage === 'ok' ||
    lowerMessage === 'confirmar' ||
    lowerMessage === 'confirmo'
  ) {
    return { isContextual: true, action: 'confirm' };
  }

  // Respuestas de cancelación
  if (
    lowerMessage === 'no' ||
    lowerMessage === 'cancelar' ||
    lowerMessage === 'cancel'
  ) {
    clearConversationState(userId);
    return { isContextual: true, action: 'confirm' }; // Tratarlo como confirmación negativa
  }

  // Detectar correcciones de monto (ej: "Era 30, no 28")
  const correctionMatch = lowerMessage.match(
    /(?:era|es|eran|son)\s+(\d+(?:\.\d+)?)\s*(?:,|\.|\s+no\s+)(\d+(?:\.\d+)?)/
  );
  if (correctionMatch) {
    const newAmount = parseFloat(correctionMatch[1]);
    return {
      isContextual: true,
      action: 'correct',
      field: 'amount',
      value: newAmount.toString(),
    };
  }

  // Detectar agregar método de pago
  if (
    lowerMessage.includes('tarjeta') ||
    lowerMessage.includes('efectivo') ||
    lowerMessage.includes('transferencia')
  ) {
    let paymentMethod = null;
    if (lowerMessage.includes('tarjeta de crédito') || lowerMessage.includes('tarjeta credito')) {
      paymentMethod = 'tarjeta_credito';
    } else if (lowerMessage.includes('tarjeta de débito') || lowerMessage.includes('tarjeta debito')) {
      paymentMethod = 'tarjeta_debito';
    } else if (lowerMessage.includes('efectivo')) {
      paymentMethod = 'efectivo';
    } else if (lowerMessage.includes('transferencia')) {
      paymentMethod = 'transferencia';
    } else if (lowerMessage.includes('tarjeta')) {
      paymentMethod = 'tarjeta_credito'; // Default a crédito si solo dice "tarjeta"
    }

    if (paymentMethod) {
      return {
        isContextual: true,
        action: 'add_info',
        field: 'payment_method',
        value: paymentMethod,
      };
    }
  }

  // Si no se reconoce como respuesta contextual, tratar como mensaje nuevo
  return { isContextual: false };
}

/**
 * Limpiar contextos expirados (llamar periódicamente)
 */
export function cleanupExpiredContexts(): void {
  const now = new Date();
  for (const [userId, state] of conversationContexts.entries()) {
    const timeSinceLastActivity = now.getTime() - state.lastActivity.getTime();
    if (timeSinceLastActivity > CONTEXT_EXPIRATION_MS) {
      conversationContexts.delete(userId);
    }
  }
}

