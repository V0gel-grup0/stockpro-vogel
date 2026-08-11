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
  echo "Copie o .env.local do Neon para esta pasta e execute novamente."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "== Instalando dependencias =="
  npm install
fi

echo "== Iniciando StockPro =="
npm run dev
