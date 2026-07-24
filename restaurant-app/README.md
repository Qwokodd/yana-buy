# Yana Buy — Restaurant Portal

Standalone app for restaurant vendors: menu items, food orders, restaurant
settings, and the shared vendor wallet/payouts. Separate from the main
buy-app and the admin-app, but talks to the same realtime server, so a
vendor's login and data (menu, orders, wallet) are the same everywhere.

## Setup

```bash
npm install
npm run dev
```

Runs on http://localhost:5175 by default. Requires the shared `/server`
to be running (see the root README) — same server the buy-app and
admin-app use.

## Environment variables

- `VITE_SERVER_URL` — realtime server URL (default `http://localhost:4000`)
- `VITE_BUY_APP_URL` — main storefront URL, linked from the login page for
  vendors who don't have an account yet (default `http://localhost:5173`)
