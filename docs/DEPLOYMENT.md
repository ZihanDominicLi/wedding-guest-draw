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

## 5. 更新与回滚

更新前先在后台完成备份：

```bash
git pull --ff-only
docker compose build app
docker compose up -d app
docker compose ps
```

回滚应用代码不会自动回滚数据库 migration。数据库结构变化时应恢复对应备份，而不是手工删除 migration 表。
