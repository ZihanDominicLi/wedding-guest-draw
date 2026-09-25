# One-Command Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe local publisher that builds the `linux/amd64` application image, streams it to the Ubuntu server over SSH, restarts only the app service, verifies health, and rolls back the app image on failure.

**Architecture:** `deploy/publish.sh` is the only maintained entry point. It validates the local repository and Docker builder, builds a commit-tagged image, and pipes a gzip stream into a remote Bash receiver over SSH. The remote receiver loads the image, preserves the server `.env` and all Compose volumes, creates a rollback tag, runs migrations through the existing container startup, waits for health, and restores the previous app image if the new container fails.

**Tech Stack:** POSIX-compatible Bash features available on macOS and Ubuntu 22.04, Docker CLI/Buildx, Docker Compose v2, OpenSSH, Vitest only for existing application tests.

**Spec:** `docs/superpowers/specs/2026-09-25-one-command-deployment-design.md`

## Global Constraints

- The publisher must never transmit or overwrite the server `.env`.
- The publisher must never remove PostgreSQL, uploads, backups, Caddy, or Cloudflare Tunnel volumes.
- The server must not need to pull Node or the application image from Docker Hub during a publish.
- Application rollback does not roll back Prisma migrations.
- Default target is `ubuntu@36.103.199.34:/home/ubuntu/wedding-guest-draw` over SSH port `22`.
- Dirty worktrees require explicit `ALLOW_DIRTY=1`.
- Logs must not print passwords, secrets, cookies, or private-key contents.

## Review Focus

- Docker Desktop is running but Buildx is unavailable: the script must fail with a concrete installation/activation message before changing the server.
- The server project directory is missing or lacks `.env`: the remote preflight must fail without loading an image or restarting services.
- The new app image starts but never becomes healthy: the previous image must be restored and the failure logs retained.
- A migration fails during startup: the publisher must return non-zero and must not claim a successful release.
- The SSH connection drops during image transfer: the remote receiver must clean its incomplete temporary file and leave the running release untouched.

### Task 1: Add Local Publisher Contract and Testable Shell Helpers

**Files:**
- Create: `deploy/publish.sh`
- Create: `deploy/publish_helpers.bash`
- Create: `tests/deploy/publish_helpers.bats`

**Interfaces:**
- `deploy/publish.sh` accepts no argument for publish, `rollback` for explicit rollback, and `dry-run` for read-only remote validation.
- Environment overrides are `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_DIR`, `DEPLOY_SSH_PORT`, `DEPLOY_COMPOSE_FILES`, `ALLOW_DIRTY`, `KEEP_ROLLBACKS`, and `HEALTH_TIMEOUT_SECONDS`.
- `deploy/publish_helpers.bash` exposes `release_id_from_git`, `compose_args`, `require_clean_worktree`, and `validate_release_id` for isolated shell tests.

- [ ] **Step 1: Write failing helper tests**

  Add Bats cases that assert a release id contains the short commit SHA and UTC-safe characters; compose arguments expand `docker-compose.yml docker-compose.tunnel.yml` into repeated `-f` flags; dirty worktrees fail unless `ALLOW_DIRTY=1`; and invalid release ids are rejected.

- [ ] **Step 2: Run the helper tests and verify they fail for missing helpers**

  Run:

  ```bash
  bats tests/deploy/publish_helpers.bats
  ```

  Expected: failure because `deploy/publish_helpers.bash` does not yet exist.

- [ ] **Step 3: Implement minimal helper functions**

  Keep helpers side-effect free except for the explicit worktree check. Use `git rev-parse --short=12 HEAD`, `date -u +%Y%m%d%H%M%S`, and shell-safe validation of `[a-zA-Z0-9._-]+`.

- [ ] **Step 4: Run helper tests and shell syntax checks**

  Run:

  ```bash
  bats tests/deploy/publish_helpers.bats
  bash -n deploy/publish_helpers.bash
  ```

  Expected: all helper tests pass.

- [ ] **Step 5: Commit the helper contract**

  ```bash
  git add deploy/publish_helpers.bash tests/deploy/publish_helpers.bats
  git commit -m "test: define one-command deployment shell contract"
  ```

### Task 2: Implement Local Build and SSH Streaming

**Files:**
- Modify: `deploy/publish.sh`
- Modify: `deploy/publish_helpers.bash`

**Interfaces:**
- `publish.sh` calls `docker buildx build --platform linux/amd64 --load -t wedding-guest-draw-app:<release-id> .`.
- The image stream is `docker save wedding-guest-draw-app:<release-id> | gzip -c | ssh ... 'bash -s -- receive <release-id>'`.
- `dry-run` only invokes remote preflight and Compose config checks; it does not build, load, or restart.

- [ ] **Step 1: Add failing command-construction tests**

  Extend the Bats suite to assert that `compose_args` produces one `-f` pair per configured file, that the default image tag is commit-based, and that `dry-run` does not call Docker build or `docker save` when command wrappers are injected.

- [ ] **Step 2: Run the expanded tests and verify the new cases fail**

  ```bash
  bats tests/deploy/publish_helpers.bats
  ```

- [ ] **Step 3: Implement local preflight and streaming**

  In `publish.sh`, use `set -Eeuo pipefail`, a trap that prints the failed phase, and command checks for `docker`, `ssh`, `gzip`, `git`, and `docker buildx`. Refuse a non-amd64 `docker info` target and stop before SSH if the builder is unavailable. Use `mktemp` with a cleanup trap only for local metadata; stream the image without creating a persistent archive in the repository.

- [ ] **Step 4: Run local dry-run and shell checks**

  ```bash
  bash -n deploy/publish.sh deploy/publish_helpers.bash
  ./deploy/publish.sh dry-run
  ```

  Expected: the script reports the server preflight result and performs no restart.

- [ ] **Step 5: Commit local publishing**

  ```bash
  git add deploy/publish.sh deploy/publish_helpers.bash tests/deploy/publish_helpers.bats
  git commit -m "feat: stream amd64 app releases over ssh"
  ```

### Task 3: Implement Remote Receive, Health Check, and Rollback

**Files:**
- Modify: `deploy/publish.sh`
- Create: `deploy/remote-publish.sh`
- Modify: `tests/deploy/publish_helpers.bats`

**Interfaces:**
- `remote-publish.sh receive <release-id>` reads a gzip stream from stdin, loads exactly one app image, and publishes it using the server directory.
- `remote-publish.sh rollback` restores the newest `wedding-guest-draw-app:rollback-*` image.
- The Compose command always includes the configured files and runs `up -d --no-build --force-recreate app`.

- [ ] **Step 1: Add failing tests for remote safety rules**

  Test the remote script source for refusing a missing `.env`, using `--no-build`, preserving the compose volume names, and invoking rollback after a failed health check. Add a test that a missing rollback image returns non-zero without stopping the current app.

- [ ] **Step 2: Run tests and verify they fail before implementation**

  ```bash
  bats tests/deploy/publish_helpers.bats
  ```

- [ ] **Step 3: Implement the remote receiver**

  Create a strict Bash script with these phases: `preflight`, `receive`, `activate`, `wait_health`, `rollback`. Verify `DEPLOY_DIR`, `.env`, both Compose files, and Docker daemon before `docker load`. Load into a temporary tag, tag the current image as `rollback-<timestamp>`, run the app with `--no-build`, poll `docker compose ps --format json` and `/api/health` up to `HEALTH_TIMEOUT_SECONDS`, then tag the release as `latest`. On failure, capture `docker compose logs --tail=120 app`, restore the rollback tag, and restart with `--no-build`.

- [ ] **Step 4: Run static remote tests**

  ```bash
  bash -n deploy/remote-publish.sh
  bats tests/deploy/publish_helpers.bats
  ```

- [ ] **Step 5: Commit remote publishing**

  ```bash
  git add deploy/publish.sh deploy/remote-publish.sh tests/deploy/publish_helpers.bats
  git commit -m "feat: add remote health checks and app rollback"
  ```

### Task 4: Update Deployment Documentation and Verification

**Files:**
- Modify: `docs/DEPLOYMENT.md`
- Modify: `README.md`
- Create: `tests/deploy/publish_smoke.sh`

**Interfaces:**
- Documentation tells the user to run `./deploy/publish.sh`, lists SSH key prerequisites, and documents `dry-run` and `rollback`.
- `publish_smoke.sh` runs syntax checks, validates required files, and checks that no deployment command contains `docker compose ... build` or volume deletion.

- [ ] **Step 1: Add the smoke verifier**

  The verifier exits non-zero when scripts are missing, not executable, fail `bash -n`, or omit the required `--no-build` and health-check strings.

- [ ] **Step 2: Run the smoke verifier and observe missing documentation assertions**

  ```bash
  bash tests/deploy/publish_smoke.sh
  ```

- [ ] **Step 3: Document first-time setup and routine updates**

  Replace the manual update sequence with the one-command flow while retaining existing backup and recovery instructions. Include:

  ```bash
  ./deploy/publish.sh dry-run
  ./deploy/publish.sh
  ./deploy/publish.sh rollback
  ```

- [ ] **Step 4: Run the full verification suite**

  ```bash
  bash tests/deploy/publish_smoke.sh
  bash -n deploy/*.sh tests/deploy/*.sh
  pnpm typecheck
  pnpm test:unit
  ```

- [ ] **Step 5: Commit documentation and verification**

  ```bash
  git add docs/DEPLOYMENT.md README.md tests/deploy/publish_smoke.sh
  git commit -m "docs: make deployment a one-command workflow"
  ```

## Plan Self-Review

- Spec coverage: local validation, amd64 build, streamed SSH transfer, remote preflight, no-build activation, health verification, rollback, data preservation, dry-run, and documentation each have an owning task.
- Placeholder scan: no TODO/TBD steps; commands and file paths are concrete.
- Type consistency: helper names and publisher modes are defined in Task 1 and reused in Tasks 2-4.
- Review focus coverage: each failure mode is tested in Tasks 1-3; smoke verification covers script presence and destructive-command regressions.
