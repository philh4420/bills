# Bills App Delivery Backlog (v1.1, v1.2, v2)

This is the execution checklist version of the roadmap. Each ticket includes API, UI, Firestore schema, and tests.

## v1.1 (Ledger Foundation + Controls)

### BIL-111 - Add Ledger Domain and Storage
- Goal: Introduce a true transaction ledger (`planned`, `posted`, `paid`) as first-class data.
- Firestore schema:
  - `users/{uid}/ledgerEntries/{entryId}`
  - Fields: `month`, `date`, `day`, `title`, `category`, `amount`, `status`, `sourceType`, `sourceId`, `createdAt`, `updatedAt`, `postedAt`, `paidAt`.
- API:
  - `GET /api/ledger?month=YYYY-MM`
  - `PATCH /api/ledger/:entryId` (`status` change and status timestamps)
- UI:
  - Reconciliation screen list of month ledger entries with status controls.
- Tests:
  - Repository create/read/update ledger entry tests.
  - API validation tests for status transitions and malformed payloads.

### BIL-112 - Generate Ledger From Current Financial Inputs
- Goal: Generate deterministic planned ledger entries from cards, bills, income, adjustments, and loaned-out events.
- Firestore schema:
  - Reuse `ledgerEntries`; deterministic `entryId` based on source event id.
- API:
  - No public API change; generation triggered in recompute pipeline.
- UI:
  - Existing screens remain unchanged in this ticket.
- Tests:
  - Unit tests: timeline event -> ledger entry mapping.
  - Idempotency tests: recompute preserves existing posted/paid statuses.

### BIL-113 - Add Recurrence Rule Model and Sync
- Goal: Add recurrence rules for all recurring sources to remove month-by-month manual duplication.
- Firestore schema:
  - `users/{uid}/recurrenceRules/{ruleId}`
  - Fields: `sourceType`, `sourceId`, `label`, `kind`, `frequency`, `intervalCount`, `dayOfMonth`, `startMonth`, `endMonth`, `amount`, `active`, `createdAt`, `updatedAt`.
- API:
  - `GET /api/recurrence-rules`
- UI:
  - Optional read-only table (phase 1) or JSON diagnostics in admin panel.
- Tests:
  - Unit tests for recurrence generation for cards/line-items/adjustments.
  - Repository list/order tests.

### BIL-114 - Add Month Lock/Close State
- Goal: Prevent accidental edits to reconciled months.
- Firestore schema:
  - `users/{uid}/monthClosures/{month}`
  - Fields: `month`, `closed`, `reason`, `closedAt`, `closedBy`, `createdAt`, `updatedAt`.
- API:
  - `GET /api/month-closures?month=YYYY-MM`
  - `PUT /api/month-closures/:month` (`closed`, `reason`)
- UI:
  - Month lock controls on reconciliation screen and dashboard badge.
- Tests:
  - Route tests for close/reopen.
  - Guard tests that protected write endpoints reject locked months.

### BIL-115 - Enforce Month Lock in Write Routes
- Goal: Block writes to locked months in all month-scoped APIs.
- Firestore schema:
  - Reuse `monthClosures`.
- API:
  - Apply lock checks to:
    - `PUT /api/monthly-payments/:month`
    - `PUT /api/income-paydays/:month`
    - `POST/PATCH/DELETE /api/monthly-adjustments` when month range intersects a closed month.
- UI:
  - Show clear inline error when save is blocked due to lock.
- Tests:
  - Integration tests for each endpoint returning lock error.

### BIL-116 - Reconciliation Data Model and APIs
- Goal: Compare expected vs actual balance and persist variance.
- Firestore schema:
  - `users/{uid}/reconciliations/{month}`
  - Fields: `month`, `expectedBalance`, `actualBalance`, `variance`, `status`, `notes`, `reconciledAt`, `createdAt`, `updatedAt`.
- API:
  - `GET /api/reconciliations?month=YYYY-MM`
  - `GET /api/reconciliations/:month`
  - `PUT /api/reconciliations/:month` (`actualBalance`, `notes`)
- UI:
  - Reconciliation screen with month selector and save action.
- Tests:
  - Variance computation tests.
  - Validation tests for missing month, invalid amounts, malformed payloads.

### BIL-117 - Dashboard Integration for Lock + Reconciliation
- Goal: Surface closure and reconciliation state in monthly dashboard context.
- Firestore schema:
  - Read from `monthClosures` and `reconciliations`.
- API:
  - Extend `GET /api/dashboard` response with `monthClosure`, `reconciliation`.
- UI:
  - Dashboard panel/badge with lock status and variance summary.
- Tests:
  - API contract tests ensure added fields are returned and typed.

### BIL-118 - Reconciliation Screen (v1)
- Goal: Dedicated page to manage month closure, expected vs actual, and ledger statuses.
- Firestore schema:
  - Reads/writes to `reconciliations`, `monthClosures`, `ledgerEntries`.
- API:
  - Uses BIL-111/BIL-114/BIL-116 APIs.
- UI:
  - `/reconciliation` page:
    - month selector
    - expected/actual/variance
    - close/reopen month
    - ledger table with status edits
- Tests:
  - e2e flow: change ledger status -> save reconciliation -> close month -> verify edits blocked.

### BIL-119 - Validation UX Pass (v1.1 Scope)
- Goal: Clearer inline validation and owner-lock messaging.
- Firestore schema:
  - No schema changes.
- API:
  - Consistent error payload for `MONTH_LOCKED`, `FORBIDDEN_OWNER_MISMATCH`, invalid month key.
- UI:
  - Render inline field errors and action-level blocking messages.
- Tests:
  - Frontend tests for inline error rendering.
  - API tests for stable error codes/messages.

### BIL-120 - v1.1 Test Gate and Release Notes
- Goal: Lock quality gate for v1.1.
- Firestore schema:
  - No changes.
- API:
  - No new API.
- UI:
  - No new UI.
- Tests:
  - Typecheck/lint/build gate.
  - Regression tests for existing Import/Dashboard/Cards/Bills/Purchases flows.
  - Snapshot parity checks remain green.

## v1.2 (Card Lifecycle + Alerting + Ops)

### Phase v1.2-A - Statement Rule Foundation (Build First)

#### BIL-121 - Extend Card Model With Statement Rules
- Goal:
  - Add statement rule fields on cards: `statementDay`, `minimumPaymentRule`, `interestFreeDays`, `lateFeeRule`.
- API:
  - Extend `GET /api/cards` response and `PATCH /api/cards/:cardId` payload validation.
- UI:
  - Add editable statement rule inputs on Cards page.
- Firestore schema:
  - Extend `users/{uid}/cardAccounts/{cardId}` with:
    - `statementDay: number | null`
    - `minimumPaymentRule: { type: "fixed" | "percent"; value: number } | null`
    - `interestFreeDays: number | null`
    - `lateFeeRule: { type: "fixed"; value: number } | null`
- Tests:
  - Model validation tests for rule payloads.

#### BIL-122 - Statement-Cycle Calculator + Ledger Emission
- Goal:
  - Generate ledger entries for statement lifecycle:
    - statement balance
    - due amount
    - minimum payment
    - interest accrual
    - late fee
- API:
  - Recompute pipeline enhancement (no new public route required).
- UI:
  - Timeline and reconciliation ledger show new card lifecycle entries.
- Firestore schema:
  - Reuse `users/{uid}/ledgerEntries/{entryId}` with new `sourceType` values for statement events.


### Phase v1.2-B - Alert State + Dispatch Controls

#### BIL-123 - Smart Alert State Model
- Goal:
  - Add per-alert state: `acknowledged`, `snoozedUntil`, `muted`, and per-alert-type toggles.
- API:
  - `POST /api/alerts/:id/ack`
  - `POST /api/alerts/:id/snooze`
  - `POST /api/alerts/:id/mute`
  - `PUT /api/alerts/settings` adds type-toggle controls.
- UI:
  - Smart alert actions: Acknowledge, Snooze, Mute.
- Firestore schema:
  - `users/{uid}/alertStates/{alertId}` with:
    - `acknowledgedAt`, `snoozedUntil`, `muted`, `mutedAt`, `updatedAt`
  - Extend `users/{uid}/alertSettings/primary` with per-type toggles.
- Tests:
  - Alert-state transition matrix and dedupe behavior checks.

#### BIL-124 - Quiet Hours + Realtime/Cron Enforcement
- Goal:
  - Support quiet hours and enforce in both realtime dispatch and cron dispatch.
- API:
  - Extend `PUT /api/alerts/settings` with quiet-hour window settings.
  - Ensure `/api/notifications/dispatch` and cron route both apply quiet-hour suppression.
- UI:
  - Quiet hours controls in smart alert settings.
- Firestore schema:
  - Extend `alertSettings`:
    - `quietHoursEnabled`
    - `quietHoursStartLocal`
    - `quietHoursEndLocal`
    - `quietHoursTimezone` (`Europe/London`)


### Phase v1.2-C - Notification Reliability + Ops UX

#### BIL-125 - Device Notification Diagnostics
- Goal:
  - Track per-device health: last success, last failure reason, endpoint health, stale auto-clean.
- API:
  - `GET /api/notifications/diagnostics`
  - Extend existing send paths to update diagnostics metadata.
- UI:
  - Diagnostics panel with device rows and health chips.
- Firestore schema:
  - Extend `users/{uid}/pushSubscriptions/{subscriptionId}`:
    - `lastSuccessAt`, `lastFailureAt`, `lastFailureReason`, `endpointHealth`, `failureCount`
- Tests:
  - Delivery diagnostics update behavior on success/failure and stale endpoint removal.

#### BIL-126 - Manual Subscription Repair Flow
- Goal:
  - Add one-click repair for broken/stale push subscriptions.
- API:
  - `POST /api/notifications/subscriptions/repair` (or equivalent idempotent repair route).
- UI:
  - “Repair subscription” action in push reminders section.
- Firestore schema:
  - Reuse `pushSubscriptions`; update health and refreshed endpoint metadata.


### Phase v1.2-D - Data Portability and Recovery

#### BIL-127 - One-Click Export (CSV + JSON Snapshot)
- Goal:
  - Export complete workspace data in CSV and JSON formats.
- API:
  - `GET /api/export?format=csv`
  - `GET /api/export?format=json`
- UI:
  - Export controls with clear file type labels.
- Firestore schema:
  - No required schema changes.
- Tests:
  - Export completeness checks against core collections.

#### BIL-128 - Backup/Restore Flow
- Goal:
  - Download backup and restore from uploaded JSON snapshot.
- API:
  - `POST /api/restore` (dry-run validation + commit mode)
  - Optional `GET /api/backups` metadata endpoint
- UI:
  - Backup/restore panel with upload, preview summary, and confirm restore.
- Firestore schema:
  - Optional `users/{uid}/backups/{backupId}` metadata for restore history.

### v1.2 Release Gate (Must All Pass)
- Gate 1:
  - Card due/statement behavior validated across two full monthly cycles.
- Gate 2:
  - Snooze/mute/quiet hours enforced in both realtime and cron paths.
- Gate 3:
  - Export + restore roundtrip reproduces data exactly in a test workspace.
- Gate 4:
  - Build pipeline remains green: typecheck, lint, production build.

## v2 (Auditability + Undo)

### BIL-201 - Immutable Audit Event Stream
- API:
  - Middleware-level event emit for all writes.
- UI:
  - Read-only timeline page.
- Firestore schema:
  - `users/{uid}/auditEvents/{eventId}` with before/after payload metadata.

### BIL-202 - Reversible Command Layer
- API:
  - Introduce command IDs and reversible handlers.
- UI:
  - Hidden/advanced until undo UI ships.
- Firestore schema:
  - `users/{uid}/commands/{commandId}`.

### BIL-203 - Undo APIs and Safeguards
- API:
  - `POST /api/undo/:commandId`.
- UI:
  - Undo action in history items.
- Firestore schema:
  - Reuse commands/audit.

### BIL-204 - Edit History UI
- API:
  - Cursor pagination for audit events.
- UI:
  - Filterable history screen by entity/month.
- Firestore schema:
  - No new schema.

### BIL-205 - Retention + Performance Hardening
- API:
  - Archival endpoints/jobs.
- UI:
  - Archive status indicators.
- Firestore schema:
  - Optional archive collections.

-----------------------------------------
## Best Features to Add
1. Debt payoff planner (snowball/avalanche) using your real cards/APR/payment plan.
2. Savings goals/sinking funds (annual bills, holidays, repairs) with monthly target amounts.
3. Net worth page (bank + cash - card/debt + loaned-out recovery).
4. Scenario mode (“what if I add/remove X bill/income?”) without changing live data.
5. Calendar improvements: drag/drop due days and week-level cash pressure heatmap.
6. Subscription intelligence: detect high-cost recurring services and suggest lower-cost swaps.
7. Multi-account bank support (main/current/savings) with transfers.
8. “Payday mode” for 4-week cycles that auto-generates shifted pay dates.
9. Installable PWA polish: offline edit queue, sync status, conflict handling.
10. Lightweight analytics: monthly trend comparisons and category drift alerts.
11. turn this into a phased roadmap (v1.1, v1.2, v2) with exact build order.

Phased Roadmap (No Code Yet)

v1.1: Planning Core + Visibility
Implement Payday mode (4-week cycle) engine and month auto-shift logic (Feature 8).
Add Savings goals / sinking funds data model + monthly contribution targets (Feature 2).
Build Debt payoff planner (snowball + avalanche) using real card balances/APR/min payments (Feature 1).
Add Net worth page v1: total bank/cash - debts + loaned-out recovery (Feature 3).
Add Lightweight analytics v1: month-over-month comparisons and category drift alerts (Feature 10).
Wire all new outputs into dashboard summaries and monthly projections (read-only first).

## These ae still to add

v1.2: Simulation + Calendar + Accounts
Add multi-account bank support (current/savings/cash) and internal transfer flows (Feature 7).
Update net worth/dashboard to aggregate by account and show transfer-aware balances.
Add Scenario mode (sandbox “what-if” runs) without writing live data (Feature 4).
Upgrade calendar to week cash-pressure heatmap (Feature 5).
Add calendar drag/drop due-day editor with immediate projection refresh (Feature 5).
Add subscription intelligence: recurring-cost ranking + lower-cost swap suggestions (Feature 6).

v2: Reliability + PWA Experience
Implement offline edit queue (queued writes + replay on reconnect) (Feature 9).
Add sync status UI (queued, syncing, failed, last sync) (Feature 9).
Add conflict detection/resolution for offline-vs-server edits (Feature 9).
Make planner/scenario/calendar actions fully offline-safe with eventual consistency.
Hardening pass: performance tuning, telemetry, edge-case validation, UX polish across all new features.
