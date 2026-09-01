CREATE TABLE IF NOT EXISTS order_nf_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_data BYTEA NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 4000000),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_nf_attachments_uploaded_by_idx
  ON order_nf_attachments(uploaded_by);
