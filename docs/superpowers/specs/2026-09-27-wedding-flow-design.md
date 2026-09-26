# 婚礼登记、同步答题与五轮抽奖改造设计

日期：2026-09-27

状态：待实现的实施设计

依据：[WEDDING_FLOW_SPEC_v0.2.md](/Users/dominic/Downloads/WEDDING_FLOW_SPEC_v0.2.md)、现有
`docs/DELIVERY_HANDOFF.md`、`docs/superpowers/specs/2026-09-24-live-quiz-design.md`，以及本轮已确认的业务规则。

## 1. 目标和非目标

### 目标

- 登记、答题、结算、五轮抽奖和大屏展示使用同一个可恢复的活动状态。
- 10 道单选题，每题 10 分，总分 0–100；错答和未答均为 0 分。
- 宾客必须先完成登记；点选选项后异步保存，第一次成功提交后锁定。
- 主持人控制开始、切题、结算和逐轮揭晓，结果在结算时一次生成并持久化。
- A（主持/大屏）、B（宾客手机）和后台刷新后都从数据库恢复。
- 所有页面每 5 秒轮询状态，不使用 SSE、内存事件总线或其他推送机制通知页面状态。
- 服务器通过 `effectiveAt` 约定统一切换时刻；页面提前显示等待/loading，不以收到响应的时刻直接切换。
- 五轮结果固定为：长辈积分前 10、朋友积分前 5、长辈随机 20、朋友随机 10、带小朋友随机 20；五轮不重复中奖。

### 非目标

- 不引入短信登录、通用问卷编辑器、复杂题型或第二套账号体系。
- 不把正确答案或未揭晓结果下发给宾客浏览器。
- 不保证所有设备在同一毫秒渲染；掉线设备恢复后以服务器状态追赶。
- 不把轮询改造成 SSE 的兜底通道；本版本状态通知协议始终是轮询。

## 2. 统一状态机

活动状态为：

```text
REGISTRATION
  -> QUESTION (questionIndex: 1..10)
  -> SETTLING
  -> QUIZ_ENDED
  -> RESULTS (round: 1..5)
  -> FINISHED
```

数据库中的 `Event`（或现有场次模型）是唯一状态源。每次状态变更递增 `version`，并可有且只有一个未生效的 `PendingTransition`。

| 状态 | 主持端操作 | 服务端行为 | 宾客端行为 |
| --- | --- | --- | --- |
| `REGISTRATION` | 开始答题 | 校验恰好 10 题且每题有正确选项，安排第 1 题计划 | 可登记；已登记者等待 |
| `QUESTION` | 结束本题/下一题；第 10 题结束并结算 | 以 `effectiveAt` 原子关闭旧题并开放下一题或进入结算 | 只能提交当前题，提前收到计划但到时再切换 |
| `SETTLING` | 仅可重试结算 | 事务计分、生成五轮冻结结果 | 显示结算 loading，继续轮询 |
| `QUIZ_ENDED` | 揭晓第 1 轮 | 安排 `RESULTS(1)` 的生效计划 | 显示个人总分和已揭晓结果 |
| `RESULTS` | 揭晓下一轮；第 5 轮后结束 | 只改变当前揭晓轮次，不重新抽样 | 显示当前及已揭晓名单 |
| `FINISHED` | 无 | 保留最终快照 | 显示结束页 |

`effectiveAt` 建议默认为服务端当前时间后 8 秒，配置项可调整。控制 API 返回该计划；A、B 均按服务器时间校准后的倒计时执行。若轮询响应已经晚于 `effectiveAt`，客户端直接采用响应中的新状态，不再等待旧倒计时。

同一时刻只允许一个计划处于 `PENDING`。计划在数据库事务中以条件更新生效，重复请求返回原计划；不能通过重复点击或多个主持标签页创建两个切题动作。

## 3. 数据模型与迁移

优先复用现有 `QuizSession`、`QuizQuestion`、`QuizParticipant`、`QuizAnswer`、`DrawRound` 模型；若当前模型名称不同，迁移时保持兼容并在服务层提供统一命名。

### 3.1 场次字段

在答题场次上增加或确认以下字段：

```text
phase                 EventPhase
currentQuestionIndex  Int?
currentRound          Int?
version               Int
registrationClosedAt  DateTime?
scoringRuleVersion    String
settledAt             DateTime?
```

`totalScore` 必须区分 `NULL`（尚未结算）和 `0`（结算后零分）。题目内容、选项和正确选项在开始前冻结；默认题数组变化不修改已创建场次。

### 3.2 待生效计划

新增 `PendingTransition`：

```text
id                 String @id
eventId            String
requestId          String
fromPhase          EventPhase
toPhase            EventPhase
fromQuestionIndex Int?
toQuestionIndex   Int?
fromRound         Int?
toRound           Int?
effectiveAt       DateTime
status             PENDING | APPLIED | CANCELLED
createdAt         DateTime
appliedAt         DateTime?
```

约束：`(eventId, requestId)` 唯一；每个 `eventId` 最多一条 `PENDING` 记录。`eventId + status + effectiveAt` 建索引。

### 3.3 参与和答案

`QuizParticipant` 至少保存：`eventId`、`guestId`、姓名和尾号快照、`group`（`FRIEND`/`ELDER`）、`hasChildren`、`answeredCount`、`totalScore`、`settledAt`、凭证哈希和启用状态。唯一键为 `(eventId, guestId)`。

`QuizAnswer` 保存：`eventId`、`participantId`、`questionId`、选择项、`submissionId`、服务端接收时间、得分和状态。唯一键为 `(eventId, participantId, questionId)`，`submissionId` 幂等键也唯一。服务端不接受客户端传入的分数或其他宾客 ID。

### 3.4 结果快照

新增 `QuizResultRound` 与 `QuizWinner`（或等价字段）：

```text
QuizResultRound: eventId, round, type, requestedCount, eligibleCount,
                 actualCount, shortage, actualThreshold?, revealedAt?
QuizWinner:      resultRoundId, ordinal, participantId, displayNameSnapshot,
                 scoreSnapshot, candidateSnapshot
```

`(eventId, round)` 和 `(eventId, participantId)` 唯一，保证一场活动一个宾客最多中奖一次。候选快照、规则版本、同分随机顺序和实际人数必须落库，之后修改登记信息或抽奖设置不影响已生成结果。

### 3.5 迁移策略

1. 新字段允许为空或提供默认值，先部署兼容代码和迁移。
2. 仅对新建/未开始场次启用新状态机；历史 `FINISHED`/旧测试场次保持可读。
3. 迁移前备份 PostgreSQL；生产只执行 `prisma migrate deploy`，不执行 `down -v`。
4. 回滚应用镜像前确认旧代码可忽略新字段；数据库迁移不可用镜像回滚撤销。

## 4. 五秒轮询协议

### 4.1 状态接口

```http
GET /api/events/:id/state
Cache-Control: no-store
```

权限分层：主持/管理员返回完整控制快照；已登记宾客返回当前题、本人答题确认、个人分数和已揭晓结果；未登记访客只返回公开阶段，不返回题目答案或后台数据。

响应固定包含：

```json
{
  "eventId": "...",
  "phase": "QUESTION",
  "questionIndex": 3,
  "round": null,
  "version": 12,
  "serverTime": "2026-09-27T12:00:00.000Z",
  "pendingTransition": {
    "id": "...",
    "toPhase": "QUESTION",
    "toQuestionIndex": 4,
    "effectiveAt": "2026-09-27T12:00:08.000Z"
  },
  "me": {
    "participantId": "...",
    "answeredQuestionIds": ["..."],
    "totalScore": null
  }
}
```

页面行为：

- 首次打开、回到前台和网络重连立即请求一次；前台正常间隔为 5 秒。
- 同一页面最多一个在途状态请求；失败采用短暂指数退避，恢复后回到 5 秒。
- 请求相位可随机错开，避免 300 台设备同一毫秒集中请求。
- 仅接受 `version >= lastVersion` 的响应；旧响应不能覆盖新状态。
- 响应含 `serverTime`，客户端用 `performance.now()` 估算偏移，不依赖手机系统时间。
- 有 `pendingTransition` 时预加载必要 UI 数据但不提前切换；到 `effectiveAt` 才更新可见状态，并显示等待/loading。

### 4.2 明确禁止 SSE

本版本删除主持端和大屏对 `/api/events/admin`、`/api/events/screen` 的 SSE 依赖。不得把内存 live bus 作为页面状态正确性的来源；它即使保留用于服务内部日志，也不能改变页面状态。Caddy、Cloudflare Tunnel 和浏览器缓存配置不应承担状态通知职责。

## 5. 登记和宾客提交

登记页面改为两步本地表单：

1. 姓名、手机后四位、关系（朋友/双方亲友长辈）。
2. 是否带小朋友。

来源省市和孩子数量不再作为新流程必填项；历史字段可保留读取。登记成功签发不可预测的 `HttpOnly; Secure; SameSite=Lax` 参与凭证，服务端只保存哈希。开始第 1 题时关闭新登记；已登记者可刷新和重连。

`POST /api/events/:id/participants` 只绑定当前凭证或创建新凭证，不能以 body 的 `guestId` 冒认他人。姓名和尾号只用于展示/现场核对，不作为登录密码。

## 6. 答案异步保存与恢复

```http
POST /api/events/:id/answers
Idempotency-Key: <submissionId>
```

body 只含 `questionId` 和 `optionIndex`。服务器事务校验：场次、凭证、题目、当前阶段、收卷计划和唯一键。已成功写入的同一 `submissionId` 重试返回原结果；已关闭题目的新提交返回 `409 QUESTION_CLOSED`。

宾客端点选后立即显示选中态，并在 IndexedDB 写入待提交项：`eventId + participantId + questionId + submissionId + payload + retryCount`。页面异步发送并显示“保存中/已保存/重试中”，不阻塞全页；刷新、恢复前台和网络恢复时继续发送。服务端确认前不能显示“已保存”。切换身份时清理或隔离旧队列。

切题后仍可查询上一题是否成功入库，但不把仅存在本地的过期队列当成成绩。结算时服务器只按已落库答案计分，并将未答记 0；手机掉线不阻塞结算，但页面必须提示最终仍失败的提交。

## 7. 主持控制 API

```http
POST /api/events/:id/control
```

body：`{ action, expectedVersion, requestId }`，动作限定为：
`START`、`END_AND_NEXT`、`FINALIZE`、`REVEAL_NEXT`、`FINISH`、`RESUME_SETTLEMENT`。

要求：管理员认证、来源校验和 CSRF 防护；`requestId` 幂等；`expectedVersion` 条件更新；同一场次已有待生效计划时拒绝新的推进。响应包含持久化计划、`effectiveAt`、新版本和当前快照。控制接口不依赖 SSE，主持端按普通状态轮询确认生效。

## 8. 结算与五轮结果

`FINALIZE` 进入 `SETTLING`，在可重入事务/锁下：

1. 按题目正确选项从 `QuizAnswer` 重新计算每名参与者分数。
2. 将分数、`answeredCount`、`settledAt` 写入本场参与记录。
3. 按固定顺序生成五轮候选并持久化完整名单。
4. 同分使用持久化随机顺序；随机抽取使用 `crypto.randomInt` 的无放回算法，不使用随机排序。
5. 每轮排除此前已中奖者；候选不足时不跨组、不重复补，写入 `shortage` 和实际人数。

结果规则：

| 轮次 | 类型 | 候选 | 目标 |
| --- | --- | --- | ---: |
| 1 | `ELDER_TOP` | 长辈组总分降序，同分随机 | 10 |
| 2 | `FRIEND_TOP` | 朋友组总分降序，同分随机 | 5 |
| 3 | `ELDER_RANDOM` | 长辈组等概率无放回 | 20 |
| 4 | `FRIEND_RANDOM` | 朋友组等概率无放回 | 10 |
| 5 | `WITH_CHILD_RANDOM` | 带小朋友宾客，含两组 | 20 |

只有 `REVEAL_NEXT` 改变公开轮次；读取结果是 GET 无副作用，不能触发重新抽奖。宾客只可读当前及之前已揭晓轮次。

## 9. 大屏和页面边界

- `/screen` 只渲染活动场景：登记二维码/人数、当前题和选项、等待结算、当前揭晓轮次；答题时不叠加旧抽奖控制 UI。
- `/quiz` 只负责登记后的手机答题、保存状态、断线恢复和个人结果，不显示主持控制按钮。
- `/admin/quiz` 负责题目编辑、正确选项、发布、状态控制、结算和逐轮揭晓。
- `/admin/draw` 保留历史抽奖管理，但新答题活动读取冻结的五轮结果，不再手动重抽。
- 所有含身份/成绩/状态接口使用 `no-store`；静态脚本和背景图片可缓存。大屏背景与手机资源分开压缩。

## 10. 权限、幂等和错误恢复

- 管理控制、完整参与者列表和完整结果只对管理员开放。
- 宾客凭证只允许访问本场本人答案和授权结果；不接受任意 `guestId`。
- 题目开放响应不含正确答案；未揭晓结果不出现在宾客接口、日志或 HTML 中。
- 重复控制请求、重复答案请求和重复轮询均必须是幂等/只读的。
- 结算失败停留在 `SETTLING`，主持端显示恢复入口；恢复操作继续同一结果生成锁，不重算出第二份名单。
- 数据库不可用时页面显示离线/loading，不把本地 UI 状态冒充服务器成功。
- 应用重启、容器重建和 Tunnel 重连后，首次轮询必须恢复当前数据库状态。

## 11. 测试和验收

自动化测试至少覆盖：

1. 状态机所有合法转换、非法转换、版本冲突和计划重复。
2. `effectiveAt` 前后边界、旧响应覆盖保护和服务器时间校准。
3. 同一题重复提交、响应丢失重试、过期题目 `409`、IndexedDB 队列恢复。
4. 10 题计分、未答 0 分、正确答案不泄露、结算幂等。
5. 五轮顺序、同分随机稳定、跨轮不重复、候选不足和空池展示。
6. 管理员/宾客/未登记三类权限，CSRF、凭证隔离和缓存头。
7. 主持端、大屏、宾客端均只使用 5 秒轮询，不请求 SSE 路由。

容量验收：模拟 300 台设备持续 5 秒轮询至少 30 分钟，穿插每题 300 次集中提交，并测试同秒 300 次轮询 + 300 次提交。目标为状态/答案接口 p95 < 1 秒、5xx < 0.1%、已确认答案零丢失零重复；结算目标 < 5 秒，未达标时仍可恢复并展示结算中。目标需在实际公网和手机网络彩排中验证，不能仅由健康检查推断。

发布前运行仓库已有的 lint、typecheck、unit test、build、diff check 和发布 dry-run；完成微信内置浏览器、前后台切换、断网重连、16:9 大屏和 Cloudflare Tunnel 真机验证。

## 12. 发布和回滚约束

1. 先备份数据库和上传卷。
2. 先执行兼容迁移，再替换 app 镜像；不删除 PostgreSQL、uploads、backups 或 Tunnel 配置。
3. 生产只使用已构建镜像，不在活动服务器现场拉取基础镜像或构建。
4. 部署后检查 `state`、答案幂等、控制计划和大屏轮询；确认 app 健康后再开放二维码。
5. 应用镜像可回滚，但不可假设数据库迁移自动回滚；必要时准备显式反向迁移和数据备份恢复方案。

## 13. 实施边界

第一阶段实现本设计中的统一状态机、轮询协议、登记/答案幂等、结算和五轮结果；第二阶段补齐题目管理页面、大屏隔离、删除测试场次和压测工具。除非用户另行确认，不扩展为通用问卷平台或实时推送架构。
