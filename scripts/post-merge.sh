#!/bin/bash
if command -v pnpm &> /dev/null && [ -n "$DATABASE_URL" ]; then
  pnpm install --frozen-lockfile || true
  pnpm --filter db push || true
fi

