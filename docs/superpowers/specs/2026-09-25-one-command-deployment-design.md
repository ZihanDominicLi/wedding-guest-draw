# 一键部署发布器设计

## 目标

把当前需要多次手工操作的更新流程收敛为本地一条命令：

```bash
./deploy/publish.sh
```

发布器面向当前 Ubuntu 服务器和 Cloudflare Tunnel 部署方式，解决服务器无法稳定访问 Docker Hub 的问题。应用镜像在开发机上构建为 `linux/amd64`，通过 SSH 传输到服务器；服务器只负责加载镜像、执行迁移、重启服务和验证健康状态。

## 成功标准

- 发布者只需确认当前代码和目标服务器，后续不再手动执行 `docker save`、压缩、`scp`、解压、`docker load`、迁移和检查命令。
- 服务器上的 `.env`、PostgreSQL 数据卷、上传文件、备份文件和 Caddy 数据卷保持不变。
- 应用更新失败时，旧应用镜像仍可恢复；数据库不执行回滚或清库。
- 发布器在应用健康检查通过前返回失败，在通过后输出访问地址和容器状态。
- 不要求服务器从 Docker Hub 拉取 Node 基础镜像或应用镜像。

## 范围

### 包含

1. 本地发布脚本 `deploy/publish.sh`。
2. 服务器端一次性执行的发布脚本，由本地脚本通过 SSH 注入，避免维护第二份脚本。
3. 发布前检查：Git 工作树、Docker、目标架构、SSH 连接、Compose 配置和服务器 `.env`。
4. 应用镜像构建、压缩传输、远端加载、旧镜像标签备份、应用重建和健康检查。
5. 应用镜像失败回滚，以及失败时保留远程临时文件供排查。
6. `docs/DEPLOYMENT.md` 中的使用说明和故障处理。

### 不包含

- 自动修改服务器 `.env`、DNS、Cloudflare Tunnel 或防火墙。
- 删除 Docker 卷、数据库数据或上传文件。
- 自动回滚 Prisma migration。数据库结构变更必须向前兼容；需要回退结构时使用现有备份流程。
- GitHub Actions 自动触发。该功能可作为后续阶段，在一键发布稳定后再接入。

## 配置

发布器从环境变量读取目标服务器，提供适合当前服务器的默认值：

```text
DEPLOY_HOST=36.103.199.34
DEPLOY_USER=ubuntu
DEPLOY_DIR=/home/ubuntu/wedding-guest-draw
DEPLOY_SSH_PORT=22
DEPLOY_COMPOSE_FILES=docker-compose.yml
```

默认值写在脚本中，不写入密码和私钥。SSH 使用本机已有密钥或 SSH agent；脚本不接受密码参数，也不把密码写入日志。发布前脚本要求目标目录存在且包含 `.env`，首次安装仍使用单独的服务器初始化流程。

## 发布流程

### 本地阶段

1. 确认工作树没有未提交变更，或通过显式 `ALLOW_DIRTY=1` 允许发布当前工作树。
2. 确认 Docker daemon 正常，并确认 Docker Buildx 可用；若 Buildx 插件不可用但 Docker CLI 明确支持 `docker build --platform`，使用该兼容路径。
3. 构建 `wedding-guest-draw-app:<release-id>`，其中 release id 使用当前 Git commit 短 SHA 和 UTC 时间组成。
4. 用 `docker save` 输出镜像，并在内存流中 gzip；不在项目目录创建压缩包。
5. 镜像本地构建和架构验证通过后，才连接服务器；通过 SSH 将压缩流传输到服务器端发布脚本。

### 服务器阶段

1. 创建带 release id 的临时目录。
2. 接收并加载应用镜像。
3. 将当前 `wedding-guest-draw-app:latest` 标记为 `rollback-<timestamp>`。
4. 使用现有 Compose 文件和 `.env`，仅重建 `app` 服务；数据库、备份、Caddy 和 Cloudflare Tunnel 按依赖规则保持运行。
5. 等待 `app` 健康状态，检查 `/api/health`。
6. 健康检查成功后将新镜像标记为 `latest`，清理本次临时文件和超过保留数量的旧回滚标签。
7. 健康检查失败时停止新应用，将上一个回滚标签恢复为 `latest` 并重启应用；保留失败 release 的日志摘要。

服务器阶段必须使用 `docker compose up -d --no-build --force-recreate app`，防止再次触发 Docker Hub 构建。Compose 的 `.env` 由服务器读取，发布流中不得包含它。

## 数据与迁移安全

- 应用启动命令继续执行 `prisma migrate deploy` 和幂等 seed。
- 发布器在应用重启前不执行数据库清理命令。
- 新 migration 执行失败时，应用保持旧容器或进入回滚路径；发布器报告 migration 日志，不假装发布成功。
- 现有 PostgreSQL、uploads、backups、Caddy data 和 Caddy config 卷不变。
- 回滚只切换应用镜像，不回滚数据库 schema。发布前若包含不可逆 schema 变更，必须先使用后台备份流程。

## 故障处理

脚本遇到以下情况立即停止，并给出下一步命令：Docker 未启动、构建失败、SSH 失败、服务器缺少 `.env`、Compose 配置无效、迁移失败、健康检查超时。日志包含 release id 和失败阶段，但不输出环境变量值、Cookie、私钥或数据库密码。

回滚命令提供显式入口：

```bash
./deploy/publish.sh rollback
```

该命令只恢复最近一次成功的应用镜像，并重复健康检查；它不影响数据库和持久卷。

## 验证

- Shell 语法检查：`bash -n deploy/publish.sh`。
- 静态检查：脚本拒绝空服务器目录、缺失 `.env`、非 amd64 镜像和未确认的脏工作树。
- 远程 dry-run：只执行 SSH、Compose config 和镜像存在性检查，不重启服务。
- 发布成功检查：`docker compose ps`、容器健康状态和 `/api/health` 均通过。
- 失败演练：使用无效镜像标签验证应用回滚，不删除数据库卷。
