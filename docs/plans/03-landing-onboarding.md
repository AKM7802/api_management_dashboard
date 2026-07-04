# Plan 3 — Landing Page + Onboarding

A simple, SEO-friendly public landing page and a lightweight signup → first-API onboarding. Same Next.js app as the dashboard (plan 2), just the public `(marketing)` route group. No pricing tiers, no payment — nothing paid.

## Stack

Same Next.js + Tailwind + shadcn/ui app. Landing pages use **static generation (SSG)** for SEO and speed. All free & open-source.

## Pages

```
app/(marketing)/
  layout.tsx        ← public header (logo, Features, Docs, Login, "Get started")
  page.tsx          ← home / landing (SSG)
  features/page.tsx ← what it does (SSG)
  docs/page.tsx     ← quickstart: how to use a proxy token (SSG)
  sitemap.ts        ← sitemap for SEO
  robots.ts
```

Keep it to a few pages for v1. No blog, no changelog.

## Landing page content

Message: *"Manage your API keys in one place. Get a safe proxy token, and see exactly how your APIs are being used."*

Sections:
1. **Hero** — one-line value prop + "Get started free" CTA (→ `/signup`) + a small code snippet showing `xpxy_live_...` replacing a real key.
2. **How it works** — 3 steps: Add your API → Get a proxy token → Watch usage in the dashboard.
3. **Features** — key masking (clients never see the real key), usage analytics per API, works with OpenAI / Anthropic / any custom base URL, streaming supported.
4. **CTA footer** — "Start managing your APIs" → signup.

## SEO (simple but proper)

- Per-page `<title>` + meta description via the Next **Metadata API**.
- Open Graph + Twitter card tags on the home page.
- `sitemap.ts` + `robots.ts`.
- Semantic HTML (one `<h1>`, `<section>`s), fast SSG pages (good Core Web Vitals), `next/image` for any images, self-hosted fonts via `next/font`.
- One bit of JSON-LD (`SoftwareApplication`/`Organization`) on the home page.

No i18n, no dynamic OG generation, no A/B testing in v1 — those can come later.

## Onboarding (dead simple)

The "onboarding" is just: **signup → land in the dashboard → add your first API.** No wizard, no email verification, no billing.

Flow:
1. `/signup` — email + password form → `POST /auth/signup` → receives JWT → redirect to `/dashboard`.
2. Dashboard empty state prompts: **"Add your first API."**
3. After adding an API and creating a token, the token screen shows a **copy-paste curl snippet** so the user can immediately make their first proxied request and then see it appear in the Usage tab.

Optionally add a tiny checklist card on the dashboard for a new user:
- [ ] Add an API
- [ ] Create a proxy token
- [ ] Make your first request

(Purely a UI nicety reading existing data — no new backend needed beyond what plan 1 already provides.)

## Testing

- Lighthouse pass on the landing page (performance + SEO ≥ 90).
- One Playwright e2e: visit landing → click "Get started" → signup → land on dashboard empty state.

## Deployment

Same Next.js app / same `frontend` container as plan 2. Landing pages are statically generated at build time. Env: `NEXT_PUBLIC_API_URL`.

## Phases

1. **Landing.** Home page (hero, how-it-works, features, CTA), header/footer, metadata + sitemap/robots.
2. **Signup.** `/signup` form → backend → redirect to dashboard.
3. **Onboarding polish.** Empty-state prompts + first-request checklist + copy-curl snippet.
4. **SEO check.** Metadata, JSON-LD, Lighthouse pass.
