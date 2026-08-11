# Correcao Movimentacoes x Pedidos - 2026-08-10

Remove duas leituras de `orders.item_kind`, campo que nao existe na tabela real `orders` do Neon.

Alteracoes:
- `app/api/movements/route.ts`: usa apenas `order.item_type` para decidir o tipo do item do pedido.
- `src/components/StockProApp.tsx`: ao editar pedido, usa apenas `o.item_type`.

Os usos de `item_kind` pertencentes a NF/movements foram mantidos, pois sao campos de outro fluxo/modelo.

Nao executar `prisma db push` ou `prisma migrate dev`.
