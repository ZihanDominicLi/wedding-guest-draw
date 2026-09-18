#!/bin/sh
set -eu

image="${1:-wedding-validation-app}"

user="$(docker run --rm --network none --entrypoint id "$image" -un)"
test "$user" = "node"

version="$(docker run --rm --network none --entrypoint pnpm "$image" --version)"
test "$version" = "9.15.9"

docker run --rm --network none \
  --entrypoint pnpm \
  -e DATABASE_URL=postgresql://wedding:test-password@db:5432/wedding \
  -e BETTER_AUTH_SECRET=test-secret-0123456789abcdefghijklmnop \
  -e BETTER_AUTH_URL=http://127.0.0.1 \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=test-password-123 \
  -e WEDDING_DOMAIN=localhost \
  "$image" exec tsx -e "import('@/lib/env')"
