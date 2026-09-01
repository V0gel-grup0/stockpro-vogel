BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS representative_company TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS representative_region TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS representative_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reference_month DATE NOT NULL,
  equipment_target INTEGER NOT NULL DEFAULT 0 CHECK (equipment_target >= 0),
  revenue_target NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (revenue_target >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT representative_goals_month_start_check
    CHECK (reference_month = date_trunc('month', reference_month)::date),
  CONSTRAINT representative_goals_representative_month_key
    UNIQUE (representative_id, reference_month)
);

CREATE TABLE IF NOT EXISTS representative_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  purchase_date DATE NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('produto', 'equipamento')),
  product_id UUID,
  item_name TEXT NOT NULL CHECK (length(trim(item_name)) > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
  shipping_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (shipping_value >= 0),
  total_value NUMERIC(14,2) NOT NULL CHECK (total_value >= 0),
  payment_terms TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmada', 'cancelada', 'concluida')),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT representative_purchases_values_check
    CHECK (subtotal = round(quantity * unit_price, 2) AND total_value = subtotal + shipping_value)
);

CREATE TABLE IF NOT EXISTS representative_receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  purchase_id UUID NOT NULL REFERENCES representative_purchases(id) ON DELETE RESTRICT,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  due_date DATE NOT NULL,
  original_amount NUMERIC(14,2) NOT NULL CHECK (original_amount >= 0),
  received_amount NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (received_amount >= 0 AND received_amount <= original_amount),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'pago', 'vencido', 'parcialmente_pago')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT representative_receivables_purchase_installment_key
    UNIQUE (purchase_id, installment_number)
);

CREATE TABLE IF NOT EXISTS representative_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  receivable_id UUID NOT NULL REFERENCES representative_receivables(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (length(trim(payment_method)) > 0),
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS representative_collection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  receivable_id UUID REFERENCES representative_receivables(id) ON DELETE RESTRICT,
  contact_date TIMESTAMPTZ NOT NULL,
  contact_type TEXT NOT NULL
    CHECK (contact_type IN ('whatsapp', 'ligacao', 'email', 'outro')),
  notes TEXT NOT NULL CHECK (length(trim(notes)) > 0),
  payment_promise TEXT NOT NULL DEFAULT '',
  promised_date DATE,
  next_contact_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS representative_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  contract_number TEXT NOT NULL CHECK (length(trim(contract_number)) > 0),
  contract_type TEXT NOT NULL CHECK (length(trim(contract_type)) > 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  exclusive BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('rascunho', 'ativo', 'vencido', 'encerrado')),
  notes TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  file_data BYTEA,
  file_size INTEGER CHECK (file_size IS NULL OR (file_size > 0 AND file_size <= 4000000)),
  mime_type TEXT CHECK (mime_type IS NULL OR mime_type = 'application/pdf'),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT representative_contracts_dates_check CHECK (end_date >= start_date),
  CONSTRAINT representative_contracts_representative_number_key
    UNIQUE (representative_id, contract_number)
);

CREATE TABLE IF NOT EXISTS representative_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  purchase_id UUID REFERENCES representative_purchases(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL CHECK (length(trim(invoice_number)) > 0),
  issued_at DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  notes TEXT NOT NULL DEFAULT '',
  pdf_file_name TEXT,
  pdf_file_data BYTEA,
  pdf_file_size INTEGER CHECK (pdf_file_size IS NULL OR (pdf_file_size > 0 AND pdf_file_size <= 4000000)),
  xml_file_name TEXT,
  xml_file_data BYTEA,
  xml_file_size INTEGER CHECK (xml_file_size IS NULL OR (xml_file_size > 0 AND xml_file_size <= 4000000)),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT representative_invoices_representative_number_key
    UNIQUE (representative_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS representative_goals_reference_month_idx
  ON representative_goals(reference_month);
CREATE INDEX IF NOT EXISTS representative_purchases_representative_date_idx
  ON representative_purchases(representative_id, purchase_date);
CREATE INDEX IF NOT EXISTS representative_purchases_product_id_idx
  ON representative_purchases(product_id);
CREATE INDEX IF NOT EXISTS representative_receivables_representative_due_idx
  ON representative_receivables(representative_id, due_date);
CREATE INDEX IF NOT EXISTS representative_receivables_status_idx
  ON representative_receivables(status);
CREATE INDEX IF NOT EXISTS representative_payments_representative_date_idx
  ON representative_payments(representative_id, payment_date);
CREATE INDEX IF NOT EXISTS representative_payments_receivable_id_idx
  ON representative_payments(receivable_id);
CREATE INDEX IF NOT EXISTS representative_collections_representative_contact_idx
  ON representative_collection_history(representative_id, contact_date);
CREATE INDEX IF NOT EXISTS representative_collections_receivable_id_idx
  ON representative_collection_history(receivable_id);
CREATE INDEX IF NOT EXISTS representative_collections_next_contact_idx
  ON representative_collection_history(next_contact_at);
CREATE INDEX IF NOT EXISTS representative_contracts_representative_end_idx
  ON representative_contracts(representative_id, end_date);
CREATE INDEX IF NOT EXISTS representative_invoices_representative_issued_idx
  ON representative_invoices(representative_id, issued_at);
CREATE INDEX IF NOT EXISTS representative_invoices_purchase_id_idx
  ON representative_invoices(purchase_id);

COMMIT;
