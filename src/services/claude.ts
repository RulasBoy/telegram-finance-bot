import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type {
  TransactionData,
  ConversationContext,
} from '../models/transaction.js';

config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Schema de validación para la respuesta de Claude
const TransactionDataSchema = z.object({
  transaction_type: z.enum(['ingreso', 'gasto']),
  amount: z.number().positive(),
  currency: z.string().length(3).default('MXN'),
  description: z.string().min(1),
  category: z.enum([
    'comida',
    'entretenimiento',
    'electronica',
    'hogar',
    'transporte',
    'servicios',
    'salud',
    'educacion',
    'otro',
  ]),
  payment_method: z
    .enum(['efectivo', 'tarjeta_credito', 'tarjeta_debito', 'transferencia'])
    .nullable(),
  confidence: z.number().min(0).max(100),
  needs_clarification: z.boolean(),
  clarification_question: z.string().nullable().optional(),
  validation_alerts: z
    .array(
      z.object({
        type: z.enum(['duplicate', 'high_amount', 'suspicious_price']),
        message: z.string(),
      })
    )
    .optional(),
});

/**
 * Construir el prompt para Claude
 */
function buildPrompt(
  message: string,
  context?: ConversationContext
): string {
  let prompt = `Eres un asistente experto en extraer información financiera de mensajes en lenguaje natural en español.

Tu tarea es analizar el mensaje del usuario y extraer los siguientes datos:
- Tipo de transacción: "ingreso" o "gasto" (inferido del contexto)
- Monto: cantidad numérica
- Moneda: código de 3 letras (por defecto "MXN" si no se especifica)
- Descripción: texto limpio del producto/servicio
- Categoría: una de estas opciones: comida, entretenimiento, electronica, hogar, transporte, servicios, salud, educacion, otro
- Método de pago: efectivo, tarjeta_credito, tarjeta_debito, transferencia, o null si no se menciona

IMPORTANTE: Debes responder ÚNICAMENTE con un JSON válido, sin texto adicional antes o después.

Formato de respuesta esperado:
{
  "transaction_type": "gasto|ingreso",
  "amount": 28.00,
  "currency": "MXN",
  "description": "Burrito de la esquina",
  "category": "comida",
  "payment_method": "efectivo|tarjeta_credito|tarjeta_debito|transferencia|null",
  "confidence": 85,
  "needs_clarification": false,
  "clarification_question": null,
  "validation_alerts": []
}

Ejemplos de mensajes y respuestas:

Mensaje: "Compré un burrito de la esquina de 28 pesos"
Respuesta: {"transaction_type":"gasto","amount":28,"currency":"MXN","description":"Burrito de la esquina","category":"comida","payment_method":null,"confidence":95,"needs_clarification":false,"clarification_question":null,"validation_alerts":[]}

Mensaje: "Pagué 500 pesos de luz con tarjeta de crédito"
Respuesta: {"transaction_type":"gasto","amount":500,"currency":"MXN","description":"Luz","category":"servicios","payment_method":"tarjeta_credito","confidence":98,"needs_clarification":false,"clarification_question":null,"validation_alerts":[]}

Mensaje: "Recibí 5000 pesos de mi trabajo"
Respuesta: {"transaction_type":"ingreso","amount":5000,"currency":"MXN","description":"Trabajo","category":"otro","payment_method":"transferencia","confidence":90,"needs_clarification":false,"clarification_question":null,"validation_alerts":[]}

Mensaje: "Gasté 150 en el Uber"
Respuesta: {"transaction_type":"gasto","amount":150,"currency":"MXN","description":"Uber","category":"transporte","payment_method":null,"confidence":92,"needs_clarification":false,"clarification_question":null,"validation_alerts":[]}

`;

  if (context?.pendingValidation) {
    prompt += `\nCONTEXTO: El usuario está respondiendo a una validación pendiente de tipo "${context.pendingValidation.type}". La transacción propuesta es: ${JSON.stringify(context.pendingValidation.transaction)}.`;
  }

  if (context?.userCorrection) {
    prompt += `\nCORRECCIÓN: El usuario corrigió el campo "${context.userCorrection.field}" con el valor "${context.userCorrection.value}".`;
  }

  prompt += `\n\nMensaje del usuario: "${message}"\n\nResponde con el JSON:`;

  return prompt;
}

/**
 * Extraer información de transacción del mensaje usando Claude API
 */
export async function extractTransaction(
  message: string,
  context?: ConversationContext
): Promise<TransactionData> {
  const prompt = buildPrompt(message, context);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extraer el contenido de la respuesta
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    let jsonText = content.text.trim();

    // Limpiar el texto si tiene markdown code blocks
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    // Parsear y validar el JSON
    const parsed = JSON.parse(jsonText);
    const validated = TransactionDataSchema.parse(parsed);

    logger.debug(
      { message, confidence: validated.confidence },
      'Transaction extracted from message'
    );

    return validated as TransactionData;
  } catch (error) {
    logger.error({ error, message }, 'Error extracting transaction from Claude');
    
    if (error instanceof z.ZodError) {
      logger.error({ errors: error.errors }, 'Validation errors in Claude response');
      throw new Error(`Invalid response format from Claude: ${error.message}`);
    }
    
    throw error;
  }
}

