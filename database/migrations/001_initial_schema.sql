-- Tabla principal de transacciones
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL, -- Telegram user ID
    message_text TEXT NOT NULL, -- Mensaje original del usuario
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('ingreso', 'gasto')),
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    category VARCHAR(50),
    description TEXT,
    payment_method VARCHAR(50),
    tags TEXT[], -- Para futuras etiquetas personalizadas
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de validaciones/confirmaciones pendientes
CREATE TABLE pending_validations (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    transaction_data JSONB, -- Datos extraídos por Claude pendientes de confirmar
    validation_type VARCHAR(50), -- 'duplicate', 'high_amount', 'suspicious_price'
    message_id INTEGER, -- ID del mensaje de Telegram para responder
    created_at TIMESTAMP DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE
);

-- Índices para optimizar consultas
CREATE INDEX idx_transactions_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_pending_validations_user ON pending_validations(user_id, resolved);

-- Función helper para buscar transacciones similares (duplicados)
CREATE OR REPLACE FUNCTION find_similar_transactions(
    p_user_id BIGINT,
    p_amount DECIMAL,
    p_description TEXT,
    p_time_window_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
    id INTEGER,
    amount DECIMAL,
    description TEXT,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.amount,
        t.description,
        t.created_at
    FROM transactions t
    WHERE t.user_id = p_user_id
        AND t.created_at >= NOW() - (p_time_window_minutes || ' minutes')::INTERVAL
        AND ABS(t.amount - p_amount) < 0.01 -- Tolerancia para comparación de decimales
        AND (
            LOWER(t.description) LIKE '%' || LOWER(p_description) || '%'
            OR LOWER(p_description) LIKE '%' || LOWER(t.description) || '%'
        )
    ORDER BY t.created_at DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;

