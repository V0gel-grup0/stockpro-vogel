BEGIN;

CREATE TABLE IF NOT EXISTS installation_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID UNIQUE REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  order_id UUID UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  probable_date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT installation_forecasts_has_reference CHECK (
    opportunity_id IS NOT NULL OR order_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS installation_forecasts_probable_date_idx
  ON installation_forecasts(probable_date);

COMMIT;
