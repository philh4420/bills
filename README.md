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

## API routes

- `POST /api/import/bills-xlsx`
- `GET /api/dashboard?month=YYYY-MM`
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
