# 婚礼同步答题与五轮结果 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有答题和抽奖流程改造成数据库驱动的统一婚礼活动流程，所有页面每 5 秒轮询并按 `effectiveAt` 一致切换，结算时冻结五轮中奖结果。

**Architecture:** Prisma/PostgreSQL 保存活动阶段、版本、待生效计划、答案和五轮结果快照；Next.js Route Handlers 提供状态轮询、答案提交和主持控制 API。客户端不使用 SSE，主持端、大屏和宾客端共享轻量状态响应，并以服务器时间校准后执行持久化计划。

**Tech Stack:** Next.js 16 Route Handlers、React 19、Prisma 7、PostgreSQL、Zod、Vitest、Playwright、浏览器 IndexedDB。

**Spec:** `docs/superpowers/specs/2026-09-27-wedding-flow-design.md`

## Global Constraints

- 活动阶段只能是 `REGISTRATION → QUESTION(1..10) → SETTLING → QUIZ_ENDED → RESULTS(1..5) → FINISHED`。
- 每题 10 分，总分 0–100；错答和未答为 0；同一宾客同一题第一次成功提交后锁定。
- 主持操作默认安排服务端当前时间后 8 秒的 `effectiveAt`，且每个场次最多一个待生效计划。
- 页面状态只能通过数据库快照轮询获得；前台正常轮询间隔为 5 秒，禁止使用 SSE 作为状态通知。
- 五轮结果在结算事务中一次生成并冻结：长辈前 10、朋友前 5、长辈随机 20、朋友随机 10、带小朋友随机 20；全局不重复。
- 生产迁移前备份数据库和上传卷；不执行 `docker compose down -v`；应用回滚不能假设迁移自动回滚。
- 不把正确答案、未揭晓名单、凭证或客户端分数发送给宾客。

## Review Focus

- 同一时刻两名主持人推进：必须只生成一个计划，测试版本冲突和重复 `requestId`。
- 轮询响应乱序或晚于 `effectiveAt`：旧版本不能回退页面，晚响应必须直接追上服务器状态。
- 答案请求响应丢失/断网：IndexedDB 重试返回原结果，不重复计分，切题后不接受新过期答案。
- 结算中途异常：恢复不会生成第二份五轮名单，空候选和候选不足仍可推进。
- 大屏和宾客端：没有 `EventSource` 请求，答题题面不混入抽奖控制界面，未揭晓答案不泄露。

### Task 1: Prisma 状态模型与兼容迁移

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260927120000_add_persistent_event_transitions_and_results/migration.sql`
- Modify: `src/modules/quiz/types.ts`
- Test: `tests/unit/quiz-schema.test.ts`

**Interfaces:**
- Produces `EventPhase`/transition/result TypeScript types，供后续服务和客户端使用。
- 保留旧枚举读取兼容；新场次使用统一阶段，历史已完成场次仍可查看。

- [ ] **Step 1: Write failing schema assertions** for the new phase values, `PendingTransition`, result round/winner records, `version`, `effectiveAt`, nullable pre-settlement score and indexes.
- [ ] **Step 2: Run `pnpm test:unit -- tests/unit/quiz-schema.test.ts`** and verify the assertions fail against the current schema.
- [ ] **Step 3: Add Prisma models/enums and migration** with nullable/default-safe columns, unique keys for one pending transition and one winner per event, and indexes for state polling and answer lookup.
- [ ] **Step 4: Update quiz view/error types** with phase, transition, server time, participant answer confirmation and result visibility types.
- [ ] **Step 5: Run `pnpm prisma validate` and the schema test**; expected: Prisma validation and all assertions pass.
- [ ] **Step 6: Commit** with `git add prisma src/modules/quiz/types.ts tests/unit/quiz-schema.test.ts && git commit -m "feat: persist wedding flow state and results"`.

### Task 2: Server-side state machine and five-second state contract

**Files:**
- Modify: `src/modules/quiz/service.ts`
- Modify: `src/modules/quiz/http.ts`
- Create: `src/modules/quiz/transition.ts`
- Create: `src/app/api/events/[id]/state/route.ts`
- Create: `src/app/api/events/[id]/results/route.ts`
- Test: `tests/unit/quiz-transition.test.ts`
- Test: `tests/integration/quiz-state-api.test.ts`

**Interfaces:**
- `getEventState(eventId: string, actor: StateActor): Promise<EventStateView>` returns `phase`, `version`, `serverTime`, `pendingTransition`, current question, `me`, and authorized revealed results.
- `scheduleTransition(input: { eventId: string; action: ControlAction; expectedVersion: number; requestId: string; actorId: string }): Promise<EventStateView>` creates or returns the idempotent persisted plan.
- `applyDueTransition(eventId: string, now?: Date): Promise<EventStateView>` applies a due plan with a conditional transaction.

- [ ] **Step 1: Write failing transition tests** covering legal transitions, illegal actions, expected-version conflicts, duplicate `requestId`, one-pending-plan enforcement, and `effectiveAt` due/not-due behavior.
- [ ] **Step 2: Run the transition tests** and verify failure because no persistent transition service exists.
- [ ] **Step 3: Implement `transition.ts`** with an 8-second default delay, transaction-level conditional updates, version increments, and audit events. It must not publish or subscribe to an in-memory bus.
- [ ] **Step 4: Refactor `service.ts` state reads** to return the new phase and transition snapshot while preserving read compatibility for existing admin pages during migration.
- [ ] **Step 5: Implement `GET /api/events/:id/state`** with `Cache-Control: no-store`, participant/admin authorization, server-time response, version filtering data, and no correct answer for guests.
- [ ] **Step 6: Implement `GET /api/events/:id/results`** so admins can read all frozen rounds and guests can read only `revealedAt` rounds; GET must have no draw side effect.
- [ ] **Step 7: Run API integration tests** for guest/admin/anonymous visibility and `no-store`; expected: PASS.
- [ ] **Step 8: Commit** with `git add src/modules/quiz src/app/api/events tests && git commit -m "feat: add persisted event state polling API"`.

### Task 3: Idempotent answer submission and settlement snapshot

**Files:**
- Modify: `src/modules/quiz/service.ts`
- Modify: `src/app/api/quiz/[id]/answer/route.ts`
- Modify: `src/app/api/quiz/answers/route.ts`
- Create: `src/modules/quiz/settlement.ts`
- Create: `src/modules/quiz/results.ts`
- Test: `tests/unit/quiz-settlement.test.ts`
- Test: `tests/integration/quiz-answer-idempotency.test.ts`

**Interfaces:**
- `submitEventAnswer(eventId: string, token: string, input: { questionId: string; optionIndex: number; submissionId: string }): Promise<AnswerReceipt>`.
- `settleEvent(eventId: string, actorId: string, requestId: string): Promise<SettlementView>`.
- `buildFrozenResults(participants: SettledParticipant[], ruleVersion: string): FrozenRound[]`.

- [ ] **Step 1: Write failing tests** for first-write locking, duplicate submission receipt, closed-question `409`, unanswered score 0, total 0–100, and no answer/candidate data leakage.
- [ ] **Step 2: Run answer and settlement tests** and verify current manual-submit/auto-close behavior fails the new contracts.
- [ ] **Step 3: Implement server answer validation** against the current persisted phase and due transition; bind participant solely from the HttpOnly token; enforce unique `(eventId, participantId, questionId)` and `submissionId` idempotency.
- [ ] **Step 4: Implement settlement** to recalculate scores from persisted answers inside a recoverable transaction, write `answeredCount`, `totalScore`, `settledAt`, and transition to `QUIZ_ENDED`.
- [ ] **Step 5: Implement frozen five-round generation** using persistent same-score order and `crypto.randomInt` without replacement; exclude previous winners and persist shortage/actual counts/candidate snapshots.
- [ ] **Step 6: Add control action handling** for `FINALIZE`, `REVEAL_NEXT`, and `FINISH`; repeated calls return the original plan/result and never reroll.
- [ ] **Step 7: Run integration tests** with response replay, settlement retry, empty pools, and insufficient pools; expected: PASS.
- [ ] **Step 8: Commit** with `git add src/modules/quiz src/app/api/quiz tests && git commit -m "feat: settle quiz and freeze five result rounds"`.

### Task 4: Replace SSE with shared five-second polling client

**Files:**
- Create: `src/lib/polling/useEventStatePolling.ts`
- Modify: `src/components/quiz/QuizHost.tsx`
- Modify: `src/components/quiz/QuizParticipant.tsx`
- Modify: `src/components/quiz/QuizProjector.tsx`
- Modify: `src/components/draw/ProjectorScene.tsx`
- Modify: `src/modules/live/snapshot.ts`
- Test: `tests/unit/polling-state.test.ts`
- Test: `tests/unit/no-sse-client.test.ts`

**Interfaces:**
- `useEventStatePolling({ eventId, actor, intervalMs = 5000, onState }): { state; loading; error; retryNow }`.
- `applyVersionedState(previous, next): State | previous` rejects older versions and returns a loading-safe state while a pending transition is waiting.

- [ ] **Step 1: Write failing hook/state tests** for immediate load, 5-second cadence, one in-flight request, retry/backoff, version ordering, server clock offset, and `effectiveAt` loading.
- [ ] **Step 2: Run tests** and verify no shared polling hook exists.
- [ ] **Step 3: Implement the polling hook** with `cache: no-store`, foreground/reconnect refresh, `performance.now()` offset estimation, and pending-transition countdown; never import `EventSource`.
- [ ] **Step 4: Refactor `QuizHost`** to poll the admin state/stats endpoint, use control plans, and show waiting/loading until the server plan becomes effective.
- [ ] **Step 5: Refactor `QuizProjector` and `ProjectorScene`** to poll snapshots every 5 seconds, remove all `EventSource` construction/listeners, and keep quiz and draw layers mutually exclusive.
- [ ] **Step 6: Add a regression test scanning these client files** for `EventSource` and SSE route references; expected: no matches.
- [ ] **Step 7: Commit** with `git add src/lib/polling src/components/quiz src/components/draw src/modules/live tests && git commit -m "refactor: use five-second polling for event state"`.

### Task 5: IndexedDB answer queue and guest answer UI

**Files:**
- Create: `src/modules/quiz/answer-queue.ts`
- Modify: `src/components/quiz/QuizParticipant.tsx`
- Modify: `src/components/quiz/QuizLobby.tsx`
- Modify: `src/components/quiz/QuizTimer.tsx`
- Test: `tests/unit/quiz-answer-queue.test.ts`
- Test: `tests/unit/quiz-participant.test.tsx`

**Interfaces:**
- `enqueueAnswer(item: PendingAnswer): Promise<void>`.
- `flushAnswerQueue(send): Promise<QueueFlushResult>`.
- `removeAnswer(eventId, participantId, questionId, submissionId): Promise<void>`.

- [ ] **Step 1: Write failing IndexedDB tests** for enqueue, refresh recovery, successful removal, retry after network failure, and event/participant isolation.
- [ ] **Step 2: Run queue tests** and verify failure in the current in-memory/manual-submit flow.
- [ ] **Step 3: Implement a small IndexedDB store** with an in-memory fallback only for browsers without IndexedDB in tests; queue records must include event, participant, question, submission ID, payload and retry count.
- [ ] **Step 4: Change option selection to enqueue and asynchronously POST**; show “保存中/已保存/重试中”, lock the question after server success, and remove the separate blocking submit button.
- [ ] **Step 5: Flush on initial load, every poll, `online`, `visibilitychange`, and before final settlement; display unresolved failures without treating them as saved.
- [ ] **Step 6: Add mobile layout tests** proving options are separate clickable controls, not an unclickable inline row, and a submitted answer cannot be changed.
- [ ] **Step 7: Commit** with `git add src/modules/quiz/answer-queue.ts src/components/quiz tests && git commit -m "feat: queue guest answers for resilient async submission"`.

### Task 6: Registration handoff and event participant binding

**Files:**
- Modify: `src/modules/registration/schema.ts`
- Modify: `src/modules/registration/service.ts`
- Modify: `src/components/join/RegistrationWizard.tsx`
- Modify: `src/components/join/RegistrationSuccess.tsx`
- Modify: `src/components/join/IdentityStep.tsx`
- Modify: `src/components/join/ChildrenStep.tsx`
- Modify: `src/components/join/OriginStep.tsx`
- Modify: `src/app/api/quiz/current/route.ts`
- Test: `tests/unit/registration-quiz-handoff.test.tsx`
- Test: `tests/integration/registration-lock.test.ts`

**Interfaces:**
- Registration returns a reusable participant credential and an explicit event/session status; it must not silently bypass registration.
- `getCurrentEventForParticipant(token)` returns only a session in registration or active quiz phases.

- [ ] **Step 1: Write failing tests** for two-step registration, all four relation/children combinations, registration closure at question start, and `/quiz` access with/without the same credential.
- [ ] **Step 2: Run registration tests** and verify current three-step/origin flow and automatic legacy session selection fail the new expectations.
- [ ] **Step 3: Update schema validation and wizard UI** to use the two confirmed relationship groups and independent children tag while preserving historical fields for existing records.
- [ ] **Step 4: Bind current event lookup and participant creation** to the registration token and reject new registrations after the first question plan is scheduled.
- [ ] **Step 5: Update success/lobby loading copy and redirect** so the participant waits for the server phase and never receives a false “not registered” state.
- [ ] **Step 6: Run unit/integration tests and commit** with `git add src/modules/registration src/components/join src/app/api/quiz/current tests && git commit -m "fix: bind quiz access to completed registration"`.

### Task 7: Admin question settings and host controls

**Files:**
- Modify: `src/components/quiz/QuizHost.tsx`
- Modify: `src/components/quiz/QuizQuestionSettings.tsx`
- Modify: `src/app/api/quiz/[id]/questions/[questionId]/route.ts`
- Create: `src/app/api/events/[id]/control/route.ts`
- Modify: `src/app/(staff)/admin/quiz/page.tsx`
- Modify: `src/modules/quiz/config.ts`
- Modify: `src/modules/quiz/defaults.ts`
- Test: `tests/unit/quiz-control.test.ts`
- Test: `tests/unit/quiz-defaults.test.ts`

**Interfaces:**
- Control route accepts `{ action, expectedVersion, requestId }` and returns a persisted plan/state snapshot.
- Question settings support exactly 10 enabled questions before `START`; correct option remains admin-only.

- [ ] **Step 1: Write failing tests** for ten-question publish validation, editable correct options before start, locked questions after start, and control action idempotency.
- [ ] **Step 2: Run tests** and verify current per-route `start/close/reveal/advance/finish` controls do not expose the unified plan contract.
- [ ] **Step 3: Replace default questions with the confirmed ten-question seed**, including questions 8–10; preserve user-edited answers and do not mutate existing sessions.
- [ ] **Step 4: Implement the unified control route** and map old admin buttons to the new action names during the compatibility period.
- [ ] **Step 5: Update host UI** to show current phase, pending effective time, loading, settlement retry, and reveal-next controls; remove “收到响应立即切题”.
- [ ] **Step 6: Run control/default tests and commit** with `git add src/app src/components/quiz src/modules/quiz tests && git commit -m "feat: add planned host controls and ten quiz defaults"`.

### Task 8: Separate quiz projector and result projector output

**Files:**
- Modify: `src/modules/live/snapshot.ts`
- Modify: `src/app/api/screen/route.ts`
- Modify: `src/components/quiz/QuizProjector.tsx`
- Modify: `src/components/draw/ProjectorScene.tsx`
- Modify: `src/components/draw/projector-state.ts`
- Modify: `src/app/screen/page.tsx`
- Modify: `src/app/quiz/screen/page.tsx`
- Test: `tests/unit/projector-flow.test.ts`

**Interfaces:**
- Screen snapshots contain one active scene (`registration`, `quiz`, `settling`, `results`, `idle`) and never both quiz and draw content as active layers.
- Public screen data contains only the current question or revealed round, not future answers/results.

- [ ] **Step 1: Write failing snapshot tests** for quiz scene isolation, settling loading, result round visibility, and refresh restoration.
- [ ] **Step 2: Run tests** and verify current snapshot queries both latest quiz and latest draw round simultaneously.
- [ ] **Step 3: Refactor `getScreenSnapshot`** to derive one scene from the event phase and return redacted, no-store data.
- [ ] **Step 4: Update both projector components** to render mutually exclusive scene markup and use only five-second polling.
- [ ] **Step 5: Verify 16:9 layout and mobile guest option layout** with Playwright screenshots; expected: no overlapping quiz/draw layers and clickable options.
- [ ] **Step 6: Commit** with `git add src/modules/live src/app/screen src/app/quiz/screen src/components/draw src/components/quiz tests && git commit -m "fix: isolate quiz and results projector scenes"`.

### Task 9: End-to-end verification, deployment dry run, and handoff

**Files:**
- Create: `tests/integration/wedding-flow.e2e.test.ts`
- Modify: `docs/QUIZ_OPERATIONS.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/DELIVERY_HANDOFF.md`
- Modify: `scripts/` only if a repeatable polling/300-client load probe is needed

**Interfaces:**
- The test fixture can create an event, register participants, progress plans, settle, reveal rounds and assert the public redaction boundary.

- [ ] **Step 1: Add an end-to-end test** covering registration, ten answers, 5-second/pending transition behavior, refresh recovery, settlement and five-round reveal without duplicate winners.
- [ ] **Step 2: Add a 300-client load probe** that performs staggered 5-second state polling and synchronized answer posts without using SSE.
- [ ] **Step 3: Run `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, and `git diff --check`**; expected: all pass.
- [ ] **Step 4: Run the Docker production dry run** with an existing database backup, apply migrations, verify health/state/answer endpoints and ensure no volume deletion.
- [ ] **Step 5: Update operations and handoff docs** with the new polling-only flow, migration order, rollback limitations, host controls, and troubleshooting.
- [ ] **Step 6: Commit verification/docs** with `git add tests docs scripts && git commit -m "test: verify polling wedding flow and deployment"`.

## Self-Review Notes

- The plan covers every design section: state machine (Tasks 1–2), polling/effectiveAt (Tasks 2 and 4), IndexedDB (Task 5), registration (Task 6), results (Task 3), projector isolation (Task 8), security/idempotency (Tasks 2–3/7), capacity/deployment (Task 9).
- No task introduces SSE; the existing SSE routes can remain temporarily unreachable for compatibility, but no page or state contract may call them.
- All downstream interfaces are named before use, and each task includes a failing test, implementation, verification and commit.
- Historical sessions and old draw records remain readable; only new events use the new state machine and frozen-result tables.
