-- StockPro Vogel - itens de pedido
-- Patch estritamente aditivo e revisável.
-- Cria somente order_items, constraints e índices.
-- Não contém DROP, DELETE, dados, credenciais ou alterações destrutivas.
-- NÃO executar em Production sem autorização e revisão explícitas.

BEGIN;

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  source_quote_item_id UUID UNIQUE,
  item_type TEXT NOT NULL,
  product_id UUID,
  item_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  discount_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT order_items_source_quote_item_id_fkey FOREIGN KEY (source_quote_item_id) REFERENCES quote_items(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT order_items_type_check CHECK (item_type IN ('product', 'equipment', 'custom')),
  CONSTRAINT order_items_values_check CHECK (quantity > 0 AND unit_price >= 0 AND discount_value >= 0 AND total_value >= 0)
);

CREATE INDEX order_items_order_id_idx ON order_items(order_id);
CREATE INDEX order_items_product_id_idx ON order_items(product_id);

COMMIT;
