#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

for file in "$ROOT_DIR/deploy/publish.sh" "$ROOT_DIR/deploy/publish_helpers.bash" "$ROOT_DIR/deploy/remote-publish.sh"; do
  [[ -x "$file" ]] || fail "部署脚本不可执行：$file"
  bash -n "$file" || fail "Shell 语法错误：$file"
done

grep -q -- '--no-build' "$ROOT_DIR/deploy/remote-publish.sh" || fail '远端发布缺少 --no-build'
grep -q -- '/api/health' "$ROOT_DIR/deploy/remote-publish.sh" || fail '远端发布缺少健康检查'
grep -q -- 'compose config --quiet' "$ROOT_DIR/deploy/remote-publish.sh" || fail '远端发布缺少 Compose 预检'
grep -q -- 'docker image rm' "$ROOT_DIR/deploy/remote-publish.sh" || fail '远端发布缺少旧回滚镜像清理'
grep -q -- 'ALLOW_CACHED_IMAGE' "$ROOT_DIR/deploy/publish.sh" || fail '发布器缺少显式缓存镜像应急开关'
grep -q -- 'zstd' "$ROOT_DIR/deploy/publish.sh" || fail '发布器缺少 zstd 传输优化'
grep -q -- 'zstd' "$ROOT_DIR/deploy/remote-publish.sh" || fail '远端接收器缺少 zstd 解压支持'
if grep -q -- 'mkdir.*DEPLOY_DIR' "$ROOT_DIR/deploy/publish.sh"; then
  fail '本地发布器会创建缺失的服务器项目目录'
fi

if grep -Eq 'docker compose[^\n]* (down|rm|build)|docker volume (rm|prune)' "$ROOT_DIR/deploy/publish.sh" "$ROOT_DIR/deploy/remote-publish.sh"; then
  fail '部署脚本包含会删除服务或数据卷的命令'
fi

grep -q -- './deploy/publish.sh' "$ROOT_DIR/docs/DEPLOYMENT.md" || fail '部署文档缺少一键发布命令'
grep -q -- './deploy/publish.sh rollback' "$ROOT_DIR/docs/DEPLOYMENT.md" || fail '部署文档缺少回滚命令'

fake_dir=$(mktemp -d)
trap 'rm -rf "$fake_dir"' EXIT
cat > "$fake_dir/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
printf '%s\n' "docker $*" >> "$FAKE_DOCKER_LOG"
if [[ "${1:-}" == "info" ]]; then exit 0; fi
if [[ "${1:-}" == "compose" && " $* " == *" config "* ]]; then exit 0; fi
if [[ "${1:-}" == "image" && "${2:-}" == "ls" ]]; then exit 0; fi
if [[ "${1:-}" == "compose" && " $* " == *" up "* ]]; then exit 0; fi
exit 0
FAKE_DOCKER
chmod +x "$fake_dir/docker"

missing_env="$fake_dir/missing-env"
mkdir -p "$missing_env"
printf 'services:\n' > "$missing_env/docker-compose.yml"
printf 'services:\n' > "$missing_env/docker-compose.tunnel.yml"
if FAKE_DOCKER_LOG="$fake_dir/docker.log" DEPLOY_DIR="$missing_env" PATH="$fake_dir:/usr/bin:/bin" \
  bash "$ROOT_DIR/deploy/remote-publish.sh" preflight >/dev/null 2>&1; then
  fail '缺少 .env 时远端预检意外通过'
fi
if grep -q 'docker load' "$fake_dir/docker.log" 2>/dev/null; then
  fail '缺少 .env 时远端尝试加载镜像'
fi

valid_env="$fake_dir/valid-env"
mkdir -p "$valid_env"
touch "$valid_env/.env" "$valid_env/docker-compose.yml" "$valid_env/docker-compose.tunnel.yml"
: > "$fake_dir/docker.log"
if FAKE_DOCKER_LOG="$fake_dir/docker.log" DEPLOY_DIR="$valid_env" PATH="$fake_dir:/usr/bin:/bin" \
  bash "$ROOT_DIR/deploy/remote-publish.sh" rollback >/dev/null 2>&1; then
  fail '没有 rollback 镜像时回滚意外通过'
fi
if grep -q 'compose.* up ' "$fake_dir/docker.log"; then
  fail '没有 rollback 镜像时重启了当前服务'
fi

printf 'PASS: deployment smoke checks\n'
