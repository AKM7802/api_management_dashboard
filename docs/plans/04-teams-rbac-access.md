# Implementation Plan: Optional Teams + RBAC + Per-Person API Access Grants

## Feature framing (READ FIRST — revised 2026-07-05 per user)

**Teams are an optional, opt-in layer. The current single-owner flow is the default and stays unchanged.**

- A brand-new or existing user operates in **Personal mode** exactly as today: they own their APIs directly, mint tokens, see their own usage. No team, no roles, nothing new is forced on them.
- A team only exists **when the user clicks "Create Team."** That action makes them the **owner** of a new team, and only then can they invite others, create team APIs, and grant per-member access.
- **Personal APIs and team APIs are separate.** A personal API (no team) behaves like today. A team API is created inside a team by an owner/admin and is governed by roles + grants.
- **Owner/Admin** can monitor **each individual teammate's** usage in the dashboard (per-member breakdown of the team's APIs).
- **Member** sees only the team APIs they've been granted, and **only their own** usage/statistics for those APIs — never other members' data, never API configuration.

This is implemented by making `ApiCredential.team_id` **nullable**: `NULL` = personal API (current behavior), set = team API (RBAC applies). Because of this, **there is no data migration/backfill of existing rows** — they simply keep `team_id = NULL` and continue working.

---

## 0. Grounding summary (what the code does today)

- **Ownership is a single FK.** `ApiCredential.user_id → users.id`. Every gate is one line: `get_owned_credential()` in `backend/app/apis.py` 404s unless `cred.user_id == user.id`. `tokens.py` and `usage.py` import that same dependency; `tokens.py::revoke_token` re-checks `token.credential.user_id != user.id` inline.
- **Proxy hot path** (`backend/app/proxy.py`): resolves a token via a 30s in-process TTL cache (`request.app.state.token_cache`, a plain dict keyed by `token_hash`), holding a `ResolvedToken` dataclass. It checks `token_status` and `credential_status` only. It logs a `UsageEvent` whose `user_id` is **`cred.user_id` (the credential owner)**.
- **Immediate revocation** is guaranteed by `backend/app/token_cache.py`: `invalidate_token(app, token_hash)` and `invalidate_credential(app, credential_id)` pop cache entries; called from `apis.py` (disable/rotate/delete) and `tokens.py` (revoke). Regression-tested in `test_cache_invalidation.py`.
- **DuckDB** (`backend/app/db/duckdb.py`) `usage_logs` carries `proxy_token_id, credential_id, user_id`. All read methods (`stats`, `summary`, `recent_logs`) filter by `credential_id` only.
- **Auth** (`backend/app/auth.py`): JWT `sub = user_id`, DB lookup per request already. No team/role anywhere.
- **Tests don't run Alembic.** `conftest.py` uses `Base.metadata.create_all`. 33 existing tests must stay green.
- **Frontend**: `lib/api.ts` is a thin fetch wrapper (JWT from localStorage); `lib/queries.ts` holds all TanStack hooks; `(dashboard)/layout.tsx` is the nav shell; base-ui shadcn (`render` prop, not `asChild`).

---

## 1. Team & membership model (opt-in)

**Teams exist only after an explicit "Create Team." No personal/implicit teams.** A user can own/belong to zero, one, or many teams. The active context is chosen in the UI ("Personal" by default, or a specific team) and carried per-request via an optional `X-Team-Id` header. **Absent header = Personal mode = current behavior.**

New models in `backend/app/models.py` (UUID PKs as `String(36)`; `_now`/`_uuid` helpers exist):

```
Team
  id, name (String120), created_at
  memberships -> TeamMembership (cascade all, delete-orphan)
  credentials -> ApiCredential (cascade all, delete-orphan)

TeamMembership
  id, team_id FK->teams.id (ondelete CASCADE, index),
  user_id FK->users.id (ondelete CASCADE, index),
  role String(20)  # owner | admin | member
  created_at
  UniqueConstraint(team_id, user_id)

ApiAccessGrant
  id, credential_id FK->api_credentials.id (ondelete CASCADE, index),
  user_id FK->users.id (ondelete CASCADE, index),
  granted_by_user_id FK->users.id (nullable),
  created_at
  UniqueConstraint(credential_id, user_id)

TeamInvitation
  id, team_id FK->teams.id (ondelete CASCADE, index),
  email String(255) index, role String(20),
  token_hash String(64) unique index,   # sha256 of the raw invite token
  status String(20)  # pending | accepted | revoked
  invited_by_user_id FK->users.id (nullable),
  accepted_by_user_id FK->users.id (nullable),
  created_at, expires_at
```

> Note: no `is_personal` flag anymore — there are no personal teams. "Personal mode" is simply the absence of a team context.

**Changed models:**
- `ApiCredential`: add **`team_id FK->teams.id (ondelete CASCADE, index), NULLABLE`**. `NULL` = personal API (owned by `user_id`, current flow). Set = team API. Keep `user_id` as the **creator/owner** (for personal APIs it's the owner; for team APIs it's the owner/admin who created it). No column rename.
- `ProxyToken`: add **`created_by_user_id FK->users.id (index)`** — which user minted the token. For personal APIs this equals the owner; for team APIs it's the granted member (or admin). This is the identity the proxy attributes usage to and re-validates access against.

**"Current context":** a dependency resolves the acting context from the optional `X-Team-Id` header:
- **No header →** Personal mode. Endpoints behave as today (operate on the caller's personal, `team_id IS NULL` resources).
- **Header = T →** Team mode. Caller must be a member of T (else 404, to avoid enumeration); role + grants apply.

Rejected alternatives: path prefix `/teams/{id}/...` (heavier re-routing) and JWT team claims (breaks instant role revocation — see §7).

---

## 2. Roles & capability matrix (team mode only)

**Three roles `owner | admin | member`. One owner per team** with exclusive powers (delete team, transfer ownership, manage other admins). Personal mode has no roles — you own your stuff outright.

| Action | Owner | Admin | Member |
|---|---|---|---|
| Create a team (self → owner) | any authenticated user | | |
| View team + member list | ✔ | ✔ | ✔ |
| Rename team | ✔ | ✔ | ✘ |
| Delete team (cascades all its APIs/tokens/grants) | ✔ | ✘ | ✘ |
| Transfer ownership | ✔ | ✘ | ✘ |
| Invite member | ✔ | ✔ | ✘ |
| Change a **member's** role | ✔ | ✔ | ✘ |
| Promote/demote an **admin** | ✔ | ✘ | ✘ |
| Remove a member | ✔ | ✔ (members only) | ✘ |
| Add/configure/delete a team API | ✔ | ✔ | ✘ |
| Grant/revoke API access to a member | ✔ | ✔ | ✘ |
| Create/revoke **own** proxy tokens | ✔ (any team API) | ✔ (any team API) | ✔ (granted APIs only) |
| Use the proxy at runtime | token creator must still hold access | same | same |
| **Monitor a specific teammate's usage** | ✔ (any member, any team API) | ✔ | ✘ |
| View team-wide usage dashboard | ✔ | ✔ | ✘ |
| View own usage for granted APIs | ✔ | ✔ | ✔ (own only) |

**Admins/owners implicitly have access to all team APIs** (no `ApiAccessGrant` needed). Grants only gate `member`.

### Enforcement design (new `backend/app/teams_deps.py`, reused everywhere)

- `get_active_context(user, db, x_team_id: Header|None) -> Context` — returns either `PersonalContext(user)` (no header) or `TeamContext(team, membership)` (header present + caller is a member; else 404).
- `require_team_role(*roles)` — factory dependency; requires **team** context and `membership.role in roles` (403 otherwise). Personal context → 403 (these actions are team-only).
- `get_scoped_credential(api_id, ctx=Depends(get_active_context), db)` — base loader that branches on the credential's own `team_id`:
  - **Personal API** (`cred.team_id IS NULL`): 404 unless `cred.user_id == user.id` (exactly today's check).
  - **Team API** (`cred.team_id == ctx.team.id`): allowed if caller is a member of that team; returns `(cred, membership, is_admin)`.
  - Mismatch (team API but wrong/absent context, or personal API requested in a team context) → 404.
- `require_credential_admin` = `get_scoped_credential` + (personal owner **or** team role in `{owner, admin}`) — for API config, grants, team-wide usage.
- `require_credential_access` = `get_scoped_credential` + (personal owner **or** team admin/owner **or** an `ApiAccessGrant(credential_id, user_id)` exists) — for self-service tokens + own-usage.

**Per-endpoint changes:**
- `apis.py::list_apis`:
  - Personal context → `where user_id == user.id AND team_id IS NULL` (current behavior, unchanged output).
  - Team context, admin/owner → `where team_id == ctx.team.id` (all team APIs).
  - Team context, member → `where team_id == ctx.team.id` inner-joined to `ApiAccessGrant` on `user_id` (only granted APIs).
- `apis.py::create_api`: personal context → today's behavior (`team_id=NULL`, `user_id=user.id`). Team context → `require_team_role("owner","admin")`, `team_id=ctx.team.id`, `user_id=user.id` (creator).
- `apis.py::get/update/delete_api`: swap `get_owned_credential` → `require_credential_admin`. Delete/update already call `invalidate_credential`; keep.
- `tokens.py::list/create_token`: swap to `require_credential_access`; `create_token` sets `created_by_user_id=user.id`. Members list only their own tokens (`created_by_user_id == user.id`); admins/personal-owner see all.
- `tokens.py::revoke_token`: allow if caller is the token's `created_by_user_id`, or an admin/owner of the token's team, or the personal owner.
- `usage.py` stats/summary/logs: swap to `require_credential_access`; admin/owner → team-wide (optionally per-member, see §6); member → own rows only.

---

## 3. Migration & data (NO backfill of existing data)

**One Alembic revision `0002_teams_rbac`: additive DDL only, plus a tiny `created_by` backfill. Existing rows stay personal (`team_id = NULL`).**

Because teams are opt-in and `team_id` is nullable, **existing users and their APIs need no reassignment** — the whole risky "personal-team backfill" from the earlier draft is gone.

Steps inside `0002.upgrade()`:
1. `op.create_table` for `teams`, `team_memberships`, `api_access_grants`, `team_invitations` (explicit ops, per the `0001` note).
2. `op.add_column` `api_credentials.team_id` (**nullable**, FK, index) and `proxy_tokens.created_by_user_id` (nullable first).
3. **Minimal backfill:** `UPDATE proxy_tokens SET created_by_user_id = (SELECT user_id FROM api_credentials WHERE id = proxy_tokens.credential_id)` — every existing token was minted by its personal owner. Then `op.batch_alter_table` to set `created_by_user_id` NOT NULL + FK (batch mode for SQLite; harmless on Postgres). **`team_id` stays nullable** (NULL is a valid, meaningful state).
4. Add unique constraints/indexes (`team_memberships(team_id,user_id)`, `api_access_grants(credential_id,user_id)`, `team_invitations.token_hash`).

`downgrade()`: drop the new columns/tables.

**DuckDB:** no schema change. `usage_logs` is already keyed by `credential_id` + `user_id`; per-member and team-wide reads work by filtering/grouping those. (A future `team_id` column is deferred.)

---

## 4. Access-grant semantics

An `ApiAccessGrant(credential_id, user_id)` (team APIs only) means: **this member may (a) create/list/revoke their own proxy tokens for this API, and (b) view their own usage rows for this API.** It does **not** expose other members' tokens/usage or any API configuration. Admins/owners never need a grant row. Personal APIs never have grants (only the owner uses them).

**Revocation = deny-at-proxy, keep tokens (CONFIRMED).** Revoking a grant makes the member's tokens for that API return 403 immediately (§5); the token rows are **not** deleted, so re-granting instantly restores them.

---

## 5. Proxy hot-path changes (immediate revocation preserved)

**`ResolvedToken`** gains: `created_by_user_id`, `team_id: str | None`, `access_ok: bool`.

**`_load_token`** computes `access_ok` in the same DB session:
- Personal API (`team_id IS NULL`): `access_ok = (created_by_user_id == cred.user_id)` — the owner. (Always true for personal tokens.)
- Team API: `access_ok = True` if the creator's `TeamMembership.role in {owner, admin}` for `cred.team_id`, else `True` iff an `ApiAccessGrant(cred.id, created_by)` exists.

It also switches the logged identity to the **actor**: in `proxy()::_log`, `user_id=resolved.created_by_user_id` (needed for per-member usage). For personal APIs this is identical to today (owner).

**New rejection branch** in `proxy()` after the status checks:
```
if not resolved.access_ok:
    _log(status.HTTP_403_FORBIDDEN)
    raise HTTPException(403, "API access has been revoked")
```
(Logged against the real credential, consistent with the existing "rejections against a real credential are logged" rule.)

**Cache invalidation** — extend `backend/app/token_cache.py`:
```
def invalidate_grant(app, credential_id, user_id):
    cache = app.state.token_cache
    for k, v in list(cache.items()):
        if v.credential_id == credential_id and v.created_by_user_id == user_id:
            cache.pop(k, None)
```
Called from: grant-revoke, member-removal (for each team credential the member could reach), and admin→member demotion (ex-admin now needs explicit grants — drop their cached admin-derived access; simplest correct: `invalidate_credential` for each team credential). `invalidate_credential`/`invalidate_token` still cover disable/rotate/delete/revoke. Single-process assumption unchanged.

---

## 6. Usage-data authorization + per-member monitoring

Add an optional `user_id: str | None = None` filter to `UsageStore.stats`, `summary`, `recent_logs` (append `AND user_id = ?` when set).

Per-credential usage endpoints (`/apis/{id}/stats|summary|logs`) via `require_credential_access`:
- **Member** → forced `user_id = membership.user_id` (own rows only).
- **Admin/Owner** → team-wide by default (`user_id=None`), **and** may pass an optional `?member_id=<user_id>` to drill into one teammate.

**New per-member monitoring (the "monitor individual teammates" requirement):**
- Add `UsageStore.usage_by_member(credential_ids, since) -> [{user_id, requests, total_tokens, cost, errors}]` (a `GROUP BY user_id`), and map `user_id → email` via Postgres for display.
- New endpoints (admin/owner only):
  - `GET /apis/{api_id}/usage/by-member` — per-teammate breakdown for one API.
  - `GET /teams/{team_id}/usage/summary` and `/usage/by-member` — team-wide aggregate across the team's `credential_id`s, broken down per member.
- Member calls to any `by-member` / team-wide endpoint → 403.

---

## 7. Auth / context

**JWT stays `sub=user_id` only; membership/role looked up from Postgres per request** (keeps role/removal instant; `get_current_user` already hits the DB). The acting context comes from the optional `X-Team-Id` header — **absent = Personal mode**, so unmodified existing clients keep working. Proxy requests authenticate by proxy token, not JWT, and are unaffected.

---

## 8. Invitations (claimable link, no email infra — v1)

Admin creates an invitation → backend returns a raw invite token once (store only `sha256`). Admin shares `/<frontend>/invite/{rawToken}`.
- Signed-in user: `POST /invitations/accept {token}` creates the membership.
- New user: sign up (existing flow), then accept.
- Email on the invite is informational; acceptance binds to the authenticated user's id. `expires_at` after N days. Re-inviting an existing member → 409/no-op.

---

## Full REST surface (JWT-authed unless noted; team scoping via `X-Team-Id`)

**Teams**
- `GET /teams` — my memberships + roles (empty list = user has only Personal mode).
- `POST /teams` — **the "Create Team" action**; caller → owner. `{name}`.
- `GET /teams/{team_id}` — member.
- `PATCH /teams/{team_id}` — admin. `{name}`.
- `DELETE /teams/{team_id}` — owner; **cascades** all team APIs/tokens/grants.
- `POST /teams/{team_id}/transfer` — owner. `{user_id}`.

**Members**
- `GET /teams/{team_id}/members` — member.
- `PATCH /teams/{team_id}/members/{user_id}` — role change per matrix; admin→member demotion invalidates cache (§5).
- `DELETE /teams/{team_id}/members/{user_id}` — admin (members) / owner (admins); cascades that user's grants + invalidates their cached tokens.

**Invitations**
- `POST /teams/{team_id}/invitations` — admin. `{email, role}` → raw token once.
- `GET /teams/{team_id}/invitations` — admin (pending).
- `DELETE /teams/{team_id}/invitations/{id}` — admin (revoke).
- `GET /invitations/{token}` — preview (team name, role); authed.
- `POST /invitations/accept` — `{token}` → membership.

**Grants** (team APIs)
- `GET /apis/{api_id}/grants` — admin: members + grant state.
- `POST /apis/{api_id}/grants` — admin. `{user_id}`.
- `DELETE /apis/{api_id}/grants/{user_id}` — admin; invalidate that member's tokens for the credential.

**Usage monitoring**
- `GET /apis/{api_id}/usage/by-member` — admin/owner: per-teammate breakdown.
- `GET /teams/{team_id}/usage/summary` · `/usage/by-member` — admin/owner: team-wide.
- Existing `/apis/{id}/stats|summary|logs` gain optional `?member_id=` (admin/owner only).

**Re-scoped existing endpoints** (unchanged paths, context-aware auth): `/apis*`, `/apis/{id}/tokens*`, `/tokens/{id}`, `/apis/{id}/stats|summary|logs`. **No `X-Team-Id` → identical to today.**

New router modules `backend/app/teams.py` + `backend/app/teams_deps.py`; grants + by-member usage folded into `apis.py`/`usage.py` or small modules; register in `backend/app/main.py`.

---

## Frontend plan

**`lib/api.ts`**: active-context handling — read `apimgmt.teamId` from localStorage (absent/`"personal"` = Personal mode) and send `X-Team-Id` only in team mode; helper `setActiveTeam(id | null)`.

**`lib/types.ts`**: add `Role`, `Team`, `TeamMembership`, `TeamInvitation`, `ApiAccessGrant`, `MemberUsage`; extend `ManagedApi` with nullable `team_id` + a caller `access`/role hint; extend `ProxyToken` with `created_by`.

**`lib/queries.ts`**: `useTeams`, `useCreateTeam`, `useTeam`, `useRenameTeam`, `useDeleteTeam`, `useTransferOwnership`, `useTeamMembers`, `useUpdateMemberRole`, `useRemoveMember`, `useInvitations`, `useCreateInvitation`, `useRevokeInvitation`, `useAcceptInvitation`, `useGrants(apiId)`, `useGrantAccess(apiId)`, `useRevokeAccess(apiId)`, `useMemberUsage(apiId)`, `useTeamUsage(teamId)`. Context change invalidates `["apis"]`, `["teams"]`, and `apis`-scoped keys.

**Components / pages** (base-ui `render` prop):
- **Context switcher** in `(dashboard)/layout.tsx` header — a `DropdownMenu`: **"Personal"** (default, highlighted when active) + each team from `useTeams()`, and a **"+ Create team"** item that opens a create dialog (`POST /teams`) then switches into the new team. If the user has no teams, the menu still shows "Personal" + "Create team" — teams are discoverable but never forced.
- **`app/(dashboard)/teams/[teamId]/page.tsx`** (team settings) — Members table (role `Select`, remove, admin-gated), Invitations panel (create → show-once link dialog mirroring `tokens-panel.tsx`; pending list + revoke), Rename/Delete/Transfer (owner). **Delete** uses a typed-confirm dialog because it cascades.
- **`components/access-panel.tsx`** — new **Access** tab on `app/(dashboard)/apis/[id]/page.tsx` (team API, admin only): member list with grant toggles.
- **Per-member monitoring** — on a team API's **Usage** tab, admin/owner get a "By member" view (`useMemberUsage`) — a table/bar-list of each teammate's requests/tokens/cost, and a member filter that scopes the charts to one person. The dashboard overview gains a team-wide "usage by member" card in team context.
- **Member-scoped views** — in team context as a member: `useApis()` already returns only granted APIs; role-gate hides "Add API", API config controls (disable/delete/rotate), grants, and all team-wide/by-member usage. A member sees only their granted APIs and their own stats. `useActiveMembership()` (role from `useTeams`) drives gating.
- **Personal mode unchanged** — with no team selected, the dashboard is exactly today's (own APIs, own usage, full config). A user who never creates a team never sees any team UI beyond the switcher's "Create team" entry.
- **`app/invite/[token]/page.tsx`** — preview + Accept (redirect to login/signup if needed, then accept).

---

## Backward-compat & migration (zero data loss, zero forced change)

- **No data is moved or reassigned.** Existing APIs/tokens stay personal (`team_id = NULL`); the only backfill is `proxy_tokens.created_by_user_id` = the owner, which is behaviorally identical.
- Clients that never send `X-Team-Id` keep working — Personal mode is the current flow.
- All 33 existing pytest cases pass unchanged (they operate in Personal mode).
- `usage_logs.user_id` shifts from "owner" to "actor"; identical for personal APIs, so no old row is reinterpreted wrongly.
- A user who never clicks "Create Team" experiences no change whatsoever.

---

## Testing strategy

Extend `backend/tests/conftest.py`: `create_team`, `invite_and_accept(admin_headers, email, role)`, `add_member`, `grant_access(admin_headers, api_id, user_id)`, `team_headers(headers, team_id)` (injects `X-Team-Id`).

- `test_personal_mode_unchanged.py` — with no `X-Team-Id`, signup→create API→token→proxy→stats behaves exactly as the existing suite (guards the "current flow still works" promise).
- `test_teams.py` — create (caller becomes owner), rename, delete-cascades, transfer; a user with no team still fully functional in Personal mode.
- `test_rbac.py` — the capability matrix: member can't create/config team APIs (403); admin can; only owner deletes/transfers/manages admins.
- `test_invitations.py` — invite→accept happy path; expired/revoked/reused token.
- `test_grants.py` — member with grant mints/lists only own tokens + sees only own usage; without grant → 403; admin sees team-wide + per-member.
- `test_grant_invalidation.py` (mirrors `test_cache_invalidation.py`) — member proxies (token cached) → admin revokes grant → next proxy call is **403 immediately**; member-removal and admin→member demotion also invalidate. Uses the `proxied` fixture.
- `test_member_monitoring.py` — admin `/usage/by-member` returns correct per-teammate breakdown; member gets 403 on by-member/team-wide endpoints; member `?member_id=` for someone else → ignored/forbidden.
- `test_cross_team_isolation.py` — team A admin can't touch team B's API/tokens/grants/usage (404); `X-Team-Id` spoofing to a non-member team rejected; a team API is invisible in Personal mode and vice-versa.
- Update `test_apis.py`/`test_tokens.py`/`test_stats.py`/`test_proxy.py` for the actor-`user_id` change (additive; personal-mode assertions hold).

Frontend e2e (Playwright): create team → invite member → member accepts → admin grants one API → member sees only that API + own usage, mints a token, proxies OK → admin views that member's usage in the by-member view → admin revokes → member's next call 403; switching back to "Personal" shows the untouched personal dashboard.

---

## Phased, incrementally shippable rollout

- **Phase 0 — schema (no behavior change).** Add models, `0002` migration (nullable `team_id`, `created_by` backfill). Everything still Personal mode. All 33 tests green.
- **Phase 1 — team context + management API.** `get_active_context`/`require_team_role`, teams + members endpoints, optional `X-Team-Id`, "Create Team" + context switcher on the frontend. Team-API create/list/config for owner/admin. Personal mode untouched.
- **Phase 2 — invitations.** Backend invite/accept + `/invite/[token]` page + members UI.
- **Phase 3 — grants + enforcement + proxy hot path.** `require_credential_access`, grant endpoints, proxy `access_ok`, `invalidate_grant`, actor-`user_id` logging, member-scoped usage. Security-critical; land with `test_grant_invalidation.py` + `test_cross_team_isolation.py`.
- **Phase 4 — per-member monitoring + frontend RBAC.** `by-member` usage endpoints + views, Access tab, role-gated nav/actions, member-scoped dashboards.
- **Phase 5 — polish** (transfer-ownership UI, team-wide dashboard cards, optional DuckDB `team_id` column).

Each phase keeps `uv run pytest -q` + `npm run build` green.

---

## Decisions (CONFIRMED with user 2026-07-05)

1. **Teams are optional/opt-in.** Personal mode is the default and unchanged; a team is created only via the "Create Team" action, which makes the caller the owner. `team_id` is **nullable** (NULL = personal).
2. **Roles = `owner | admin | member`**, one owner per team.
3. **Team deletion = cascade-delete everything** (APIs, tokens, grants, usage attribution) via `ondelete=CASCADE`; UI requires a typed confirm.
4. **Grant revocation = deny-at-proxy, keep tokens** (reversible; re-granting restores them).
5. **Owner/Admin can monitor each individual teammate's usage** (per-member breakdown + drill-down); **members see only their granted APIs and their own usage.**
6. Accepted defaults: `user_id` reused as creator (no rename); `X-Team-Id` header (absent = Personal); single-process cache invalidation; claimable-link invitations (no email); DuckDB `team_id` deferred.

### Status: PLAN ONLY — implementation not started.
When resumed, begin at **Phase 0** and keep `uv run pytest -q` + `npm run build` green at each phase.

---

## Critical files to change

- `backend/app/models.py` — new `Team`, `TeamMembership`, `ApiAccessGrant`, `TeamInvitation`; **nullable** `team_id` on `ApiCredential`, `created_by_user_id` on `ProxyToken`.
- `backend/app/teams_deps.py` (new) — `get_active_context`, `require_team_role`, `get_scoped_credential`, `require_credential_admin`, `require_credential_access`.
- `backend/app/teams.py` (new) — teams/members/invitations endpoints.
- `backend/app/proxy.py` + `backend/app/token_cache.py` — `access_ok` (personal vs team), actor-based usage logging, `invalidate_grant`.
- `backend/app/apis.py` (+ `tokens.py`, `usage.py`) — context-aware deps replacing `get_owned_credential`; grants + `by-member` usage.
- `backend/app/db/duckdb.py` — optional `user_id` filter + `usage_by_member` query.
- `backend/alembic/versions/0002_teams_rbac.py` — additive DDL + `created_by` backfill (no team backfill).
- `frontend/lib/queries.ts` (+ `lib/types.ts`, `lib/api.ts`, `app/(dashboard)/layout.tsx`) — context switcher w/ "Create Team", RBAC hooks/gating, `X-Team-Id`, grants/members/invitations UI, per-member monitoring views.
