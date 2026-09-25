# 部署说明

## 1. 域名与防火墙

1. 在 DNS 服务商添加一条 `A` 记录，把婚礼子域名指向服务器公网 IPv4。
2. 云防火墙和系统防火墙只开放 TCP `22`、`80`、`443` 及 UDP `443`。
3. 不开放 `3000` 或 `5432`。PostgreSQL 和 Next.js 仅通过 Compose 私网通信。

DNS 生效可用 `dig +short wedding.example.com` 检查，结果应为服务器公网 IP。

## 2. 环境变量

```bash
cp .env.example .env
openssl rand -base64 48   # 用作 BETTER_AUTH_SECRET
openssl rand -base64 32   # 用作 POSTGRES_PASSWORD
```

编辑 `.env`：

- `POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码必须完全一致；URL 特殊字符需要百分号编码。
- `BETTER_AUTH_URL` 使用最终 `https://域名`，不要带末尾斜杠。
- `WEDDING_DOMAIN` 只填域名，不填协议。
- `ADMIN_PASSWORD` 至少 12 位，婚礼后立即更换或销毁服务器。
- `BACKUP_INTERVAL_SECONDS` 默认每 6 小时备份一次；`BACKUP_RETENTION_DAYS` 默认保留 14 天。

不要把 `.env` 上传到 Git、网盘或聊天群。

## 3. 启动

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f app caddy
```

应用容器每次启动都会执行未应用的 Prisma migration 和幂等 seed。Caddy 自动申请并续期证书。访问：

- `https://你的域名/join`：宾客登记
- `https://你的域名/login`：管理员登录
- `https://你的域名/draw`：主持控制台
- `https://你的域名/screen`：投影大屏
- `https://你的域名/api/health`：健康检查

首次登录后进入“设置”，填写新人、日期、举办城市，上传清晰婚礼横图并下载最终二维码。打印前务必用手机流量扫描，确认域名不是 localhost。

## 4. 演示、清场与备份

```bash
docker compose exec app pnpm seed:demo
docker compose exec app pnpm event:reset --confirm RESET_TEST_EVENT
```

清场命令只删除“演示宾客”前缀、演示奖品及相关轮次，保留管理员和婚礼设置。

`backup` 容器启动后立即备份，此后默认每 6 小时备份一次。每次备份包含 PostgreSQL 自定义格式文件、全部上传图片归档和相对路径 SHA-256 校验文件；超过保留天数的同名前缀文件会自动清理。后台“运维”还可手动触发一次数据库备份并登记到系统中。正式抽奖模式的 30 分钟备份门槛以这条后台登记为准，因此彩排和正式抽奖前仍需在后台点击备份。

备份位于 `backups` 卷。查看调度日志并额外导出到宿主机：

```bash
docker compose logs --tail=50 backup
docker compose run --rm -v "$PWD/backup-export:/export" app \
  sh -c 'cp -a /data/backups/. /export/'
```

恢复前先验证校验和并停应用。数据库可恢复到空库或现有库；上传归档恢复到持久卷：

```bash
cd backup-export
sha256sum --check wedding-时间.sha256
cd ..
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists \
  --username wedding --dbname wedding < backup-export/wedding-时间.dump
docker compose run --rm -v "$PWD/backup-export:/restore:ro" app \
  sh -c 'tar -C /data/uploads -xzf /restore/wedding-时间.uploads.tar.gz'
docker compose start app
```

正式抽奖模式要求 30 分钟内有成功备份。若紧急覆盖，必须填写原因，系统会永久写入审计记录。

## 5. 一键更新与回滚

### 首次配置

发布器在你的 Mac 上构建 `linux/amd64` 应用镜像，再通过 SSH 传给服务器。服务器不需要访问 Docker Hub，也不会接收本地 `.env`。

确认 Mac 已启动 Docker Desktop，并且可以免密码登录服务器：

```bash
ssh -p 22 ubuntu@36.103.199.34
```

第一次使用时，在项目根目录执行：

```bash
chmod +x deploy/*.sh
```

如果服务器地址、用户名或项目目录不同，可以在命令前覆盖默认值：

```bash
DEPLOY_HOST=36.103.199.34 \
DEPLOY_USER=ubuntu \
DEPLOY_DIR=/home/ubuntu/wedding-guest-draw \
./deploy/publish.sh dry-run
```

服务器项目目录必须已经存在，并且包含由服务器自己维护的 `.env`。发布器不会创建、上传或修改这个文件。发布器默认使用仓库中的 `docker-compose.yml`；如果服务器项目目录里存在 `docker-compose.tunnel.yml`，会自动把它加入 Compose 配置，不需要额外参数。

### 日常发布

代码提交到当前分支后，在项目根目录运行：

```bash
./deploy/publish.sh dry-run
./deploy/publish.sh
```

`dry-run` 只检查本地 Docker、SSH、服务器 `.env`、Compose 文件和 Compose 配置，不构建镜像、不执行迁移、不重启容器。正式发布会自动：

1. 构建当前代码的 `linux/amd64` 镜像。
2. 将镜像压缩后通过 SSH 传输。
3. 在服务器加载镜像，执行已有 Prisma migration 和幂等 seed。
4. 只重建 `app` 服务，数据库、备份、Caddy 和 Cloudflare Tunnel 保持运行。
5. 等待 `/api/health` 返回成功。
6. 健康检查失败时恢复上一个应用镜像。

发布器只使用服务器上的 `.env` 和 Docker 持久卷，不会清空数据库、上传文件或备份。

### 回滚

如果新版本启动失败，发布器会自动回滚。需要手动恢复最近一次成功的应用镜像时运行：

```bash
./deploy/publish.sh rollback
```

回滚只切换应用镜像，不回滚 Prisma migration。数据库结构变更必须向前兼容；需要恢复数据库时，按上一节的备份恢复流程操作，不要手工删除 migration 记录。

### 常见错误

- `Docker daemon 未运行`：先启动 Docker Desktop。
- `当前 Docker 不支持跨平台构建`：升级 Docker Desktop，确认 `docker buildx version` 或 `docker build --help` 中有 `--platform`。
- `Permission denied (publickey)`：先单独运行 `ssh ubuntu@36.103.199.34`，配置 SSH key 后再发布。
- `服务器缺少 .env`：在服务器项目目录创建并填写 `.env`，不要把它提交到 Git。
- `健康检查超时`：查看服务器上的 `docker compose ... logs --tail=120 app`；应用失败时旧镜像会自动恢复。

如果 Docker Hub 暂时无法访问，普通发布会在本地构建阶段安全停止。只有在确认本机的 `wedding-guest-draw-app:latest` 就是要发布的版本时，才可显式复用缓存镜像：

```bash
ALLOW_CACHED_IMAGE=1 ./deploy/publish.sh
```

该开关不会自动使用旧镜像；它只在重新构建失败时生效，并且会再次检查缓存镜像必须是 `linux/amd64`。
