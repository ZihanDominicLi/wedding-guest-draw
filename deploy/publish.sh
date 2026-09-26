#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
# shellcheck source=publish_helpers.bash
source "$SCRIPT_DIR/publish_helpers.bash"

DEPLOY_HOST=${DEPLOY_HOST:-36.103.199.34}
DEPLOY_USER=${DEPLOY_USER:-ubuntu}
DEPLOY_DIR=${DEPLOY_DIR:-/home/ubuntu/wedding-guest-draw}
DEPLOY_SSH_PORT=${DEPLOY_SSH_PORT:-22}
DEPLOY_COMPOSE_FILES=${DEPLOY_COMPOSE_FILES:-"docker-compose.yml"}
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-180}
KEEP_ROLLBACKS=${KEEP_ROLLBACKS:-3}
APP_IMAGE=${APP_IMAGE:-wedding-guest-draw-app}
ALLOW_CACHED_IMAGE=${ALLOW_CACHED_IMAGE:-0}
ARCHIVE_CODEC=${ARCHIVE_CODEC:-auto}
REMOTE_SCRIPT_PATH=/tmp/wedding-guest-draw-remote-publish.sh

phase=initialization
on_error() {
  local status=$?
  printf '发布失败（阶段：%s，退出码：%s）。\n' "$phase" "$status" >&2
  exit "$status"
}
trap on_error ERR

die() { printf '错误：%s\n' "$1" >&2; exit 1; }
need_command() { command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"; }

shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

remote_env_command() {
  printf 'DEPLOY_DIR=%s DEPLOY_COMPOSE_FILES=%s HEALTH_TIMEOUT_SECONDS=%s KEEP_ROLLBACKS=%s APP_IMAGE=%s' \
    "$(shell_quote "$DEPLOY_DIR")" \
    "$(shell_quote "$DEPLOY_COMPOSE_FILES")" \
    "$(shell_quote "$HEALTH_TIMEOUT_SECONDS")" \
    "$(shell_quote "$KEEP_ROLLBACKS")" \
    "$(shell_quote "$APP_IMAGE")"
}

ssh_command() {
  ssh -p "$DEPLOY_SSH_PORT" \
    -o BatchMode=yes \
    -o ConnectTimeout=15 \
    -o TCPKeepAlive=yes \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=120 \
    "$DEPLOY_USER@$DEPLOY_HOST" "$@"
}

preflight_local() {
  phase=local-preflight
  need_command git
  need_command docker
  need_command ssh
  need_command gzip
  [[ -f "$ROOT_DIR/Dockerfile" ]] || die "项目根目录缺少 Dockerfile"
  [[ -f "$SCRIPT_DIR/remote-publish.sh" ]] || die "缺少 deploy/remote-publish.sh"
  require_clean_worktree "$ROOT_DIR"
  docker info >/dev/null 2>&1 || die "Docker daemon 未运行，请先启动 Docker Desktop"
  docker buildx version >/dev/null 2>&1 || die "当前 Docker 不支持 Buildx；请启动 Docker Desktop 或启用 Buildx"
}

preflight_ssh() {
  phase=local-ssh-preflight
  need_command ssh
  [[ -f "$SCRIPT_DIR/remote-publish.sh" ]] || die "缺少 deploy/remote-publish.sh"
}

install_remote_script() {
  phase=remote-preflight
  local env_command
  env_command=$(remote_env_command)
  cat "$SCRIPT_DIR/remote-publish.sh" | ssh_command "cat > '$REMOTE_SCRIPT_PATH' && chmod 700 '$REMOTE_SCRIPT_PATH' && $env_command bash '$REMOTE_SCRIPT_PATH' preflight"
}

choose_codec() {
  case "$ARCHIVE_CODEC" in
    gzip|zstd) printf '%s\n' "$ARCHIVE_CODEC" ;;
    auto)
      if command -v zstd >/dev/null 2>&1 && ssh_command 'command -v zstd >/dev/null 2>&1'; then
        printf 'zstd\n'
      else
        printf 'gzip\n'
      fi
      ;;
    *) die "ARCHIVE_CODEC 只能是 auto、zstd 或 gzip" ;;
  esac
}

build_image() {
  phase=image-build
  local release=$1
  local build_status=0
  docker buildx build --platform linux/amd64 -t "$APP_IMAGE:$release" --load "$ROOT_DIR" || build_status=$?
  if (( build_status != 0 )); then
    if [[ "$ALLOW_CACHED_IMAGE" != "1" ]]; then
      return "$build_status"
    fi
    printf '警告：本地构建失败，ALLOW_CACHED_IMAGE=1，将复用现有 %s:latest。\n' "$APP_IMAGE" >&2
    docker image inspect "$APP_IMAGE:latest" --format '{{.Architecture}}' | grep -qx amd64 || die "现有缓存镜像不是 linux/amd64"
    docker tag "$APP_IMAGE:latest" "$APP_IMAGE:$release"
  fi
  local architecture
  architecture=$(docker image inspect "$APP_IMAGE:$release" --format '{{.Architecture}}')
  [[ "$architecture" == "amd64" ]] || die "构建结果架构为 $architecture，不是 linux/amd64"
}

publish() {
  preflight_local
  local release image env_command codec
  release=$(release_id_from_git "$ROOT_DIR")
  validate_release_id "$release" || die "生成的 release id 不安全"
  printf '准备发布 %s 到 %s@%s:%s\n' "$release" "$DEPLOY_USER" "$DEPLOY_HOST" "$DEPLOY_DIR"
  build_image "$release"
  install_remote_script
  phase=image-transfer
  env_command=$(remote_env_command)
  codec=$(choose_codec)
  image="$APP_IMAGE:$release"
  printf '使用 %s 压缩传输镜像。\n' "$codec"
  if [[ "$codec" == "zstd" ]]; then
    docker save "$image" | zstd -T0 -3 -q | ssh_command "$env_command bash '$REMOTE_SCRIPT_PATH' receive '$release' zstd"
  else
    docker save "$image" | gzip -1 | ssh_command "$env_command bash '$REMOTE_SCRIPT_PATH' receive '$release' gzip"
  fi
  phase=complete
  printf '发布成功：%s\n' "$release"
}

dry_run() {
  preflight_local
  install_remote_script
  phase=complete
  printf '预检通过：本地 Docker、SSH、服务器目录、.env 和 Compose 配置均正常。未构建镜像，未重启服务。\n'
}

rollback() {
  preflight_ssh
  install_remote_script
  phase=rollback
  ssh_command "$(remote_env_command) bash '$REMOTE_SCRIPT_PATH' rollback"
  phase=complete
  printf '回滚完成。\n'
}

case "${1:-publish}" in
  publish) publish ;;
  dry-run) dry_run ;;
  rollback) rollback ;;
  *) die "用法：$0 [dry-run|rollback]" ;;
esac
