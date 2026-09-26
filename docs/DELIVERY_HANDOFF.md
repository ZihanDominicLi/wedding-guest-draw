# 婚礼宾客登记、答题与抽奖系统交接文档

本文档给接手本项目的 agent 或开发者使用。文档记录当前代码、生产环境、已上线功能、未完成需求和安全发布方法。

交接结论：当前工作树已包含 10 题默认题目、答题场次删除和按中奖人数自动回退答题分数门槛。公网版本在本次发布前仍需按发布器完成一次 app-only 更新和健康检查；正式活动前仍应完成完整彩排。

## 1. 项目概况

这是一个面向 500 人以内婚礼现场的 Web 系统，包含：

- 宾客扫码登记：姓名、手机号后四位、与新人的关系、是否携带小朋友、来源地。
- 后台宾客列表、筛选、编辑、删除、CSV 导出。
- 按规则自动分组，并支持人工锁定分组。
- 奖品、抽奖轮次、候选快照、中奖记录和审计日志。
- 现场答题：主持人控制题目，宾客手机同步作答，大屏显示题目和选项。
- 答题分数写回宾客列表，可作为抽奖最低分门槛。
- 抽奖大屏和答题大屏分离。
- PostgreSQL、Docker Compose、备份服务和 Cloudflare Tunnel。

## 2. 代码和生产状态

### 本地代码

- 工作目录：`/Users/dominic/Documents/Attemptations/wedding-guest-draw/.worktrees/implementation`
- 分支：`codex/implementation`
- 功能代码最新提交：`3b46cf6 reduce projector background blur`
- GitHub：`https://github.com/ZihanDominicLi/wedding-guest-draw`
- 工作树在交接时应保持干净：

```bash
git status -sb
git log --oneline -8
```

### 生产环境

- 服务器：`ubuntu@36.103.199.34`
- SSH 端口：`22`
- 服务器项目目录：`/home/ubuntu/wedding-guest-draw`
- 公网域名：`https://wedding.slideforgeai.com`
- 生产分支：服务器上通常不依赖 Git checkout，发布器通过 SSH 传输应用镜像。
- 最新已发布版本以 `./deploy/publish.sh publish` 的输出为准；发布器只重建 app 容器。
- 最新发布只重建了 `app` 容器，没有重建数据库、备份、Caddy 或 Cloudflare Tunnel。

### 代码导航

- `src/app/(public)/join/page.tsx`：宾客登记入口。
- `src/app/(staff)/admin/page.tsx`：后台导航和管理首页。
- `src/components/admin/GuestTable.tsx`：宾客列表、筛选、编辑和删除。
- `src/modules/grouping/`：分组规则和分组计算。
- `src/modules/drawing/`：候选人、抽奖轮次和中奖逻辑。
- `src/modules/quiz/`：答题状态机、服务层、默认题目和参与者凭证。
- `src/components/quiz/`：主持控制台、题目设置、宾客答题页和答题大屏。
- `prisma/schema.prisma`：数据库模型和级联关系。
- `deploy/`：一键发布、远端接收、健康检查和回滚脚本。

生产 Compose 的 `docker-compose.tunnel.yml` 是服务器本地文件，发布器会在服务器发现它后自动加入 Compose。不要用本地缺失的 tunnel 文件覆盖服务器配置。

### 生产入口

- 宾客登记：`https://wedding.slideforgeai.com/join`
- 管理员登录：`https://wedding.slideforgeai.com/login`
- 管理后台：`https://wedding.slideforgeai.com/admin`
- 宾客列表：`https://wedding.slideforgeai.com/admin/guests`
- 现场答题控制台：`https://wedding.slideforgeai.com/admin/quiz`
- 题目设置：`https://wedding.slideforgeai.com/admin/quiz/<session-id>/questions`
- 宾客答题页：`https://wedding.slideforgeai.com/quiz`
- 答题大屏：`https://wedding.slideforgeai.com/quiz/screen`
- 抽奖控制台：`https://wedding.slideforgeai.com/draw`
- 抽奖大屏：`https://wedding.slideforgeai.com/screen`
- 健康检查：`https://wedding.slideforgeai.com/api/health`

不要在交接文档、GitHub 或聊天消息中记录 `.env`、管理员密码、数据库密码或 `BETTER_AUTH_SECRET`。

## 3. 已完成并已上线的功能

### 3.1 登记和答题凭证

登记接口会给当前浏览器写入答题凭证。登记成功页在有可用答题场次时提供“立即进入答题”，并自动跳转到 `/quiz`。答题页通过同一浏览器凭证识别宾客；换浏览器、无痕模式或清除 Cookie 后需要重新登记。

### 3.2 实时答题流程

当前答题状态：`DRAFT -> READY -> LIVE -> REVIEW -> FINISHED`。

主持人流程：

1. 在 `/admin/quiz` 创建场次。
2. 进入“题目设置”，填写题目、选项、正确答案和每题限时。
3. 点击“发布场次”。
4. 点击“开始第 1 题”。
5. 到时点击“公布答案”；需要提前结束时先点击“提前收卷”。
6. 公布后点击“开始下一题”。
7. 最后一题公布后点击“结束并计分”。

规则：

- 服务器保存每题开始时间和截止时间，手机倒计时只是提示。
- 一题只能提交一次，提交后不能修改。
- 截止后提交会记录为跳过，不补答。
- 掉线后重新打开 `/quiz` 会从服务端恢复当前状态。
- 未设置正确答案的题目不能发布或提交。

### 3.3 答题分数参与抽奖

答题完成后，宾客的 `quizScore` 和 `quizCompletedAt` 写回 `Guest`。抽奖后台默认使用“自动按中奖人数计算”：从 10 分开始，锁定候选名单时按目标组和本轮中奖人数逐分回退，直到名额满足或降到 0 分，并记录实际门槛、回退次数和候选快照。也可以切换为手动起始门槛或关闭成绩筛选。

### 3.4 上传背景图

之前上传约 11 MB 的背景图会超过 Next.js 默认 10 MB 请求体限制，表现为后台保存按钮一直转圈。已完成以下修复：

- `next.config.ts` 将 `experimental.proxyClientMaxBodySize` 调整为 `32mb`。
- `WeddingSettingsForm` 对非 JSON 错误和网络异常进行处理。
- 保存请求使用 `finally` 恢复按钮状态。
- 大屏背景模糊从 `4px` 调整为 `1px`。
- 深色蒙版从 `48%` 调整为 `34%`。

当前已直接设置的背景图：

```text
/uploads/wedding-background-direct.png
```

公网检查地址：

```text
https://wedding.slideforgeai.com/uploads/wedding-background-direct.png
```

该文件位于持久化 `uploads` 卷中。不要删除上传卷或手动清空 `/data/uploads`。

### 3.5 一键发布器

日常发布入口：

```bash
./deploy/publish.sh dry-run
ARCHIVE_CODEC=zstd ./deploy/publish.sh publish
```

不带参数也可以发布：

```bash
./deploy/publish.sh
```

发布器会：

1. 检查工作树、Docker Desktop、Buildx 和 SSH。
2. 构建 `linux/amd64` 应用镜像。
3. 通过 SSH 传输压缩镜像，不上传服务器 `.env`。
4. 在服务器加载镜像。
5. 只执行 `docker compose up -d --no-build --force-recreate app`。
6. 等待容器健康检查和 `/api/health`。
7. 失败时自动恢复上一个应用镜像。

关键脚本：

- `deploy/publish.sh`：本地入口。
- `deploy/publish_helpers.bash`：发布辅助函数。
- `deploy/remote-publish.sh`：服务器接收、切换、健康检查和回滚。
- `docs/DEPLOYMENT.md`：完整部署说明。

发布器不会删除 PostgreSQL、上传文件、备份、Caddy 或 Tunnel 数据卷。应用回滚不会回滚 Prisma migration。

## 4. 本次更新内容与发布确认

以下内容已在当前工作树实现；推送后需按发布器完成公网 app-only 更新，再验证生产环境。

### 4.1 增加第八至第十题

用户提供了以下三题：

**第八题：新娘新郎养的两只猫叫什么名字**

- A 来福和 lucky
- B 莱福和 lucky
- C 来福和 luckin
- D 莱福和 luckin

**第九题：新娘和新郎的生日分别在几月份**

- A 3 月和 5 月
- B 3 月和 7 月
- C 3 月和 12 月
- D 都在 3 月

**第十题：新娘和新郎的恋爱纪念日是**

- A 7 月 1 日
- B 8 月 1 日
- C 9 月 1 日
- D 10 月 1 日

正确答案没有在用户消息中指定。默认应把三题加入题目定义，但 `correctOption` 保持 `null`，然后在后台题目设置页选择正确答案。不能猜测正确答案。

当前 `src/modules/quiz/defaults.ts` 已是 10 道默认题，三道新增题的正确答案保持为空，需在题目设置页选择。修改默认题目只影响以后新建的答题场次，不会自动给数据库中已经存在的场次追加题目。

如果要给已有场次追加题目，当前题目设置页仍需要单独的数据变更；默认数组不会修改历史场次。

### 4.2 删除答题场次

用户希望在 `/admin/quiz` 增加删除答题场次选项，主要用于测试清理。

已实现约束：

- 只有管理员可调用。
- 前端按钮必须有二次确认。
- `LIVE` 场次禁止删除，避免主持中误操作；先结束场次再删除。
- `DRAFT`、`READY`、`REVIEW`、`FINISHED` 可以删除，但需要明确提示会删除该场次题目、参与记录和答案。
- 后端必须再次检查状态，不能只依赖前端按钮隐藏。
- 写入审计事件，例如 `quiz.session_deleted`。
- 删除前清理 `Guest.quizSessionId`、`Guest.quizScore`、`Guest.quizCompletedAt`，否则删除测试场次后宾客列表可能保留测试分数。
- Prisma 关系中题目、参与者和答案对 `QuizSession` 使用级联删除；`Guest.quizSession` 使用 `SetNull`，但分数字段不会自动清空，因此必须显式清理宾客分数字段。

当前已实现接口：

```text
DELETE /api/quiz/<session-id>
```

实现位置：

- `src/modules/quiz/service.ts`：新增 `deleteQuizSession`。
- `src/app/api/quiz/[id]/route.ts`：新增 `DELETE` handler。
- `src/components/quiz/QuizHost.tsx`：增加删除按钮、确认和删除后移除列表项。
- `tests/integration/quiz-session-deletion.test.ts`：覆盖状态保护、审计和宾客分数清理。

## 5. 发布与接手顺序

1. 确认 `git status -sb` 干净并运行本地验证命令。
2. 推送 `codex/implementation` 分支。
3. 使用 `ARCHIVE_CODEC=zstd ./deploy/publish.sh publish` 做 app-only 发布。
4. 发布后验证健康接口、后台答题页、删除按钮、自动门槛和答题大屏。
5. 正式活动前完成登记、10 题、刷新/断线、阈值回退、抽奖和导出彩排。

## 6. 本地验证命令

在项目根目录执行：

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
git diff --check
```

仓库中没有名为 `pnpm lint:build` 或 `pnpm ts-check` 的 package script；接手时以 `package.json` 中的 `pnpm lint`、`pnpm typecheck`、`pnpm test:unit` 和 `pnpm build` 为准。

如果只改了题目默认值和删除功能，至少要补充并运行：

```bash
pnpm vitest run tests/quiz/defaults.test.ts
pnpm vitest run tests/quiz
```

## 7. 生产发布和验证命令

发布前：

```bash
git status -sb
git push origin codex/implementation
./deploy/publish.sh dry-run
```

发布：

```bash
ARCHIVE_CODEC=zstd ./deploy/publish.sh publish
```

发布后：

```bash
curl -sS --noproxy '*' https://wedding.slideforgeai.com/api/health
```

预期返回包含：

```json
{"status":"ok","database":"healthy"}
```

服务器侧只在需要排查时查看日志，不要把 `.env` 或敏感环境变量输出到聊天：

```bash
ssh ubuntu@36.103.199.34
cd /home/ubuntu/wedding-guest-draw
docker compose -p wedding-guest-draw \
  -f docker-compose.yml \
  -f docker-compose.tunnel.yml \
  ps
docker compose -p wedding-guest-draw \
  -f docker-compose.yml \
  -f docker-compose.tunnel.yml \
  logs --tail=120 app
```

手动回滚：

```bash
./deploy/publish.sh rollback
```

## 8. 现场使用流程

### 宾客

1. 扫描二维码进入 `/join`。
2. 完成登记。
3. 登记成功页点击“立即进入答题”，或打开 `/quiz`。
4. 主持人发布题目后选择答案并提交。
5. 每题提交后不能修改，截止后不能补答。

### 主持人

1. 打开 `/admin/quiz`。
2. 在题目设置页确认每道题的正确选项和限时。
3. 打开 `/quiz/screen` 给大屏使用。
4. 按“发布场次 → 开始题目 → 收卷 → 公布答案 → 下一题”的顺序操作。
5. 最后一题公布后点击“结束并计分”。

### 抽奖

1. 在宾客后台确认答题分数已写回。
2. 在抽奖规则中设置分数阈值和分组条件。
3. 创建抽奖轮次并锁定候选人。
4. 打开 `/screen` 展示抽奖结果。

## 9. 交接时的注意事项

- 不要执行 `docker compose down -v`，这会删除数据库、上传或备份数据卷。
- 不要删除 `/home/ubuntu/wedding-guest-draw/.env`。
- 不要让发布器覆盖服务器本地的 `docker-compose.tunnel.yml`。
- 不要使用 `docker compose up --build` 作为日常发布方式；它可能在服务器上访问 Docker Hub 并绕过发布器的回滚流程。
- 大版本数据库 migration 要先评估回滚影响，因为应用镜像回滚不会回滚数据库结构。
- 背景图已经在持久化上传卷中，修改代码或重建 app 不会删除它。
- 生产发布成功的判断以发布器的“远端发布成功”和健康检查为准，不以本地镜像构建成功为准。

## 10. 交接验收清单

接手 agent 完成接管后，至少应确认：

- [ ] 能在本地打开项目，并通过 `git status -sb` 确认工作树状态。
- [ ] 能运行 `./deploy/publish.sh dry-run`，但不会在未确认时直接发布。
- [ ] 能登录生产后台，看到宾客、答题和抽奖入口。
- [ ] 能确认生产健康检查返回 `status: ok` 和 `database: healthy`。
- [ ] 能区分新建的 10 题默认场次与历史场次题目不会自动追加。
- [ ] 完成单元测试、构建、GitHub 推送和 app-only 发布。
- [ ] 发布后保留数据库、上传、备份、Caddy 和 Cloudflare Tunnel 数据，不执行 `down -v`。
