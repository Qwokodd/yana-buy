# Yana Buy Admin — Marketplace Management (React)

The admin/management app for the Yana Buy marketplace demo. This is a **separate project**
from the main `yana-buy` site on purpose: visitors and vendors browsing the main site have
no link to this app, no admin login form, and no admin pages ever ship in their bundle.

## Features

- Admin-only login (`/login`) — rejects any non-admin credentials
- Approve / reject vendor store applications
- List products **on behalf of individual sellers** who don't want a full store
  (name + phone captured, shown as "sold by [name], individual seller")
- Manage all products platform-wide (feature/unpublish/remove)
- Manage categories (add/edit/delete)
- Manage users and roles
- View & update all orders

## Getting started

```bash
npm install
npm run dev
```

Opens on **http://localhost:5174** by default (the main `yana-buy` app uses 5173, so you
can run both at once during development).

To build for production:

```bash
npm run build
npm run preview
```

## Demo account

| Role  | Email           | Password |
|-------|-----------------|----------|
| Admin | admin@yanabuy.com | admin123 |

## How this connects to the main site

This demo has no real backend — both this app and the main `yana-buy` site use the
browser's `localStorage` as a stand-in database, under the same `yanabuy_` key prefix
(categories, products, stores, orders, users). `localStorage` is scoped **per browser
origin** (protocol + domain + port), not per app, so:

- **Same domain, different path** (recommended): deploy the main site at `yanabuy.com/`
  and this app's build output at `yanabuy.com/admin/`. Same origin → same localStorage →
  changes made here (approving a store, editing a category, etc.) show up on the main
  site immediately, and vice versa. `vite.config.js` already sets `base: '/admin/'` for
  production builds so the built files work when copied into an `/admin` subfolder.
- **Different domain/subdomain** (e.g. `admin.yanabuy.com` vs `yanabuy.com`): these are
  different origins, so the two apps will **not** share data as a static demo. At that
  point you'd want a real backend/database shared by both apps instead of localStorage
  (see the main project's README, "Going to production").
- **Local development**: this runs on port 5174 and the main site on 5173 — different
  origins, so they won't share data locally either. That's only a dev-time convenience
  limitation; it works correctly once both are built and deployed to the same domain as
  described above.

Login sessions are kept separate on purpose: this app stores its session under
`yanabuy_adminSession`, while the main site uses `yanabuy_session`. So signing in here does
not also sign you into the customer/vendor site, even when both share the same origin.

## Project structure

```
src/
  data/seed.js         same seed data as the main site (categories, users, stores, products)
  utils/storage.js     localStorage helpers + USD/LRD currency formatter (same yanabuy_ prefix)
  context/             AuthContext (admin-only login), DataContext
  components/          AdminLayout (header + logout), DashboardShell, ProtectedRoute, ...
  pages/               AdminLogin + all management screens
```

## Going to production

Same recommendations as the main site's README — swap `DataContext`/`AuthContext` for
real API calls to a shared backend, add real authentication (hashed passwords, sessions
or JWTs), and consider putting this app behind an extra layer of protection appropriate
for a staff-only tool (VPN, IP allowlist, SSO, etc.) since a login form alone is only as
strong as the password behind it.
