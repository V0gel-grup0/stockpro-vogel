# Correcoes de validacao - StockPro Vogel

Data: 2026-08-10

## Problema reproduzido a partir do teste no Mac

O `prisma generate` falhou porque o Prisma CLI carregava apenas `.env`, enquanto o projeto novo recebeu a conexao Neon em `.env.local`. Como a geracao falhava, o Next.js continuava usando o Prisma Client antigo e o TypeScript acusava campos/modelos novos como inexistentes, por exemplo `movements.order_id` e `mounted_equipments`.

## Correcoes aplicadas

- `prisma.config.ts` agora carrega `.env.local` primeiro e `.env` como fallback.
- `npm run dev` executa `prisma generate` automaticamente antes de iniciar o Next.js.
- `npm run build` executa `prisma generate` automaticamente antes do build.
- Foram adicionados scripts `prisma:generate` e `prisma:validate`.
- `/api/auth/profile` nao devolve mais `password_hash` ao navegador.
- Criacao de administrador foi padronizada para `bcryptjs` e alias `@/lib/prisma`.
- Exclusao de usuario agora desvincula com seguranca referencias em perfis, montagens, clientes, movimentacoes e pedidos antes da exclusao.
- A desvinculacao entre perfis foi corrigida para nao apagar responsaveis validos que nao apontavam para o usuario excluido.
- Exclusao de cliente preserva pedidos existentes, removendo apenas `client_id` antes da exclusao.
- `src/lib/prisma.ts` agora gera uma mensagem clara se `DATABASE_URL` estiver ausente.
- `VALIDAR-MIGRACAO.sh` verifica `DATABASE_URL` antes de iniciar os testes.

## Validacoes executadas neste pacote

- Todos os arquivos `.ts`/`.tsx` ativos foram analisados pelo parser TypeScript: zero erros de sintaxe.
- Todas as chamadas Prisma nas APIs foram comparadas com os modelos/campos do `schema.prisma`: zero campos de modelo desconhecidos encontrados.
- Todas as rotas `/api/...` chamadas pelo componente principal possuem um `route.ts` correspondente.
- Nenhuma referencia ativa ao cliente Supabase permanece no codigo principal; referencias restantes estao apenas em backups/arquivo legado.

## Limitacao do ambiente de preparacao

O ambiente de preparacao nao consegue baixar uma dependencia do npm (`zeptomatch`) por uma limitacao do registro interno. Por isso o build Next.js completo nao pode ser executado aqui com `node_modules` novos.

No Mac, o pacote foi preparado para resolver automaticamente o problema que ocorreu: com `.env.local` do Neon presente, `npm run build` e `npm run dev` regeneram o Prisma Client antes de executar.

## Nao executar

- `npx prisma db push`
- `npx prisma migrate dev`
- SQL destrutivo de `prisma migrate diff`
