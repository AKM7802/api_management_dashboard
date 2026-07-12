# API Management Dashboard — Project Description

## 1. What this project is

The API Management Dashboard is a self-hosted gateway and analytics platform for API keys. Instead of handing out a real upstream API key (an OpenAI key, an Anthropic key, or the key for any custom HTTP API) to every application, script, or teammate that needs it, a user registers the upstream API once with this platform and receives a **safe proxy token** to hand out instead. Every call made with that proxy token is transparently forwarded to the real upstream, with the real secret injected only inside the platform, never exposed to the caller. Every one of those calls is logged, giving the user (and their team) a live analytics dashboard of requests, token usage, cost, latency, and errors — per API, per token, and per team member.

In short, it offers three things bundled together:

1. **Credential custody** — upload an upstream API key once; it is encrypted at rest and never shown again (only its last four characters remain visible).
2. **A reverse proxy** — a single gateway endpoint that stands in for any upstream API. Callers authenticate with a proxy token; the platform swaps in the real key and streams the response back untouched.
3. **Usage analytics** — every proxied call is recorded and rolled up into request counts, token counts, estimated cost, latency, and error-rate charts, sliceable by time range and (for teams) by individual member.

On top of this core, the platform adds an **optional collaboration layer**: individuals can create a team, invite colleagues, and share specific APIs with specific teammates under role-based permissions, while everyone who never touches that feature keeps using the product exactly as a single-owner tool.

## 2. Who uses it and in what mode

There are exactly two "modes" a user can be in at any moment, chosen via a context switcher in the dashboard's header:

- **Personal mode** — the default and the whole product for any user who never creates a team. The user owns their APIs outright: they alone can add, configure, disable, or delete an API; mint or revoke its proxy tokens; and see its usage. There are no roles, no other viewers, nothing shared.
- **Team mode** — active only once a user has created or joined a team and has selected that team in the switcher. Inside a team, resources (APIs, tokens, usage) are governed by roles and per-person access grants rather than plain ownership. Switching back to "Personal" in the same session instantly returns to the untouched personal view — the two are entirely separate universes of data (a personal API is never visible from inside a team and vice versa).

Because teams are strictly opt-in, a brand-new signup and a long-time single-owner user experience literally no difference from today's product until they deliberately click "Create team."

## 3. Core feature: registering and using an API

### Adding an API
A user (in Personal mode, or an owner/admin in Team mode) registers an upstream API by giving it:
- a display name,
- the upstream's base URL (e.g. `https://api.openai.com`), and
- the real secret key.

Nothing about the provider is declared up front — the platform doesn't ask "is this OpenAI, Anthropic, or something else." It works with *any* HTTP API that authenticates via a bearer token or an API-key header. The key is encrypted at rest (AES via the `cryptography` library, Fernet scheme) with an operator-controlled encryption key; only the last four characters are ever shown again in the UI, for identification purposes.

An API can later be:
- **Renamed** or have its secret **rotated** (replacing the stored key without changing its identity, tokens, or usage history),
- **Disabled** (existing proxy tokens immediately start being rejected, without deleting anything — reversible by re-enabling), or
- **Deleted** (cascades: all of its proxy tokens and, for team APIs, its per-member access grants disappear with it — irreversible).

Disabling/rotating/deleting all take effect **immediately**, not after some cache delay, because the platform actively invalidates any cached authorization decision for that credential the moment it changes.

### Minting and using proxy tokens
Once an API is registered, its owner (or, for team APIs, anyone with access to it) can mint one or more **proxy tokens** — random, opaque strings prefixed `xpxy_live_...`. A proxy token is shown in full exactly once, at creation time, and only its salted hash is stored afterward — losing it means minting a new one, exactly like a password.

Client applications then call the platform's single proxy endpoint using the proxy token in place of the real key. The platform:
1. Authenticates the caller by looking up the token's hash (with a short-lived in-memory cache so this doesn't hit the database on every request),
2. Confirms the token is active, the underlying API is active, and — for team APIs — that the caller's team access hasn't been revoked,
3. Decrypts the real secret in memory only,
4. Forwards the request to the upstream's base URL, appending whatever path/query the caller used, injecting the real secret via every common auth convention (bearer header and `x-api-key` header) so it works regardless of which convention the specific upstream expects,
5. Streams the upstream's response back to the caller byte-for-byte, including Server-Sent-Events streaming (used by chat-completion "typing" responses) — the caller never notices they're going through a gateway,
6. Logs the outcome (status code, model name, token counts, latency, estimated cost) after the last byte has been relayed, so logging never adds delay to the caller's request.

A proxy token can be **revoked** individually (e.g. because a specific application/script no longer needs access) without touching the API's other tokens or its configuration. Revocation, like disabling an API, is immediate.

### Usage analytics
Every proxied call — successful or not — becomes one row of usage data (timestamp, which token/API/user it belongs to, path, model name if any, prompt/completion token counts, latency, HTTP status, estimated cost). This is aggregated into:
- **KPI tiles**: total requests, tokens, estimated cost, average latency, error rate, for a selectable time window (24 hours / 7 days / 30 days).
- **A time-series chart** of any of those metrics, bucketed by hour or by day depending on the range.
- **A status-code breakdown** (2xx/3xx/4xx/5xx) and a **model-usage breakdown** (which upstream models were actually called), drawn from the most recent requests.
- **A recent-requests table** showing individual calls with their status, model, tokens, and latency.

The platform never asks whether a registered API is an LLM provider — it figures this out for itself, automatically, by watching whether any response has actually reported token usage. Until that happens, the dashboard shows only the metrics that make sense for *any* HTTP API (requests, latency, errors); once a single response reports tokens, the token/cost-oriented charts and columns appear everywhere for that API, seamlessly.

Cost is estimated from a small built-in price table (USD per million tokens) matched by model name; it's a convenience estimate for the dashboard, not a billing feature — there is no invoicing, payment, or plan/quota system in this product.

### The personal dashboard overview
The main dashboard aggregates all of a user's own APIs (Personal mode) or all of a team's APIs the caller can see (Team mode) into one view: combined KPI tiles, a combined usage-over-time chart, a "requests by API" donut chart, a "top APIs" ranked list, and a table of every API with its live request/token counts and status — each row linking through to that API's own detail page.

## 4. The collaboration layer: teams, roles, and per-person access

### Creating a team
Any authenticated user can click "Create team" from the context switcher at any time. Doing so instantly makes them that team's **owner** — the only way a team, or the "owner" role, ever comes into existence. A user can belong to any number of teams simultaneously, plus their own Personal space, switching between them freely; each team's data is completely isolated from every other team's and from Personal mode.

### Roles
Inside a team there are exactly three roles:
- **Owner** — exactly one per team. Can do everything an admin can, plus delete the team outright, and transfer ownership to another member (making themselves an admin in the process). Ownership can never be abandoned or left empty — it can only be handed to someone else.
- **Admin** — can rename the team, invite members, create/configure/delete team APIs, grant or revoke individual members' access to those APIs, remove plain members, and monitor everyone's usage. Cannot remove or demote another admin, remove the owner, delete the team, or transfer ownership — those are owner-only.
- **Member** — the "consumer" role. Cannot configure anything or see other members' data. Can only mint/revoke their *own* proxy tokens and view their *own* usage, and only for APIs an admin/owner has explicitly granted them.

Owners and admins automatically have full access to every API belonging to their team — they never need an explicit grant. Grants exist purely to extend access to plain members on a case-by-case basis.

### Adding APIs to a team
An owner/admin adds an API to a team in one of two ways:
- **Create new** — identical form to a personal API (name, base URL, secret); the resulting API belongs to the team from the start.
- **Use an existing personal API** — a one-way "attach" action that moves one of the admin/owner's own already-registered personal APIs into the team, carrying its proxy tokens and usage history with it, so a key that was originally added under Personal mode doesn't have to be re-entered from scratch. There is no path back from team to personal for that API.

### Inviting members
Because there is no email infrastructure in this version, invitations work as **shareable claim links** rather than sent emails:
1. An owner/admin creates an invitation for a specific email address and a chosen role (admin or member).
2. The platform returns a raw, one-time invite link (`/invite/<token>`) that the admin copies and delivers to the invitee by whatever channel they like (chat, email client, etc.).
3. Opening the link shows a public preview — which team, and which role — without requiring login, so the recipient knows what they're being asked to join before signing up.
4. The recipient logs in (or signs up, if new) and accepts. Acceptance is bound to the email address the invite was addressed to, so a leaked or forwarded link can't be claimed by an unintended account.
5. Invitations expire after 7 days, can be revoked by an admin/owner before they're used, and re-inviting someone already pending or already a member is rejected rather than creating a duplicate.

### Managing membership
Owners/admins see a members list (email, role, join date) with:
- **Role changes** — an admin/owner can promote/demote a plain member to/from admin; only the owner can change another admin's role or remove an admin outright; the owner's own role can only change via the explicit ownership-transfer action.
- **Removal** — removing a member deletes their membership, deletes every access grant they held on that team's APIs, and immediately invalidates any of their currently-cached proxy-token authorizations, so their tokens stop working at the very next call rather than after some delay.
- Demoting an admin down to a plain member has the same "immediate loss of implicit access" effect — from that moment they only retain access to APIs they hold an explicit grant for.

### Per-API access grants
Access to a specific team API is granted **per person, per API** — never per team as a whole. On a given API's own "Access" tab, an admin/owner sees every plain member of the team with a simple granted/not-granted toggle. Granting access lets that member mint/list/revoke their own proxy tokens for that one API and see their own usage of it; it grants nothing for any other API. Two members of the same team can therefore have completely different sets of usable APIs with zero coupling between them.

Revoking a grant is **deny-at-proxy, tokens kept**: the member's existing proxy tokens are not deleted, but the very next call made with them is rejected (403) the instant the grant is removed. If the same access is granted again later, those same tokens work again immediately — nothing needs to be reissued. This same "instant recheck" behavior also applies automatically whenever someone is removed from a team or demoted from admin to member.

### Monitoring usage as an owner/admin
Owners and admins get visibility no plain member has:
- **Team-wide usage** — combined KPIs and a per-member breakdown ("who used how many requests/tokens/cost/errors, across every API the team owns") on the dashboard's Members tab.
- **Per-API usage by member** — on a single API's own Usage tab, a table breaking that one API's usage down by which teammate made each call.
- **A dedicated per-member page** — clicking "View details" on any member opens a read-only page scoped to that one person: their own KPI tiles, their own usage-over-time chart, a "requests by API" breakdown, and the exact list of APIs they're granted (marked "Always" for owners/admins, "Granted" for members) alongside their actual usage of each. This page is for *reviewing* a member's access and activity in one place; the actual granting/revoking of access still happens on each API's own Access tab, not here.

### What a plain member sees
A member's dashboard, in team context, shows only the APIs they've been individually granted — never the full team roster of APIs, never any configuration controls (no "Add API," no disable/delete/rotate, no Access tab), and never any other member's tokens or usage. Their own usage charts and tables are automatically scoped to their own activity only; there is no way for them to view, request, or infer a teammate's numbers. If they try to reach an API they haven't been granted (whether through the UI or by calling the proxy with a token for it) the platform returns a 403 rather than revealing that the API exists at all in an ambiguous way.

### Team settings vs. the dashboard
Deliberately, member/invitation/per-member-usage management all live on the **dashboard itself** (a "Members" section that appears alongside "Overview" whenever a team is active), not on a separate settings screen — so that day-to-day team administration is one click away rather than buried in a settings page. The dedicated **Team settings** page (reached from the account menu, visible only to owners/admins) is intentionally minimal: renaming the team, and — owner only — permanently deleting it. Deleting a team is a destructive, typed-confirmation action (the admin must retype the team's exact name) because it cascades: every team API, every token on those APIs, and every access grant disappears with it, all at once, irreversibly.

## 5. Account and access basics

- **Sign up / log in** — email + password (minimum 8 characters); a successful signup or login returns a session token used for all subsequent requests. There is no email verification or password-reset flow in this version.
- **Session handling** — the frontend keeps the session token client-side and attaches it to every API call; if it's missing or has expired, the user is redirected back to the login screen automatically.
- **Active-team selection** — which context (Personal or a specific team) is "active" is remembered per browser session and sent along with every request; omitting it always means Personal mode, which is why nothing about the existing single-owner flow changes for someone who never touches teams.
- **Secrets are one-way** — both upstream API keys and proxy tokens are shown in full exactly once (at creation/rotation time) and are unrecoverable afterward by design; losing either means creating a replacement, not "looking it up again."

## 6. Marketing / landing experience

Signed-out visitors land on a public marketing page (separate from the authenticated dashboard) that explains the product for newcomers: a hero pitch, a strip of headline capabilities, a "how it works" walkthrough (register an API → get a proxy token → call the proxy → watch usage), a fuller features grid, a diagram of the system's architecture, a section on how secrets are protected, an FAQ, and a closing call-to-action pointing at sign-up. This page is search-engine-optimized and statically generated since it doesn't depend on any signed-in user's data.

## 7. End-to-end usage walkthroughs

### A. Solo developer, Personal mode (the default flow)
1. Sign up with an email and password.
2. Click "Add API," give it a name, its base URL, and paste in the real key (e.g. an OpenAI key). It's encrypted immediately; only its last four characters remain visible from then on.
3. Open the new API's **Access Tokens** tab and create a token — the raw `xpxy_live_...` value is shown once, alongside a ready-to-copy example request.
4. Point the application at the platform's proxy endpoint using that token instead of the real key. Requests flow through exactly as if hitting the real upstream, including streaming responses.
5. Open the API's **Usage** tab to watch requests, token counts, cost, latency, and errors accumulate in near-real time, with drill-down into individual recent requests.
6. If the token or the API itself is ever compromised or no longer needed, revoke the token or disable/delete the API — the change takes effect on the very next call.

### B. Growing into a team
1. From the context switcher, click "Create team" and name it — the creator becomes its owner instantly, with nothing changing about their existing personal APIs.
2. Add an API to the team (fresh, or by attaching one of their own existing personal APIs so its history carries over).
3. Invite a colleague by email, choosing whether they join as an admin or a plain member; share the resulting one-time invite link with them.
4. The colleague opens the link, sees a preview of the team/role they're being invited into, signs up or logs in, and accepts — becoming a team member immediately.
5. As a plain member, they see nothing yet: the owner/admin opens the specific API's **Access** tab and grants that member access to it.
6. The member can now mint their own token for that one API and use the proxy exactly like a personal user would, but their usage and dashboard are scoped strictly to what they've been granted.
7. The owner/admin monitors the whole team's activity from the dashboard's Members tab (aggregate + per-member breakdown) and can drill into any individual member's dedicated usage page at any time.
8. If that member's role or access ever needs to change — a different API grant, a promotion to admin, removal from the team entirely — the change is enforced at the very next proxy call, with no stale access window.

### C. Multi-team collaborator
A single user can be the owner of one team, an admin of another, and a plain member of a third, all while also keeping personal APIs entirely separate from any of them. Switching the active context in the header instantly changes what the whole dashboard shows — APIs, tokens, usage, and available actions are all recomputed for whichever context (Personal or a specific team) is currently selected, with the underlying permissions (owner/admin/member, or plain ownership in Personal mode) enforced identically regardless of which context they came from.
