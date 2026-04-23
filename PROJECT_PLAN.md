# SQS Monitor Plugin — Development Plan

## Repository

- **Location:** https://github.com/mobilinkd/openclaw-plugin-sqs-monitor
- **Package:** `@openclaw/sqs-monitor`
- **Published to:** ClawHub (checked first), npm (fallback)

---

## Architecture

**Decision: OpenClaw plugin with background service (NOT a separate daemon).**

The plugin registers a background service via `api.registerService()`. On startup, the service begins polling SQS and spawning subagents. On shutdown, it stops cleanly.

**Subagent spawning:** Uses the gateway API (`http://localhost:18789`) with `Authorization: Bearer <token>`. Spawns via `{ method: "agent", params: { message: <json>, lane: "subagent", deliver: false } }`. This is asynchronous — the subagent runs independently.

**Content-agnostic:** The plugin knows nothing about message schemas, SNS envelopes, or payload formats. It passes the full SQS Message object (serialized as JSON) to subagents. Subagents parse the JSON and handle whatever logic they need.

**AWS credentials:** Uses the standard AWS SDK v3 credential chain — IAM role on EC2/ECS/Lambda, env vars, or shared credentials file.

---

## Phase 1: AWS Infrastructure ✅ COMPLETE

**Goal:** Live SQS queue with SNS subscriptions, verified via AWS CLI.

### 1.1 — SQS Queue ✅

Queue `sqs-monitor` exists in `us-east-1` with:
- Visibility timeout: 60s
- Long-poll wait time: 20s (`ReceiveMessageWaitTimeSeconds`)

**Key discovery:** Use full regional queue URLs (`https://sqs.us-east-1.amazonaws.com/...`). Shortened URLs (`https://queue.amazonaws.com/...`) silently fail with `receive-message` long-poll.

### 1.2 — SNS Subscriptions ✅

`NotifyMe` and `AWS_Alarm` topics are subscribed to the `sqs-monitor` queue.

### 1.3 — Queue Policy ✅ (Critical)

⚠️ Without a queue policy, SNS messages are silently dropped. The queue must allow `sqs:SendMessage` from the SNS topic ARN.

### 1.4 — Verification ✅

End-to-end polling confirmed via AWS CLI.

### 1.5 — DLQ ✅

Queue `sqs-monitor-dlq` exists for permanently failed messages.

---

## Phase 2: Plugin Package ✅ COMPLETE

**Goal:** Standalone npm package published to ClawHub.

### 2.1 — Package Structure ✅

```
@openclaw/sqs-monitor/
├── src/
│   ├── index.ts       # Plugin entry — registers service
│   ├── service.ts     # SQS polling loop and message handling
│   ├── sqs-client.ts  # AWS SDK v3 SQS client wrapper
│   ├── gateway.ts     # Gateway API client for subagent spawning
│   ├── config.ts      # Configuration schema and resolution
│   └── errors.ts      # Error types and backoff helpers
├── openclaw.plugin.json  # Plugin manifest
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── LICENSE (MIT)
└── README.md
```

### 2.2 — Package Manifest ✅

- `name`: `@openclaw/sqs-monitor`
- `type`: `module` (ESM)
- `openclaw.extensions`: `./dist/index.js`
- `openclaw.compat.minGatewayVersion`: `2026.4.0`
- `peerDependencies`: `openclaw >=2026.4.0`
- `dependencies`: `@aws-sdk/client-sqs ^3.0.0`

### 2.3 — Build ✅

TypeScript compiles to `dist/` via `tsc`. Entry point is `dist/index.js`.

---

## Phase 3: Core Implementation ✅ COMPLETE

**Goal:** Functional plugin with all features implemented.

### 3.1 — Plugin Entry and Service Registration ✅

`definePluginEntry` from `openclaw/plugin-sdk/plugin-entry`. Service registered with `api.registerService({ id: "sqs-monitor", start, stop })`.

### 3.2 — SQS Polling ✅

- Long-poll with configurable `waitTimeSeconds` (default: 20)
- `VisibilityTimeout` configurable (default: 60)
- Drain-until-empty loop (re-polls immediately if messages received)
- Tracks `lastPollTime`, `lastMessageTime`, `inFlight` count

### 3.3 — Configuration ✅

Environment variables take precedence. Config file (`plugins.entries.sqsMonitor`) as primary.

Configurable via env vars:
- `SQS_MONITOR_QUEUE_URL` / `SQS_QUEUE_URL`
- `AWS_REGION`
- `SQS_MAX_IN_FLIGHT` (default: 10)
- `SQS_WAIT_TIME_SECONDS` (default: 20)
- `SQS_VISIBILITY_TIMEOUT` (default: 60)
- `SQS_POLL_INTERVAL_MS` (default: 0 = continuous)
- `SQS_MAX_POLL_GAP_MS` (default: 300000)
- `SQS_DLQ_URL`
- `SQS_NOTIFY_CHANNEL`
- `SQS_LOG_LEVEL` (default: info)
- `SQS_DRY_RUN`

### 3.4 — Subagent Spawning ✅

- Spawns via gateway API with `lane: "subagent"`, `deliver: false`
- Message is full SQS `Message` object serialized as JSON
- In-flight count tracked; spawning pauses when `inFlight >= maxInFlight`
- Message deleted from queue after successful spawn

### 3.5 — Error Handling and Backoff ✅

- Exponential backoff: 1s → 2s → 4s → ... → max 60s
- Jitter applied (±10%) to avoid thundering herd
- Consecutive error tracking; alert after 5 failures
- DLQ URL for permanently failed messages (future use)

### 3.6 — Alerts ✅

| Type | When | Fatal? |
|---|---|---|
| `hibernate_detected` | Poll gap > `maxPollGapMs` | No |
| `max_in_flight_exceeded` | `inFlight >= maxInFlight` | No |
| `consecutive_errors` | 5+ consecutive poll errors | No |
| `queue_unreachable` | Initial connectivity check fails | Yes |
| `config_error` | Config is invalid | Yes |

### 3.7 — Message Format ✅

Subagents receive the complete SQS `Message` object as a JSON string:

```json
{
  "MessageId": "...",
  "ReceiptHandle": "...",
  "Body": "...",
  "Attributes": { "ApproximateReceiveCount": "3", ... },
  "MessageAttributes": { ... }
}
```

This is forward-compatible: future enhancements (message attributes, per-queue routing) can extract additional fields without changing the wire format.

---

## Phase 4: Testing and CI ⚠️ IN PROGRESS

**Goal:** Automated type checking, build verification, and unit tests on every push.

### 4.1 — GitHub Actions CI ✅ DESIGNED

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
      - run: npm run build
      - run: npx tsc --noEmit
```

### 4.2 — Unit Tests ❌ NOT STARTED

Unit tests require:
- Vitest installed as dev dependency
- Test files written (service.ts, config.ts, sqs-client.ts)
- LocalStack or moto for SQS mocking

### 4.3 — Dry-Run Mode ✅ IMPLEMENTED

`SQS_DRY_RUN=true` logs all actions without executing SQS calls or spawning subagents. Safe for local development.

---

## Phase 5: Future Enhancements

Tracked in GitHub Issues.

### Issue #1 — Multi-queue with per-queue routing and message filtering

- Multiple queues, each with own agent/model routing
- URL construction from `accountId` + `region` + `queueName`
- Optional jq-style message filter per queue (e.g., `.Body`, `.Body | fromjson | .Message`)
- `accountId` added to plugin config

---

## Open Questions (Resolved)

1. **SNS filter policy:** Resolved — route everything to queue. No content filtering at SNS level. Subagent handles parsing.
2. **Notification channel:** Resolved — `SQS_NOTIFY_CHANNEL` env var accepts channel name (e.g., `telegram`). Implementation delegates to gateway's existing channel system.
3. **DLQ strategy:** Resolved — DLQ URL configurable. Actual move-to-DLQ behavior is a future enhancement (not implemented in v1).
4. **Message format:** Resolved — always pass full SQS `Message` as JSON. Subagents parse JSON. This preserves forward compatibility with future attribute/filtering enhancements.

---

## Immediate Next Steps

1. **Add GitHub Actions CI** — type check + build on every push
2. **Add unit tests** — vitest + mocks for SQS client
3. **Publish to ClawHub** — `clawhub publish . --slug sqs-monitor --name "SQS Monitor"`
4. **Install in production** — `clawhub install sqs-monitor` or `pnpm add @openclaw/sqs-monitor`
5. **Test end-to-end** — confirm real messages trigger subagent spawns
