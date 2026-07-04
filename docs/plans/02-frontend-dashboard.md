# Plan 2 — Frontend Dashboard

A single **Next.js** app that serves both the authenticated dashboard (this plan) and the public landing page (plan 3). All free & open-source.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** — components
- **Recharts** — usage charts
- **TanStack Query** — data fetching/caching against the FastAPI backend
- **react-hook-form** + **zod** — forms & validation

No BFF, no server components gymnastics — the dashboard is a client app that calls the FastAPI backend directly with the JWT.

## What the dashboard does

1. Log in.
2. See a list of **your managed APIs** (each = an upstream key you've added).
3. **Add a new API** (name, provider, base URL, secret).
4. For each API: view its **proxy tokens** (create/revoke; raw token shown once), and view its **usage statistics** (charts).
5. Log out.

That's the whole app. No teams, no roles, no billing screens.

## Routes (App Router)

```
app/
  (marketing)/            ← plan 3 (landing, public)
  (dashboard)/
    layout.tsx            ← auth guard + top nav (logo, user menu, logout)
    dashboard/
      page.tsx            ← list of managed APIs + "Add API" button
    apis/
      new/page.tsx        ← add-API form
      [id]/
        page.tsx          ← single API: tabs = Overview | Tokens | Usage
  login/page.tsx
  signup/page.tsx
  api/                    ← (none needed; talks straight to FastAPI)
lib/
  api-client.ts          ← fetch wrapper, attaches JWT, throws typed errors
  auth.ts                ← login/logout, token storage
  queries.ts             ← TanStack Query hooks
components/
  ui/                    ← shadcn primitives
  charts/                ← UsageChart, StatCard
  ApiForm.tsx, TokenList.tsx, StatsPanel.tsx
```

## Auth

- Login/signup POST to `/auth/login` / `/auth/signup`, receive a JWT.
- Store JWT in an **httpOnly cookie** (set by a tiny Next route handler) **or**, simplest for v1, in memory + `localStorage` with the caveat it's XSS-exposed. Recommend the cookie approach via one `app/api/session/route.ts` handler if you want it clean; otherwise `localStorage` is acceptable for a first version.
- `(dashboard)/layout.tsx` checks for a session; if none → redirect to `/login`.
- `api-client.ts` attaches `Authorization: Bearer <jwt>`; on `401` → clear session, redirect to login.

## Screens

### Dashboard home (`/dashboard`)
- Grid/table of managed APIs: `{name, provider, status, requests (last 7d), created}`.
- "Add API" button → `/apis/new`.
- Empty state: "Add your first API to get started."

### Add API (`/apis/new`)
- Form (react-hook-form + zod): `name`, `provider` (select: OpenAI / Anthropic / Custom), `base_url` (auto-filled per provider, editable for Custom), `secret` (password field).
- Submits to `POST /apis`. On success → redirect to the API's detail page.

### API detail (`/apis/[id]`) — three tabs
- **Overview:** KPI `StatCard`s from `/apis/{id}/stats/summary` — total requests, total tokens, error rate, avg latency, (optional) cost. Status toggle (active/disabled).
- **Tokens:** list from `/apis/{id}/tokens`. "Create token" → modal, calls `POST /apis/{id}/tokens`, shows the raw `xpxy_live_...` **once** in a copyable box with a "save it now" warning. Revoke button per token. Also show a ready-to-copy usage snippet (curl) using the proxy URL.
- **Usage:** the core feature —
  - Range selector (24h / 7d / 30d) + interval (hour/day).
  - `UsageChart` (Recharts line/area): requests over time; toggle series for tokens, avg latency, errors. Data from `/apis/{id}/stats`.
  - A recent-requests table from `/apis/{id}/logs` (timestamp, path, status, tokens, latency).

## Data fetching

- TanStack Query hooks in `queries.ts`: `useApis()`, `useApi(id)`, `useTokens(id)`, `useStats(id, range, interval)`, `useLogs(id)`.
- Mutations: `useCreateApi`, `useUpdateApi`, `useDeleteApi`, `useCreateToken`, `useRevokeToken` — invalidate the relevant queries on success.
- Sensible defaults: `staleTime: 30s`; usage query refetches on range change.

## Charts

- One reusable `<UsageChart>` (Recharts `ResponsiveContainer` + `LineChart`/`AreaChart`), themed with Tailwind CSS variables so it matches light/dark.
- `<StatCard>` for KPI tiles.
- Loading skeletons + empty states ("No requests yet — send one through your proxy token").

## Testing

- Component tests (Vitest + React Testing Library) for the API form, token list, stats panel — mock the backend with MSW.
- One Playwright e2e: login → add API → create token → (with a seeded usage row) see the chart render.

## Deployment

- Runs as the `frontend` service in `docker-compose.yml` (`next build` + `next start`), or deploy free to any static/Node host.
- Env: `NEXT_PUBLIC_API_URL` → the FastAPI backend URL.

## Phases

1. **Shell + auth.** Next app, Tailwind + shadcn, login/signup, session, dashboard layout with guard.
2. **Manage APIs.** List, add-API form, detail page Overview tab + status toggle.
3. **Tokens.** Token list, create (show-once), revoke, copy-curl snippet.
4. **Usage charts.** Range/interval controls, `UsageChart`, KPI cards, recent-logs table.
5. **Polish.** Empty/loading/error states, dark mode, responsive, e2e test.
