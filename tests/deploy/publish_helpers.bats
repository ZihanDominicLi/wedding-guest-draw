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

fake_bin=$(mktemp -d)
fake_log="$fake_bin/commands.log"
cat > "$fake_bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
printf '%s\n' "docker $*" >> "$FAKE_LOG"
case "${1:-}" in
  info) exit 0 ;;
  buildx) [[ "${2:-}" == "version" ]] && exit 0 ;;
  build) [[ "${2:-}" == "--help" ]] && printf '%s\n' '--platform' && exit 0 ;;
esac
exit 0
FAKE_DOCKER
cat > "$fake_bin/ssh" <<'FAKE_SSH'
#!/usr/bin/env bash
printf '%s\n' "ssh $*" >> "$FAKE_LOG"
cat >/dev/null
exit 0
FAKE_SSH
chmod +x "$fake_bin/docker" "$fake_bin/ssh"
FAKE_LOG="$fake_log" PATH="$fake_bin:/usr/bin:/bin" ALLOW_DIRTY=1 DEPLOY_HOST=test.invalid DEPLOY_USER=test DEPLOY_DIR=/tmp/wedding-test \
  "$ROOT_DIR/deploy/publish.sh" dry-run >/dev/null
if grep -Eq 'docker (build |save )' "$fake_log"; then
  fail 'dry-run invoked image build or save'
fi
rm -rf "$fake_bin"

no_builder_bin=$(mktemp -d)
no_builder_log="$no_builder_bin/commands.log"
cat > "$no_builder_bin/docker" <<'NO_BUILDER_DOCKER'
#!/usr/bin/env bash
printf '%s\n' "docker $*" >> "$FAKE_LOG"
if [[ "${1:-}" == "info" ]]; then exit 0; fi
if [[ "${1:-}" == "buildx" ]]; then exit 1; fi
if [[ "${1:-}" == "build" && "${2:-}" == "--help" ]]; then printf '%s\n' 'docker build help'; exit 0; fi
exit 0
NO_BUILDER_DOCKER
cat > "$no_builder_bin/ssh" <<'NO_BUILDER_SSH'
#!/usr/bin/env bash
printf '%s\n' "ssh $*" >> "$FAKE_LOG"
cat >/dev/null
exit 0
NO_BUILDER_SSH
chmod +x "$no_builder_bin/docker" "$no_builder_bin/ssh"
if FAKE_LOG="$no_builder_log" PATH="$no_builder_bin:/usr/bin:/bin" ALLOW_DIRTY=1 \
  "$ROOT_DIR/deploy/publish.sh" dry-run >/dev/null 2>&1; then
  fail '没有跨平台构建能力时 dry-run 意外通过'
fi
if grep -q '^ssh ' "$no_builder_log" 2>/dev/null; then
  fail '本地构建器预检失败后仍连接了服务器'
fi
rm -rf "$no_builder_bin"

printf 'PASS: publish helper contract\n'
