# StockPro Vogel - migracao Prisma

Data: 2026-08-10

## Estado do pacote

O codigo ativo foi migrado para APIs Next.js + Prisma nos fluxos que ainda acessavam Supabase: Dashboard, Pedidos, Movimentacoes, entrada por NF, saida por pedido, Montagens, Equipamentos Montados, Componentes auxiliares, Relatorios, Meu Perfil e APIs administrativas restantes.

As operacoes compostas de estoque usam transacoes Prisma sempre que precisam atualizar mais de uma tabela.

## Importante sobre o banco Neon

O banco Neon possui estruturas legadas que nao devem ser apagadas apenas para alinhar o banco ao schema local. Portanto nao use `prisma db push` ou `prisma migrate dev` neste pacote.

## Ambiente

Coloque na raiz somente o `.env.local` usado pelo Neon. O Prisma CLI agora carrega `.env.local` automaticamente.

O projeto tambem regenera o Prisma Client automaticamente antes de `npm run dev` e `npm run build`, evitando o uso acidental de um Client antigo.

## Primeiro teste

Depois de extrair o projeto e colocar `.env.local`:

```bash
npm install
bash VALIDAR-MIGRACAO.sh
```

Se a validacao passar:

```bash
npm run dev
```

## Testes funcionais sugeridos

1. Login e perfil.
2. Dashboard.
3. Produtos, Clientes e Fornecedores.
4. Componentes, divisao por equipamento, componentes padrao e unificacao.
5. Equipamentos Montados.
6. Montagem e baixa de componentes.
7. Pedidos.
8. Movimentacao manual.
9. Entrada por NF.
10. Saida por pedido.
11. Relatorios.
12. Meu Perfil.

Veja tambem `CORRECOES-TESTE-20260810.md`.
