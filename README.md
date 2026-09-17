# 婚礼现场宾客登记与分组抽奖

面向单场婚礼、500 人以内的现场系统。宾客扫码逐人登记，服务端按规则分组；管理员管理名单、奖品与规则；主持人在登录后的控制台按组抽奖，公开大屏只展示已持久化的服务端结果。

## 功能

- 三步手机登记：姓名、手机号后四位、关系、儿童人数、出发地
- 自动主组与多标签；人工锁定分组不会被批量重算覆盖
- 实时现场看板、宾客筛选/编辑/CSV、规则影响预览
- 加密随机抽取、冻结候选快照、一人最多中奖一次、完整审计
- 奖品管理、主持控制台、Three.js 只读仪式大屏、刷新恢复
- PostgreSQL 持久限流、请求幂等、同源保护、健康检查
- 数据库备份、应急 CSV、Docker Compose 与 Caddy 自动 HTTPS

## 本地开发

要求 Node.js 24、pnpm 9 和 PostgreSQL 17。

```bash
cp .env.example .env
pnpm install
pnpm prisma migrate deploy
pnpm seed
pnpm dev
```

打开 `http://127.0.0.1:3000`。入口分别为 `/join`、`/admin`、`/draw`、`/screen`。

## 服务器部署

服务器只需 Docker、已解析到该服务器公网 IP 的域名，以及开放 TCP 80/443 和 UDP 443。完整步骤见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，现场彩排清单见 [docs/REHEARSAL.md](docs/REHEARSAL.md)。

```bash
cp .env.example .env
# 修改 .env 中所有 replace-with 和域名
docker compose up -d --build
docker compose ps
```

数据库没有宿主端口映射；上传、数据库与备份分别保存在 Docker 持久卷中。

## 常用命令

```bash
pnpm seed:demo
pnpm event:reset --confirm RESET_TEST_EVENT
pnpm lint
pnpm typecheck
pnpm vitest run
pnpm playwright test
pnpm build
```

许可证与主要第三方组件见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
