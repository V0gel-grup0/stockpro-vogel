#!/bin/sh
set -eu

has_database_url=0
if [ -n "${DATABASE_URL:-}" ]; then
  has_database_url=1
elif [ -f .env.local ] && grep -q '^DATABASE_URL=' .env.local; then
  has_database_url=1
elif [ -f .env ] && grep -q '^DATABASE_URL=' .env; then
  has_database_url=1
fi

if [ "$has_database_url" -ne 1 ]; then
  echo "ERRO: DATABASE_URL nao encontrada."
  echo "Copie o .env.local do Neon para esta pasta e tente novamente."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "== Instalando dependencias =="
  npm install
fi

echo "== Prisma generate =="
npx prisma generate

echo "== Prisma validate =="
npx prisma validate

echo "== Next build =="
rm -rf .next
npm run build

echo "== Referencias ativas ao Supabase =="
ACTIVE_REFS="$(grep -RIn --include='*.ts' --include='*.tsx' 'supabase' app src 2>/dev/null \
  | grep -v -E 'backup|\.bak|src/lib/supabase-browser\.ts' || true)"
if [ -n "$ACTIVE_REFS" ]; then
  echo "$ACTIVE_REFS"
  echo "ATENCAO: ainda existem referencias ativas ao Supabase."
  exit 1
fi

echo "Nenhuma referencia ativa ao Supabase encontrada."

echo "== Git status =="
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git status --short
fi

echo "Validacao concluida."
