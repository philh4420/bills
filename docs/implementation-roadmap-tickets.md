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

### BIL-121 - Card Statement Lifecycle Model
- API:
  - Extend card endpoints for `statementDay`, `minimumPayment`, `interestFreeDays`, `lateFee`.
- UI:
  - Cards form fields and projections panel updates.
- Firestore schema:
  - Add statement fields to `cardAccounts`.
- Tests:
  - Card cycle math unit tests.

### BIL-122 - Statement-Aware Ledger Entries
- API:
  - Recompute pipeline emits statement, minimum due, late fee entries.
- UI:
  - Ledger and timeline badges for statement events.
- Firestore schema:
  - Reuse `ledgerEntries`.
- Tests:
  - End-to-end cycle simulations across two months.

### BIL-123 - Smart Alert Actions (Snooze/Mute/Acknowledge)
- API:
  - `POST /api/alerts/:id/snooze`, `.../ack`, `.../mute`.
- UI:
  - Alert action buttons and state chips.
- Firestore schema:
  - `users/{uid}/alertStates/{alertId}`.
- Tests:
  - Action state transition tests.

### BIL-124 - Quiet Hours and Per-Type Delivery Policy
- API:
  - Extend alert settings API for quiet hours and per-type windows.
- UI:
  - Smart alerts settings controls.
- Firestore schema:
  - Extend `alertSettings`.
- Tests:
  - Dispatch suppression tests during quiet windows.

### BIL-125 - Device Delivery Diagnostics
- API:
  - `GET /api/notifications/diagnostics`.
- UI:
  - Device diagnostics panel and stale endpoint repair action.
- Firestore schema:
  - Extend `pushSubscriptions` with `lastSuccessAt`, `lastFailureAt`, `lastFailureCode`.
- Tests:
  - Notification send pipeline diagnostics tests.

### BIL-126 - Backup/Restore + Export
- API:
  - `GET /api/export?format=json|csv`
  - `POST /api/restore` (json snapshot upload)
- UI:
  - Backup/restore controls in settings.
- Firestore schema:
  - Optional `backups` metadata collection.
- Tests:
  - Roundtrip import/export integrity tests.

## v2 (Auditability + Undo)

### BIL-201 - Immutable Audit Event Stream
- API:
  - Middleware-level event emit for all writes.
- UI:
  - Read-only timeline page.
- Firestore schema:
  - `users/{uid}/auditEvents/{eventId}` with before/after payload metadata.
- Tests:
  - Coverage for all write endpoints emitting events.

### BIL-202 - Reversible Command Layer
- API:
  - Introduce command IDs and reversible handlers.
- UI:
  - Hidden/advanced until undo UI ships.
- Firestore schema:
  - `users/{uid}/commands/{commandId}`.
- Tests:
  - Command replay/revert tests.

### BIL-203 - Undo APIs and Safeguards
- API:
  - `POST /api/undo/:commandId`.
- UI:
  - Undo action in history items.
- Firestore schema:
  - Reuse commands/audit.
- Tests:
  - Undo correctness and lock protection tests.

### BIL-204 - Edit History UI
- API:
  - Cursor pagination for audit events.
- UI:
  - Filterable history screen by entity/month.
- Firestore schema:
  - No new schema.
- Tests:
  - UI filter/pagination tests.

### BIL-205 - Retention + Performance Hardening
- API:
  - Archival endpoints/jobs.
- UI:
  - Archive status indicators.
- Firestore schema:
  - Optional archive collections.
- Tests:
  - Load tests and query index validation.
