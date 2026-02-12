# Bills App v1

Single-owner bills management app built with Next.js and Firestore.

## Requirements

- Node.js 22 LTS
- Firebase project (Auth + Firestore)

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Owner access

- The app enforces single-owner access across UI and API.
- Configure either `OWNER_UID` (recommended) or `OWNER_GOOGLE_EMAIL`.
- In production (`NODE_ENV=production`), one of these must be set.
- In local development, if neither value is set, authenticated users are allowed for DX.

## Core routes

- `/login`
- `/import`
- `/dashboard`
- `/cards`
- `/bills`
- `/purchases`

## Production deployment (Vercel)

1. Push repository to GitHub.
2. Import project in Vercel.
3. Add all required environment variables from `.env.example`.
4. Deploy `main` for production.

## Card due date reminders (PWA push + Vercel Cron)

1. Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

2. Add these Vercel environment variables:
- `WEB_PUSH_SUBJECT` (example: `mailto:you@example.com`)
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `CRON_SECRET`
- optional `CARD_REMINDER_OFFSETS` (default `7,3,1`)
- optional `CARD_REMINDER_DELIVERY_HOURS` (default `8`, UK local hour)

3. Keep `vercel.json` cron enabled:
- `GET /api/cron/card-reminders` runs hourly at `0 * * * *`.
- On Hobby plan this is valid for free use.

4. In the app:
- Set `Due day` for cards on `/cards`.
- Enable push notifications in `/cards` -> `Push reminders`.
- Configure Smart alerts on `/dashboard`:
  - thresholds
  - due reminder offsets
  - delivery hours
  - realtime/cron toggles
  - alert type toggles
- On iOS, install from Safari to Home Screen and allow notifications.

## API routes

- `POST /api/import/bills-xlsx`
- `GET /api/dashboard?month=YYYY-MM`
- `GET|PUT /api/alerts/settings`
- `GET /api/cards`
- `PATCH /api/cards/:cardId`
- `GET /api/monthly-payments?month=YYYY-MM`
- `PUT /api/monthly-payments/:month`
- `GET|POST /api/house-bills`, `PATCH|DELETE /api/house-bills/:id`
- `GET|POST /api/income`, `PATCH|DELETE /api/income/:id`
- `GET|POST /api/shopping`, `PATCH|DELETE /api/shopping/:id`
- `GET|POST /api/my-bills`, `PATCH|DELETE /api/my-bills/:id`
- `GET|POST /api/monthly-adjustments`, `PATCH|DELETE /api/monthly-adjustments/:id`
- `GET|POST /api/purchases`, `PATCH /api/purchases/:id`
- `GET /api/notifications/vapid-public-key`
- `GET|POST|DELETE /api/notifications/subscriptions`
- `POST /api/notifications/dispatch` (manual smart-alert check)
- `GET|POST /api/cron/card-reminders` (Vercel cron or manual secure trigger)
