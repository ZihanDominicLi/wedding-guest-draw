#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_DIR=${DEPLOY_DIR:-/home/ubuntu/wedding-guest-draw}
DEPLOY_COMPOSE_FILES=${DEPLOY_COMPOSE_FILES:-"docker-compose.yml"}
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-180}
KEEP_ROLLBACKS=${KEEP_ROLLBACKS:-3}
APP_IMAGE=${APP_IMAGE:-wedding-guest-draw-app}
phase=initialization
previous_tag=
previous_exists=0

die() { printf '远端发布失败（阶段：%s）：%s\n' "$phase" "$1" >&2; exit 1; }
compose_args() {
  local file
  for file in $DEPLOY_COMPOSE_FILES; do
    printf '%s\n' "-f" "$file"
  done
}
compose() {
  local args=() token
  while IFS= read -r token; do args+=("$token"); done < <(compose_args)
  (cd "$DEPLOY_DIR" && docker compose -p wedding-guest-draw "${args[@]}" "$@")
}
preflight() {
  phase=preflight
  [[ -d "$DEPLOY_DIR" ]] || die "项目目录不存在：$DEPLOY_DIR"
  [[ -f "$DEPLOY_DIR/.env" ]] || die "服务器缺少 .env，拒绝继续"
  if [[ "$DEPLOY_COMPOSE_FILES" == "docker-compose.yml" && -f "$DEPLOY_DIR/docker-compose.tunnel.yml" ]]; then
    DEPLOY_COMPOSE_FILES="docker-compose.yml docker-compose.tunnel.yml"
  fi
  local file
  for file in $DEPLOY_COMPOSE_FILES; do
    [[ -f "$DEPLOY_DIR/$file" ]] || die "服务器缺少 Compose 文件：$file"
  done
  command -v docker >/dev/null 2>&1 || die "服务器缺少 Docker"
  docker info >/dev/null 2>&1 || die "Docker daemon 未运行"
  compose config --quiet || die "Compose 配置无效"
}
wait_for_health() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
  local container status health
  while (( $(date +%s) < deadline )); do
    container=$(compose ps -q app 2>/dev/null || true)
    if [[ -n "$container" ]]; then
      status=$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)
      health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)
      if [[ "$status" == "running" && ( "$health" == "healthy" || "$health" == "none" ) ]]; then
        if docker exec "$container" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
          return 0
        fi
      elif [[ "$status" == "exited" || "$status" == "dead" || "$health" == "unhealthy" ]]; then
        return 1
      fi
    fi
    sleep 2
  done
  return 1
}
cleanup_rollbacks() {
  local tags=() tag count=0
  while IFS= read -r tag; do
    [[ -n "$tag" ]] && tags+=("$tag")
  done < <(docker image ls "$APP_IMAGE" --format '{{.Tag}}' | grep '^rollback-' | sort -r || true)
  for tag in "${tags[@]}"; do
    count=$((count + 1))
    if (( count > KEEP_ROLLBACKS )); then docker image rm "$APP_IMAGE:$tag" >/dev/null 2>&1 || true; fi
  done
}
show_failure_logs() { compose logs --tail=120 app >&2 || true; }
restore_previous() {
  if (( previous_exists )); then
    docker tag "$APP_IMAGE:$previous_tag" "$APP_IMAGE:latest"
    compose up -d --no-build --force-recreate app >/dev/null || return 1
    wait_for_health || return 1
    printf '已恢复应用镜像：%s\n' "$previous_tag" >&2
    return 0
  else
    printf '没有可用的旧应用镜像，保留当前失败容器供排查。\n' >&2
    return 1
  fi
}
activate() {
  local release=$1
  phase=activate
  if docker image inspect "$APP_IMAGE:latest" >/dev/null 2>&1; then
    previous_tag="rollback-$(date -u +%Y%m%d%H%M%S)"
    docker tag "$APP_IMAGE:latest" "$APP_IMAGE:$previous_tag"
    previous_exists=1
  fi
  docker tag "$APP_IMAGE:$release" "$APP_IMAGE:latest"
  if ! compose up -d --no-build --force-recreate app; then
    show_failure_logs
    restore_previous || { printf '自动回滚失败，请立即检查 app 容器和备份。\n' >&2; return 1; }
    return 1
  fi
  phase=health-check
  if ! wait_for_health; then
    show_failure_logs
    restore_previous || { printf '自动回滚失败，请立即检查 app 容器和备份。\n' >&2; return 1; }
    return 1
  fi
  docker image rm "$APP_IMAGE:$release" >/dev/null 2>&1 || true
  cleanup_rollbacks
}
receive() {
  local release=$1 temp_dir archive
  validate_release_id() { [[ "$1" =~ ^[a-zA-Z0-9._-]+$ ]]; }
  validate_release_id "$release" || die "release id 不安全"
  preflight
  phase=image-load
  temp_dir=$(mktemp -d /tmp/wedding-guest-draw-release.XXXXXX)
  archive="$temp_dir/release.tar.gz"
  trap 'rm -rf "$temp_dir"' EXIT
  cat > "$archive" || die "镜像传输中断"
  gzip -t "$archive" || die "镜像压缩包损坏"
  docker load -i "$archive" >/dev/null
  docker image inspect "$APP_IMAGE:$release" >/dev/null 2>&1 || die "加载后找不到镜像 $APP_IMAGE:$release"
  activate "$release" || exit 1
  phase=complete
  printf '远端发布成功：%s\n' "$release"
}
rollback() {
  preflight
  phase=rollback
  local tag
  tag=$(docker image ls "$APP_IMAGE" --format '{{.Tag}}' | grep '^rollback-' | sort -r | head -1 || true)
  [[ -n "$tag" ]] || die "没有可用的 rollback 镜像"
  docker tag "$APP_IMAGE:$tag" "$APP_IMAGE:latest"
  compose up -d --no-build --force-recreate app || { show_failure_logs; die "回滚容器启动失败"; }
  wait_for_health || { show_failure_logs; die "回滚后健康检查失败"; }
  printf '已回滚到：%s\n' "$tag"
}

case "${1:-}" in
  preflight) preflight ;;
  receive) [[ $# -eq 2 ]] || die 'receive 需要 release id'; receive "$2" ;;
  rollback) rollback ;;
  *) die '用法：preflight|receive <release-id>|rollback' ;;
esac
