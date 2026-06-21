# Admin nav tree — `/admin` flat nav → expandable tree (design)

Date: 2026-06-21
Status: approved (brainstorming) — pending spec review
Branch: `feat/admin-nav-tree`

## Goal

Turn the flat `/admin` sidebar nav into an **expandable tree** grouped by domain, and
move "My profile" out of the nav into a user-button popover. This is **Frente 1** of
flex's backlog. The admin keeps growing (Articles, Community, Compliance, Billing,
Settings), and a single flat list no longer scales — especially for ADMIN, who sees
every item. The change is **100% frontend**: no routes change, no schema/migrate, no
server actions touched. Navigation is purely additive (every page stays where it is).

### Non-goals (explicitly out of scope, YAGNI)

- No drag-to-reorder, no nav search/filter, no breadcrumbs.
- No "rail" mode (icon-only collapsed sidebar) — sidebar keeps its current width.
- No route changes; the Billing overview page and its card grid stay as-is (the tree
  just *also* exposes the billing sub-pages).
- No changes to `currentUser()`, privileges, middleware, or any server action.

## Decisions (locked during brainstorming)

1. **Taxonomy = 5 groups, everything grouped** (no loose top-level leaves):
   Articles · Community · Compliance · Billing · Settings.
2. **Expand/collapse = auto + persist.** On load the group containing the active
   route auto-expands; others start collapsed. Multiple groups may be open at once.
   The user's manual toggles persist in `localStorage` across navigation/reload.
3. **User button = popover menu.** Clicking the footer user button (avatar initials +
   name/role) opens a popover with **My profile · View articles ↗ · Sign out**.
   "My profile" leaves the nav entirely.
4. **List leaf renamed** `Articles` → **"All articles"** to avoid the redundant
   "Articles > Articles".

## Final tree (with privilege gating)

```
▾ Articles                                    (always visible)
   All articles      /admin
   New article       /admin/articles/new
▾ Community
   FUEL              /admin/fuel                   MANAGE_FUEL
   Referral codes    /admin/codes                  MANAGE_REFERRAL_CODES
▾ Compliance
   KYC review        /admin/kyc                    MANAGE_AML
   FinCEN filings    /admin/fincen                 MANAGE_AML
   MTL licensing     /admin/mtl                    MANAGE_AML
▾ Billing                                          (every item: MANAGE_BILLING)
   Overview          /admin/billing
   Subscriptions     /admin/billing/subscriptions
   Promo codes       /admin/billing/promo
   Treasury          /admin/billing/treasury
   Issuing           /admin/billing/issuing
   Offramp           /admin/billing/offramp
   Customers         /admin/billing/customers
   Applications      /admin/billing/applications
▾ Settings
   Users             /admin/users                  MANAGE_USERS
   API keys          /admin/api-keys               MANAGE_API_KEYS
   Audit log         /admin/audit                  VIEW_AUDIT
```

Group icons (lucide, swappable): Articles=`FileText`, Community=`Megaphone`,
Compliance=`ShieldCheck`, Billing=`CreditCard`, Settings=`Settings`. Leaves keep their
current icons. Expand indicator = `ChevronRight` rotating to down when open.

## Architecture (3 new units + AdminShell refactor)

```
lib/cms/admin-nav.ts          (NEW; pure data + helpers, NO React — the testable core)
  ├─ NAV_GROUPS: NavGroup[]    { key, label, icon, items: NavItem[] }
  │                            NavItem { label, href, privilege?, icon }
  ├─ visibleNav(privileges)    -> NavGroup[]   filters items by privilege,
  │                                            DROPS groups whose items all filtered out
  └─ isItemActive(href, path)  -> boolean      active-route matching rules

components/cms/AdminNav.tsx    (NEW; "use client") renders the tree
  ├─ props: { privileges: string[]; onNavigate?: () => void }
  ├─ usePathname() for active highlight + auto-expand
  ├─ expand/collapse state (useState + localStorage)
  └─ leaf <Link> calls onNavigate (mobile drawer close); group <button> does NOT

components/cms/UserMenu.tsx    (NEW; "use client") footer user button + popover
  ├─ props: { name, email, role }
  ├─ button: avatar (initials) + name/role
  └─ popover: My profile (/admin/profile) · View articles ↗ (/articles) · Sign out (logout action)
            closes on outside-click / Esc

components/cms/AdminShell.tsx  (REFACTOR) uses <AdminNav> + <UserMenu> in BOTH
  the desktop sidebar and the mobile drawer; brand unchanged; drawer close now wired
  via AdminNav's onNavigate (removed from the old <nav onClick>)
```

### Why this split

- The gating + active-matching logic (`admin-nav.ts`) is pure functions with **no
  React**, so it is fully unit-testable without a DOM and holds the whole nav shape in
  one place.
- `AdminNav` is one focused client component used in two places (desktop + drawer),
  so the tree behaves identically in both and the drawer no longer needs the blanket
  `onClick` close that would otherwise also fire on group toggles.
- `UserMenu` isolates the account popover (outside-click/Esc, the logout form).

## Data flow & state logic

### Privilege gating
`AdminLayout` already passes `user.privileges` into `AdminShell`. `AdminShell` passes
them to `AdminNav`, which calls `visibleNav(privileges)`:
- An item with a `privilege` is kept only if `privileges.includes(privilege)`.
- An item with no `privilege` (All articles, New article) is always kept.
- A group with **zero** visible items is dropped entirely. So a user with no
  privileges sees only **Articles**; a `MANAGE_AML`-only user sees only **Compliance**
  (3 items); an ADMIN sees all 5 groups.

### Expand/collapse (hydration-safe)
- `localStorage["subfrost.adminNav.open"]` = JSON `Record<groupKey, boolean>` of the
  user's **explicit** toggles only (not every group's state).
- Effective open state of a group:
  `explicit[key] !== undefined ? explicit[key] : groupContainsActiveRoute(group)`.
  → the active group auto-opens; the user can collapse it (persisted) or open others
  (persisted); a persisted choice always wins over the auto default.
- `useState<Record<string,boolean>>({})` initial (no explicit toggles); `localStorage`
  is read in a `useEffect` **after mount** and merged in. The first server+client
  render therefore uses only the pathname-derived defaults (pathname is available to a
  client component during SSR), so there is **no hydration mismatch**; persisted
  toggles apply on the next paint.
- Toggling a group sets `explicit[key] = !effectiveOpen(key)` and writes localStorage.

### Active highlighting & matching (`isItemActive`)
- Exact match for `/admin` and `/admin/billing` (so the Articles/Billing overview
  leaves don't match every descendant).
- **All articles** is active when `pathname === "/admin"` OR
  (`pathname.startsWith("/admin/articles/")` AND `pathname !== "/admin/articles/new"`)
  — i.e. it also highlights while editing an article (`/admin/articles/[id]`).
- **New article** is active only when `pathname === "/admin/articles/new"`.
- Billing sub-pages and all other leaves: exact `pathname === href`.
- A leaf renders with an active style (accent bg/text). A group whose active leaf is
  inside but which is **collapsed** shows a small accent dot on its header.

### Mobile drawer
The existing drawer in `AdminShell` is preserved. `AdminNav` receives
`onNavigate={() => setOpen(false)}`; it is called **only** from leaf `<Link>` clicks,
so navigating closes the drawer but tapping a group chevron does not. The `<UserMenu>`
popover works inside the drawer too.

## Error / edge handling

- `localStorage` access wrapped in try/catch (private-mode / disabled storage → fall
  back to in-memory state, no crash).
- Corrupt JSON in the storage key → caught, treated as `{}`.
- A group that becomes empty after gating is never rendered (no empty headers).
- `UserMenu` popover: closes on outside-click and Esc; the Sign-out item submits the
  existing `logout` server action form (unchanged behavior).
- No active route inside any group (e.g. a future orphan path) → all groups use their
  auto default (collapsed), nothing breaks.

## Testing

All under `tests/cms/` (matches existing layout; vitest + happy-dom + RTL already set
up; `@/` alias; `usePathname` mocked via `vi.mock("next/navigation")`).

- **`tests/cms/admin-nav.test.ts`** (pure, no DOM):
  - `visibleNav([])` → only the Articles group (2 items).
  - `visibleNav(["MANAGE_AML"])` → only Compliance (3 items); other groups dropped.
  - `visibleNav(ALL_PRIVILEGES)` → all 5 groups with full item counts.
  - empty group is dropped (no group with 0 items in output).
  - `isItemActive` truth table: `/admin`, `/admin/articles/abc` (edit),
    `/admin/articles/new`, `/admin/billing`, `/admin/billing/treasury`, a
    non-matching path.
- **`tests/cms/admin-nav-tree.test.tsx`** (RTL, mock `usePathname`):
  - clicking a group header toggles its children's visibility and `aria-expanded`.
  - active route auto-expands its group and the active leaf gets the active style.
  - persistence: toggling writes `localStorage`; re-rendering a fresh instance
    restores the toggled state.
  - clicking a leaf calls `onNavigate`; clicking a group header does **not**.
- **`tests/cms/user-menu.test.tsx`** (RTL):
  - button shows name/role and computed initials.
  - clicking it opens the popover with the three items (My profile, View articles,
    Sign out).
  - the Sign out control is inside a form posting to the `logout` action.

Existing `tests/admin/*` (dashboard + new-article guard) stay green — the layout/page
files those cover are not modified beyond AdminShell's internal composition.

## Verification & deploy

- `node_modules/.bin/tsc --noEmit` → 0 errors.
- `CI=true node_modules/.bin/vitest run` → all green (new specs + existing 461).
- `node_modules/.bin/next build` → 0 errors.
- Ship: `feat/admin-nav-tree` → PR → merge to `main`. **No schema change**, so no
  `prisma migrate diff` / migrate-job concern. Go-live via the standard Flux path
  (bump `newTag` in `k8s/kustomization.yaml` after the regional image builds).
- Live check: `curl -I https://subfrost.io/admin` → 307; logged in, the tree renders,
  the active group is expanded, and the user popover works on desktop + mobile.
