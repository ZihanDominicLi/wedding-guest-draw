#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
dump="$BACKUP_DIR/wedding-$timestamp.dump"
pg_dump --dbname "$DATABASE_URL" --format=custom --file "$dump"
sha256sum "$dump" > "$dump.sha256"
find "$UPLOAD_DIR" -maxdepth 1 -type f -printf '%f\n' 2>/dev/null > "$dump.uploads.txt" || true
printf '%s\n' "$dump"
