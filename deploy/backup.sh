#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
base="wedding-$timestamp"
dump="$BACKUP_DIR/$base.dump"
uploads_archive="$BACKUP_DIR/$base.uploads.tar.gz"
pg_dump --dbname "$DATABASE_URL" --format=custom --file "$dump"
tar -C "$UPLOAD_DIR" -czf "$uploads_archive" .
(
  cd "$BACKUP_DIR"
  sha256sum "$base.dump" "$base.uploads.tar.gz" > "$base.sha256"
)
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'wedding-*' \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete
printf '%s\n%s\n' "$dump" "$uploads_archive"
