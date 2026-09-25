#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HELPERS="$ROOT_DIR/deploy/publish_helpers.bash"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "expected [$2], got [$1]"; }
assert_contains() { [[ "$1" == *"$2"* ]] || fail "expected [$1] to contain [$2]"; }
assert_status() {
  local expected=$1; shift
  set +e
  "$@"
  local actual=$?
  set -e
  [[ "$actual" == "$expected" ]] || fail "expected exit $expected, got $actual";
}

[[ -f "$HELPERS" ]] || fail "missing deploy/publish_helpers.bash"
# shellcheck source=/dev/null
source "$HELPERS"

release=$(release_id_from_git)
assert_contains "$release" "$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
[[ "$release" =~ ^[a-zA-Z0-9._-]+$ ]] || fail "release id contains unsafe characters: $release"

compose_output=$(compose_args "docker-compose.yml docker-compose.tunnel.yml" | tr '\n' ' ')
assert_eq "$compose_output" "-f docker-compose.yml -f docker-compose.tunnel.yml "

assert_status 1 validate_release_id "bad release/id"
assert_status 0 validate_release_id "release-20260925.123456"

dirty_dir=$(mktemp -d)
trap 'rm -rf "$dirty_dir"' EXIT
git -C "$dirty_dir" init -q
git -C "$dirty_dir" config user.email test@example.com
git -C "$dirty_dir" config user.name Test
printf 'x\n' > "$dirty_dir/file"
git -C "$dirty_dir" add file
git -C "$dirty_dir" commit -qm initial
printf 'change\n' >> "$dirty_dir/file"
assert_status 1 require_clean_worktree "$dirty_dir"
ALLOW_DIRTY=1 assert_status 0 require_clean_worktree "$dirty_dir"

printf 'PASS: publish helper contract\n'
