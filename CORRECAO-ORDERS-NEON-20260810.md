# Correção Orders x Neon — 2026-08-10

A tabela `orders` foi alinhada ao schema real introspectado do Neon.

Removidos do mapeamento Prisma de `orders` porque **não existem no banco atual**:
- `sale_code`
- `item_kind`
- `invoice_status`
- `invoice_number`
- `invoice_url`
- `invoice_provider`

A UI agora deriva o código de venda de `order_number` (`PV-000001`, etc.) e usa `conta_azul_status` como indicador de NF/Conta Azul.

Nenhum `db push` ou migration automática deve ser executado.
