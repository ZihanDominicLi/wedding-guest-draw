#!/usr/bin/env bash

release_id_from_git() {
  local root=${1:-.}
  local commit timestamp
  commit=$(git -C "$root" rev-parse --short=12 HEAD)
  timestamp=$(date -u +%Y%m%d%H%M%S)
  printf 'release-%s-%s\n' "$commit" "$timestamp"
}

compose_args() {
  local files=${1:-docker-compose.yml}
  local file
  for file in $files; do
    printf '%s\n%s\n' '-f' "$file"
  done
}

validate_release_id() {
  [[ "$1" =~ ^[a-zA-Z0-9._-]+$ ]]
}

require_clean_worktree() {
  local root=${1:-.}
  if [[ "${ALLOW_DIRTY:-0}" == "1" ]]; then
    return 0
  fi
  if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
    printf '工作树有未提交变更；如需发布当前工作树，请设置 ALLOW_DIRTY=1。\n' >&2
    return 1
  fi
}
