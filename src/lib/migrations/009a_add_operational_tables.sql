ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT 'no_interest' CHECK (type IN ('no_interest', 'interest')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    interest_rate NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
    payment_day INTEGER NOT NULL DEFAULT 1 CHECK (payment_day BETWEEN 1 AND 31),
    payment_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (payment_amount >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_id UUID NOT NULL REFERENCES credits(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('payment', 'addition')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_transactions_credit_date_idx
    ON credit_transactions (credit_id, transaction_date);
