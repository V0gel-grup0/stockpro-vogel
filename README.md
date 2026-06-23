# StockPro Vogel - versão ampliada

Inclui:
- Dashboard como resumo geral.
- Menu lateral funcional com abrir/fechar.
- Produtos padrão de revenda: lâmpadas dimerizáveis, dimmer e soquetes E-27.
- Subcategorias de produtos.
- Produtos e componentes vinculáveis a fornecedores.
- Pedidos com botão de cadastro e gerenciamento de posição/status.
- Pedido com cliente, produto/equipamento e quantidade.
- Baixa automática de componente CeltPlus quando houver pedido de Celt5000 Plus.
- Cadastro público pela tela de login para representante, funcionário e técnico.
- Análise de cadastro para administrador, com quadro de permissões.
- Aprovação de representantes por ADM e vendedor responsável.
- Estrutura de integração Conta Azul para emissão de NF.

## Configuração
1. Copie `.env.example` para `.env.local`.
2. Preencha as chaves do Supabase.
3. Rode `database/schema.sql` no Supabase.
4. Execute `npm install` e `npm run dev`.

## Conta Azul
A API `/api/conta-azul/emitir-nf` está preparada para integração real. Para ativar, configure:
- CONTA_AZUL_CLIENT_ID
- CONTA_AZUL_CLIENT_SECRET
- CONTA_AZUL_REFRESH_TOKEN

Sem essas variáveis, o botão de NF informa que falta configuração.
