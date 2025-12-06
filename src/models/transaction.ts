/**
 * Tipos TypeScript para el sistema de transacciones financieras
 */

export type TransactionType = 'ingreso' | 'gasto';

export type PaymentMethod = 'efectivo' | 'tarjeta_credito' | 'tarjeta_debito' | 'transferencia' | null;

export type Category = 
  | 'comida'
  | 'entretenimiento'
  | 'electronica'
  | 'hogar'
  | 'transporte'
  | 'servicios'
  | 'salud'
  | 'educacion'
  | 'otro';

export type ValidationType = 'duplicate' | 'high_amount' | 'suspicious_price';

export type ConversationStateType = 'normal' | 'awaiting_confirmation' | 'awaiting_correction';

/**
 * Respuesta estructurada de Claude API
 */
export interface TransactionData {
  transaction_type: TransactionType;
  amount: number;
  currency: string;
  description: string;
  category: Category;
  payment_method: PaymentMethod;
  confidence: number;
  needs_clarification: boolean;
  clarification_question?: string | null;
  validation_alerts?: ValidationAlert[];
}

export interface ValidationAlert {
  type: ValidationType;
  message: string;
}

/**
 * Modelo de transacción en la base de datos
 */
export interface Transaction {
  id: number;
  user_id: number;
  message_text: string;
  transaction_type: TransactionType;
  amount: number;
  currency: string;
  category: Category | null;
  description: string | null;
  payment_method: PaymentMethod;
  tags: string[] | null;
  created_at: Date;
  processed_at: Date;
}

/**
 * Resultado de una validación
 */
export interface ValidationResult {
  type: ValidationType;
  message: string;
  shouldBlock: boolean;
}

/**
 * Estado del contexto conversacional de un usuario
 */
export interface ConversationState {
  state: ConversationStateType;
  pendingTransaction?: TransactionData;
  pendingValidationId?: number;
  lastActivity: Date;
}

/**
 * Modelo de validación pendiente en la base de datos
 */
export interface PendingValidation {
  id: number;
  user_id: number;
  transaction_data: TransactionData;
  validation_type: ValidationType;
  message_id?: number;
  created_at: Date;
  resolved: boolean;
}

/**
 * Contexto para enviar a Claude cuando hay una conversación en curso
 */
export interface ConversationContext {
  previousMessage?: string;
  pendingValidation?: {
    type: ValidationType;
    transaction: TransactionData;
  };
  userCorrection?: {
    field: string;
    value: string;
  };
}

