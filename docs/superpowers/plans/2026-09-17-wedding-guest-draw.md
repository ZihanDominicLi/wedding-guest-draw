# Wedding Guest Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a single-wedding system that registers up to 500 on-site guests, assigns one primary draw group plus tags, provides live administration, and runs auditable group-based prize drawings on a synchronized projector screen.

**Architecture:** One Next.js application owns registration, administration, rules, drawing, live SSE updates, and the projector UI. PostgreSQL is the source of truth; browser storage is used only for an unfinished guest form draft. Drawing is transactional and server-authoritative, while Three.js renders the already-persisted result.

**Tech Stack:** Node.js 24+, pnpm 9, Next.js App Router, TypeScript, PostgreSQL, Prisma, Better Auth, Argon2, Zod, React Hook Form, json-rules-engine, Recharts, qrcode.react, Three.js, Tailwind CSS, shadcn/ui primitives, Lucide, Vitest, Playwright, k6, Docker Compose, Caddy.

**Spec:** `docs/superpowers/specs/2026-09-17-wedding-guest-draw-design.md`

## Global Constraints

- One adult registration creates one lottery candidate; children are counts only.
- A guest has exactly one primary group and zero or more tags.
- The public dedupe key is normalized name plus phone last four digits with collision discriminator `0`.
- A locked manual group assignment survives rule recalculation.
- One guest may have at most one non-revoked winner record across the wedding.
- Public traffic enters through HTTPS on ports 80/443 only; PostgreSQL stays private.
- The projector never receives phone digits, child counts, origin details, or draw mutation permissions.
- No Redis, n8n, external form platform, multi-tenancy, weighted drawing, or predetermined winners.
- UI copy is Chinese-first; identifiers, source comments, and commits use English.
- Every task follows red-green-refactor and ends with focused verification and a commit.

## File Map

```text
src/
  app/
    (public)/join/                 guest wizard
    (staff)/admin/                 dashboard, guests, rules, prizes, audit
    (staff)/draw/                  operator console
    screen/                        read-only projector
    api/                           registration, admin, draw, events, health
  components/
    join/                          mobile wizard steps
    admin/                         dense operational UI
    draw/                          console controls and projector scene
    ui/                            shared primitives
  lib/
    auth.ts                        Better Auth configuration
    db.ts                          Prisma singleton
    env.ts                         validated environment
    http.ts                        response/error helpers
    idempotency.ts                 idempotent write helper
  modules/
    registration/                 validation, normalization, dedupe, service
    grouping/                     rule schema, evaluation, preview, recalc
    guests/                        queries, mutation, export
    drawing/                       eligibility, state machine, random draw
    live/                          SSE event bus and snapshots
    audit/                         append-only audit service
    backup/                        emergency export and pg_dump runner
prisma/
  schema.prisma                    persisted model and constraints
  seed.ts                          settings, groups, default rules, admin
tests/
  unit/                            pure domain tests
  integration/                     PostgreSQL-backed service/API tests
  e2e/                             browser workflows
  load/                            k6 registration scenario
deploy/
  Caddyfile                        HTTPS reverse proxy
  backup.sh                        scheduled PostgreSQL and upload backup
```

---

### Task 1: Application Foundation and Test Harness

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `playwright.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/lib/env.ts`, `src/lib/http.ts`
- Create: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `env` with `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WEDDING_DOMAIN`.
- Produces: `ok(data, init?)` and `problem(status, code, message, details?)` JSON response helpers.

- [ ] **Step 1: Scaffold the pinned application and install runtime/test dependencies**

Run `pnpm create next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias '@/*' --use-pnpm`, preserving `docs/` and `.gitignore`. Install Prisma, Better Auth, Argon2, Zod, React Hook Form, json-rules-engine, Recharts, qrcode.react, Three.js, Lucide, Vitest, Testing Library, Playwright, and k6 documentation scripts.

- [ ] **Step 2: Write the failing environment test**

```ts
it("rejects a short auth secret", () => {
  expect(() => parseEnv({ ...validEnv, BETTER_AUTH_SECRET: "short" }))
    .toThrow(/BETTER_AUTH_SECRET/);
});
```

- [ ] **Step 3: Run the focused test and confirm failure**

Run: `pnpm vitest run tests/unit/env.test.ts`

Expected: FAIL because `parseEnv` does not exist.

- [ ] **Step 4: Implement validated environment and response helpers**

```ts
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
  WEDDING_DOMAIN: z.string().min(1),
});
export const parseEnv = (input: Record<string, string | undefined>) => envSchema.parse(input);
```

- [ ] **Step 5: Add scripts and verify the clean shell**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run && pnpm build`

Expected: all commands pass and `/` renders a minimal product entry page.

- [ ] **Step 6: Commit foundation**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts playwright.config.ts src tests
git commit -m "chore: scaffold wedding guest draw app"
```

### Task 2: Database Schema, Seed, and Administrator Authentication

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/*`
- Create: `src/lib/db.ts`, `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`
- Create: `src/app/(auth)/login/page.tsx`, `src/middleware.ts`
- Test: `tests/integration/schema.test.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- Produces: Prisma models named in the spec, including `Guest`, `Group`, `Tag`, `GroupingRule`, `Prize`, `DrawRound`, `DrawCandidateSnapshot`, `Winner`, `AuditEvent`, `WeddingSettings`.
- Produces: `requireAdmin(headers): Promise<SessionUser>` and Better Auth route handlers.

- [ ] **Step 1: Write schema invariant tests**

```ts
it("rejects duplicate public guest keys", async () => {
  await createGuest({ normalizedName: "张三", phoneLast4: "1234", collisionDiscriminator: 0 });
  await expect(createGuest({ normalizedName: "张三", phoneLast4: "1234", collisionDiscriminator: 0 }))
    .rejects.toMatchObject({ code: "P2002" });
});
```

Add a PostgreSQL-backed test that two non-revoked `Winner` rows for one guest violate the partial unique index.

- [ ] **Step 2: Run integration tests and confirm failure**

Run: `pnpm test:integration -- schema.test.ts`

Expected: FAIL because Prisma schema and database do not exist.

- [ ] **Step 3: Implement the Prisma schema and SQL-only constraints**

Use enums for relation, round status, and winner status. Add migrations for the public dedupe composite unique index and this PostgreSQL partial index:

```sql
CREATE UNIQUE INDEX "Winner_one_active_per_guest"
ON "Winner" ("guestId")
WHERE "status" IN ('RESERVED', 'PUBLISHED');
```

- [ ] **Step 4: Seed wedding defaults and groups**

Seed the six confirmed groups and default rules in priority order. Seed one admin using `ADMIN_EMAIL` and `ADMIN_PASSWORD`; hash with Argon2 through Better Auth password hooks. Make the seed idempotent.

- [ ] **Step 5: Implement authentication and protected route middleware**

Allow `/join`, `/screen`, `/api/registration`, `/api/events/screen`, and `/api/health` publicly. Require an authenticated admin for `/admin`, `/draw`, and all mutation APIs under `/api/admin` and `/api/draw`.

- [ ] **Step 6: Verify schema and login flow**

Run: `pnpm prisma migrate reset --force && pnpm test:integration -- schema.test.ts && pnpm playwright test tests/e2e/auth.spec.ts`

Expected: constraints pass; unauthenticated `/admin` redirects to `/login`; seeded admin can log in.

- [ ] **Step 7: Commit persistence and auth**

```bash
git add prisma src/lib/db.ts src/lib/auth.ts src/app/api/auth src/app/'(auth)' src/middleware.ts tests
git commit -m "feat: add persistence and admin authentication"
```

### Task 3: Registration and Grouping Domain

**Files:**
- Create: `src/modules/registration/schema.ts`, `normalize.ts`, `service.ts`
- Create: `src/modules/grouping/defaults.ts`, `rule-schema.ts`, `engine.ts`, `service.ts`
- Create: `src/app/api/registration/route.ts`
- Test: `tests/unit/registration.test.ts`, `tests/unit/grouping.test.ts`, `tests/integration/registration.test.ts`

**Interfaces:**
- Produces: `normalizeGuestName(name: string): string`.
- Produces: `registerGuest(input, idempotencyKey): Promise<RegistrationResult>`.
- Produces: `evaluateGrouping(facts, rules): Promise<{ primaryGroupKey: string | null; tags: string[]; ruleId: string | null }>`.
- Produces: `previewRecalculation(ruleSetId): Promise<GroupChangePreview>` and `applyRecalculation(ruleSetId, actorId): Promise<RecalculationResult>`.

- [ ] **Step 1: Write normalization, validation, and priority tests**

```ts
expect(normalizeGuestName("  张 三  ")).toBe("张三");
expect(registrationSchema.safeParse({ name: "张三", phoneLast4: "12x4" }).success).toBe(false);
expect((await evaluateGrouping({ childCount: 1, isOutOfTown: true, relation: "GROOM_FRIEND" }, rules)).primaryGroupKey)
  .toBe("family-with-children");
```

Add a test that an out-of-town child guest keeps both `with-children` and `out-of-town` tags.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm vitest run tests/unit/registration.test.ts tests/unit/grouping.test.ts`

Expected: FAIL because domain functions do not exist.

- [ ] **Step 3: Implement pure normalization and grouping evaluation**

Persist rule conditions in the json-rules-engine shape. Sort by priority descending and use the first group event; evaluate tag events independently. Never use `eval` or executable expressions from the database.

- [ ] **Step 4: Write integration tests for idempotent registration**

Test first submit, same idempotency key retry, same dedupe key update, a new unique guest, and a grouping failure that creates an ungrouped exception.

- [ ] **Step 5: Implement transactional registration**

Within one transaction: validate, normalize, derive `isOutOfTown`, evaluate grouping, upsert public discriminator `0`, replace derived tags, append audit event, and persist idempotent response. Never log `phoneLast4`.

- [ ] **Step 6: Verify registration domain**

Run: `pnpm vitest run tests/unit/registration.test.ts tests/unit/grouping.test.ts && pnpm test:integration -- registration.test.ts`

Expected: all cases pass.

- [ ] **Step 7: Commit registration and rules domain**

```bash
git add src/modules/registration src/modules/grouping src/app/api/registration tests
git commit -m "feat: register and group wedding guests"
```

### Task 4: Wedding Settings, QR Code, and Mobile Registration Wizard

**Files:**
- Create: `src/app/(public)/join/page.tsx`, `src/components/join/RegistrationWizard.tsx`, `IdentityStep.tsx`, `ChildrenStep.tsx`, `OriginStep.tsx`, `RegistrationSuccess.tsx`
- Create: `src/app/(staff)/admin/settings/page.tsx`, `src/app/api/admin/settings/route.ts`
- Create: `src/components/admin/QrDownload.tsx`
- Test: `tests/e2e/registration.spec.ts`, `tests/unit/join-draft.test.ts`

**Interfaces:**
- Consumes: `POST /api/registration` and settings.
- Produces: local draft key `wedding-registration-draft:v1` and downloadable QR PNG targeting canonical `/join`.

- [ ] **Step 1: Write failing wizard tests**

Cover validation, draft restoration, conditional child count, province/city selection, final confirmation, successful group display, and retry without duplicate creation.

- [ ] **Step 2: Run browser test and confirm failure**

Run: `pnpm playwright test tests/e2e/registration.spec.ts`

Expected: FAIL because `/join` does not exist.

- [ ] **Step 3: Implement settings API and admin settings page**

Support couple names, wedding date, venue province/city, registration open flag, and one background image stored in a persistent upload directory. Regenerating QR must always use `BETTER_AUTH_URL` plus `/join`, never the request Host header.

- [ ] **Step 4: Implement the three-step mobile wizard**

Use large controls, stable step dimensions, explicit progress, and one topic per screen. Save after every valid step. On submit, send a UUID idempotency key and keep the draft until a successful response.

- [ ] **Step 5: Verify mobile layouts and accessibility**

Run Playwright at 320×568, 390×844, and 430×932. Assert no horizontal overflow, focus order, visible validation text, 44px minimum interactive height, and successful keyboard submission.

- [ ] **Step 6: Commit public registration UI**

```bash
git add src/app/'(public)' src/components/join src/app/'(staff)'/admin/settings src/app/api/admin/settings src/components/admin/QrDownload.tsx tests
git commit -m "feat: add guided on-site registration"
```

### Task 5: Guest Administration and Rule Recalculation UI

**Files:**
- Create: `src/modules/guests/service.ts`, `export.ts`
- Create: `src/app/api/admin/guests/route.ts`, `src/app/api/admin/guests/[id]/route.ts`
- Create: `src/app/api/admin/grouping/preview/route.ts`, `apply/route.ts`
- Create: `src/app/(staff)/admin/guests/page.tsx`, `src/app/(staff)/admin/rules/page.tsx`
- Create: `src/components/admin/GuestTable.tsx`, `GuestEditor.tsx`, `RuleEditor.tsx`, `RuleImpactDialog.tsx`
- Test: `tests/integration/group-recalculation.test.ts`, `tests/e2e/admin-guests.spec.ts`

**Interfaces:**
- Produces: paged/filterable `listGuests(query)`; `updateGuest(id, patch, actor)`; `createCollisionGuest(input, actor)`.
- Consumes: grouping preview/apply services from Task 3.

- [ ] **Step 1: Write failing locked-group and collision tests**

Assert recalculation changes unlocked guests only; manual assignment sets `groupLocked`; an admin-created collision increments the discriminator and preserves both rows.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm test:integration -- group-recalculation.test.ts`

Expected: FAIL because administration services do not exist.

- [ ] **Step 3: Implement guest query/mutation services and APIs**

Support query, primary group, tag, status, exception, and pagination filters. Audit every edit, disable, split, manual group, lock, and unlock action with before/after JSON that excludes phone digits. The normal guest CSV includes display name, relation, child count, origin province/city, primary group, tags, eligibility, and timestamps; it omits phone digits and device hashes.

- [ ] **Step 4: Implement rules editor with mandatory impact preview**

Saving rule definitions creates a new rule-set version. “Apply” stays disabled until preview is current. The dialog shows per-group before/after counts and a paged affected guest list.

- [ ] **Step 5: Implement dense guest table**

Use stable columns, filters, status indicators, row actions, and a side dialog. Do not nest cards or put editing controls on the dashboard.

- [ ] **Step 6: Verify admin workflows and commit**

Run: `pnpm test:integration -- group-recalculation.test.ts && pnpm playwright test tests/e2e/admin-guests.spec.ts`.

```bash
git add src/modules/guests src/app/api/admin src/app/'(staff)'/admin/guests src/app/'(staff)'/admin/rules src/components/admin tests
git commit -m "feat: manage guests and grouping rules"
```

### Task 6: Live Event Bus and Operations Dashboard

**Files:**
- Create: `src/modules/live/bus.ts`, `snapshot.ts`, `protocol.ts`
- Create: `src/app/api/events/admin/route.ts`, `src/app/api/events/screen/route.ts`
- Create: `src/app/(staff)/admin/page.tsx`, `src/components/admin/OperationsDashboard.tsx`, `RegistrationTrend.tsx`, `GroupDistribution.tsx`, `AttentionQueue.tsx`
- Test: `tests/unit/live-bus.test.ts`, `tests/e2e/dashboard-live.spec.ts`

**Interfaces:**
- Produces: `publishLiveEvent(event)` and `subscribeLiveEvents(scope, lastEventId)`.
- Produces event union: `guest.changed`, `grouping.changed`, `round.changed`, `screen.presence`, `health.changed`.

- [ ] **Step 1: Write failing replay and redaction tests**

Assert monotonically increasing IDs, bounded replay, full-snapshot fallback, and that screen-scope payloads cannot contain phone or origin keys.

- [ ] **Step 2: Implement bounded in-process event bus and SSE routes**

Keep the latest 500 events, send heartbeat comments every 15 seconds, close subscriptions on abort, and authorize admin scope. Screen scope exposes only public round state and connection identity.

- [ ] **Step 3: Implement operations dashboard queries and live updates**

Render total guests, child count, out-of-town count, exceptions, group distribution, 60-minute registration trend, database health, and projector connection age. Use quiet status colors and compact headings.

- [ ] **Step 4: Verify live behavior and commit**

Run: `pnpm vitest run tests/unit/live-bus.test.ts && pnpm playwright test tests/e2e/dashboard-live.spec.ts`.

```bash
git add src/modules/live src/app/api/events src/app/'(staff)'/admin/page.tsx src/components/admin tests
git commit -m "feat: add live operations dashboard"
```

### Task 7: Server-Authoritative Drawing Engine

**Files:**
- Create: `src/modules/drawing/types.ts`, `eligibility.ts`, `random.ts`, `service.ts`
- Create: `src/app/api/draw/rounds/route.ts`, `src/app/api/draw/rounds/[id]/lock/route.ts`, `draw/route.ts`, `publish/route.ts`, `cancel/route.ts`, `revoke/route.ts`
- Test: `tests/unit/random-draw.test.ts`, `tests/integration/drawing.test.ts`, `tests/integration/drawing-concurrency.test.ts`

**Interfaces:**
- Produces: `sampleWithoutReplacement<T>(items: readonly T[], count: number, randomInt): T[]`.
- Produces: `lockRound`, `drawRound`, `publishRound`, `cancelRound`, `revokeWinner` with expected-version and idempotency arguments.

- [ ] **Step 1: Write pure random selection tests**

Assert no mutation, no duplicates, count bounds, deterministic injected RNG, and rejection when count exceeds candidates.

- [ ] **Step 2: Write state-machine and eligibility integration tests**

Cover disabled/ungrouped/already-reserved guests, immutable snapshots, `PREPARING → LOCKED → DRAWN → PUBLISHED`, cancellation release, revocation, stale version rejection, and audit entries.

- [ ] **Step 3: Write a concurrent draw test**

Start two round draws against overlapping candidates and assert the partial winner index plus transaction retry produces disjoint winners or a clear `409 DRAW_CONFLICT`, never duplicate winners.

- [ ] **Step 4: Implement selection and transactional services**

Use `crypto.randomInt`, a partial Fisher-Yates shuffle, serializable transactions, row version checks, candidate snapshots, `RESERVED` winner rows, and append-only audits. APIs return persisted results only.

- [ ] **Step 5: Verify drawing invariants**

Run: `pnpm vitest run tests/unit/random-draw.test.ts && pnpm test:integration -- drawing.test.ts drawing-concurrency.test.ts`.

- [ ] **Step 6: Commit drawing engine**

```bash
git add src/modules/drawing src/app/api/draw tests
git commit -m "feat: add transactional group drawing"
```

### Task 8: Prize Administration, Draw Console, and Projector Screen

**Files:**
- Create: `src/app/(staff)/admin/prizes/page.tsx`, `src/app/(staff)/draw/page.tsx`, `src/app/screen/page.tsx`
- Create: `src/components/draw/DrawConsole.tsx`, `CandidateSummary.tsx`, `RoundControls.tsx`, `ProjectorScene.tsx`, `WinnerReveal.tsx`
- Create: `src/app/api/admin/prizes/route.ts`, `src/app/api/admin/prizes/[id]/route.ts`
- Test: `tests/e2e/draw-flow.spec.ts`, `tests/unit/projector-state.test.ts`

**Interfaces:**
- Consumes: drawing APIs and screen SSE protocol.
- Produces: read-only projector state reducer that restores `LOCKED`, `DRAWN`, and `PUBLISHED` states from a server snapshot.

- [ ] **Step 1: Write failing end-to-end draw test**

Seed guests in two groups, configure a prize, lock one group, draw two names, verify projector reveal, publish, then verify the next round excludes those names.

- [ ] **Step 2: Implement prize CRUD and operator console**

Prize CRUD supports name, image upload, allowed groups, planned winner count, order, and enabled state. Store validated JPEG/PNG/WebP files in the persistent upload directory and delete replaced files only after the database update succeeds. The console requires prize, allowed group, count, connected screen status, and candidate count. Destructive actions use confirmation dialogs; controls have fixed dimensions and disable during requests.

- [ ] **Step 3: Implement full-bleed Three.js projector scene**

Use the uploaded wedding photo as the visible full-screen background. Render candidate names in a subtle moving field during `LOCKED`, stop movement after persisted `DRAWN`, and reveal winner names centered with prize/group secondary. Support reduced motion with a direct fade reveal.

- [ ] **Step 4: Add reconnect and refresh restoration**

On load and after SSE reconnect, fetch the public screen snapshot. Never run random selection in the browser. Ignore events older than the current round version.

- [ ] **Step 5: Verify desktop/projector rendering**

Run Playwright at 1366×768, 1920×1080, and 2560×1080. Assert WebGL canvas has non-uniform pixels, winner text fits, no controls appear, and refresh keeps the same winner.

- [ ] **Step 6: Commit draw experience**

```bash
git add src/app/'(staff)'/admin/prizes src/app/'(staff)'/draw src/app/screen src/components/draw src/app/api/admin/prizes tests
git commit -m "feat: add draw console and ceremony screen"
```

### Task 9: Audit, Export, Backup, and Health Operations

**Files:**
- Create: `src/modules/audit/service.ts`, `redact.ts`
- Create: `src/modules/backup/service.ts`, `emergency-export.ts`
- Create: `src/app/api/admin/audit/route.ts`, `src/app/api/admin/export/route.ts`, `src/app/api/admin/backup/route.ts`, `src/app/api/health/route.ts`
- Create: `src/app/(staff)/admin/audit/page.tsx`, `src/app/(staff)/admin/operations/page.tsx`
- Create: `deploy/backup.sh`
- Test: `tests/unit/redaction.test.ts`, `tests/integration/operations.test.ts`

**Interfaces:**
- Produces: `appendAudit`, `redactAuditPayload`, `buildEmergencyCsv`, `runBackup`, `getHealth`.

- [ ] **Step 1: Write redaction and export tests**

Assert audit/export payloads omit `phoneLast4`, device hashes, password/session data, and child/origin details from screen scope. Emergency CSV contains guest ID, display name, primary group, eligibility, and winner state only.

- [ ] **Step 2: Implement append-only audit and operations APIs**

Do not expose update/delete audit APIs. Require recent authentication for exports, backup triggers, and winner revocation. Stream CSV with UTF-8 BOM for Chinese Excel compatibility.

- [ ] **Step 3: Implement backups and health**

Run `pg_dump --format=custom`, calculate SHA-256, copy uploads manifest, and write a JSON metadata file. Before a round can move from `PREPARING` to `LOCKED` in formal mode, request a fresh backup; a failure blocks locking unless an administrator explicitly overrides it with a reason that is written to the audit log. Health returns `200` only when the app and a simple database query succeed.

- [ ] **Step 4: Verify operations and commit**

Run: `pnpm vitest run tests/unit/redaction.test.ts && pnpm test:integration -- operations.test.ts && shellcheck deploy/backup.sh`.

```bash
git add src/modules/audit src/modules/backup src/app/api/admin src/app/api/health src/app/'(staff)'/admin/audit src/app/'(staff)'/admin/operations deploy tests
git commit -m "feat: add audit and recovery operations"
```

### Task 10: Security Hardening and Recovery Behavior

**Files:**
- Create: `src/lib/csrf.ts`, `src/lib/rate-limit.ts`, `src/lib/idempotency.ts`
- Modify: all public/admin mutation route handlers
- Create: `tests/integration/security.test.ts`, `tests/e2e/recovery.spec.ts`

**Interfaces:**
- Produces: `assertSameOrigin(request)`, `consumeRateLimit(bucket)`, `withIdempotency(scope, key, operation)`.

- [ ] **Step 1: Write failing security tests**

Cover cross-origin admin mutation, missing idempotency key, malformed phone digits, oversized names, registration flood, session expiry, and sensitive-value absence from structured logs.

- [ ] **Step 2: Implement same-origin checks, rate limits, and idempotency storage**

Use database-backed fixed-window registration limits so restarts do not clear abuse state. Trust proxy IP only from Caddy. Return stable problem codes and `Retry-After`.

- [ ] **Step 3: Write and pass recovery tests**

Simulate a timed-out registration replay and a screen reconnect after `DRAWN`. Assert one guest record, one winner result, and restoration without reroll.

- [ ] **Step 4: Run security verification and commit**

Run: `pnpm test:integration -- security.test.ts && pnpm playwright test tests/e2e/recovery.spec.ts && pnpm audit --prod`.

```bash
git add src/lib src/app/api tests
git commit -m "fix: harden public and admin workflows"
```

### Task 11: Production Deployment, Load Test, and Final Acceptance

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, `.env.example`
- Create: `tests/load/registration.js`, `scripts/seed-demo.ts`, `scripts/reset-event.ts`
- Create: `README.md`, `docs/DEPLOYMENT.md`, `docs/REHEARSAL.md`, `THIRD_PARTY_NOTICES.md`
- Modify: `package.json`

**Interfaces:**
- Produces: one-command `docker compose up -d --build`, demo seeding, event reset, scheduled backup, and documented restore.

- [ ] **Step 1: Add production container and Compose stack**

Use a multi-stage Node 24 image, non-root runtime user, health checks, private PostgreSQL network, persistent database/upload/backup volumes, and Caddy ports 80/443 only.

- [ ] **Step 2: Add deterministic demo data and safe reset commands**

`pnpm seed:demo` creates 100 synthetic guests across all groups. `pnpm event:reset --confirm RESET_TEST_EVENT` deletes test rounds/guests only and preserves settings/admin accounts.

- [ ] **Step 3: Add load and browser acceptance tests**

The k6 scenario ramps to 100 virtual users and completes 500 unique registrations within five minutes, with p95 request duration under 1 second and error rate below 1% on the target server class.

- [ ] **Step 4: Document deployment and rehearsal**

Document DNS, firewall, `.env`, first login, background upload, QR printing, backup schedule, restore commands, projector setup, complete rehearsal, emergency CSV, and final test-data reset.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm vitest run
pnpm test:integration
pnpm playwright test
pnpm build
docker compose config
docker compose up -d --build
curl --fail http://localhost:3000/api/health
k6 run tests/load/registration.js
docker compose down
```

Expected: all checks pass; health is `200`; load thresholds pass; no containers remain running after the final command.

- [ ] **Step 6: Inspect production UI screenshots**

Capture and inspect `/join`, `/admin`, `/draw`, and `/screen` on required mobile/desktop/projector viewports. Confirm real background image rendering, nonblank Three.js canvas, no overlap, no horizontal overflow, and stable fixed-size controls.

- [ ] **Step 7: Commit deployment and delivery documentation**

```bash
git add Dockerfile docker-compose.yml deploy .env.example tests/load scripts README.md docs package.json THIRD_PARTY_NOTICES.md
git commit -m "docs: prepare production deployment and rehearsal"
```

## Final Review Gate

- [ ] Map every numbered spec section to at least one completed task.
- [ ] Run `git diff --check` and confirm a clean worktree.
- [ ] Review all route handlers for authentication, CSRF, validation, idempotency, and redaction.
- [ ] Verify every draw state transition and winner reservation path has a test.
- [ ] Confirm no placeholder copy, sample credentials, real guest data, or secret files are committed.
- [ ] Record exact verification commands and results in the final handoff.
