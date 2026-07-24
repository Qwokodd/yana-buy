# Yana Buy — live sync (Option B: Socket.io)

Why nothing showed up live before: **there was no backend at all.** Both apps
stored everything in `localStorage`, each on a different port (5173 vs 5174)
— which are different origins, so they couldn't even see each other's data,
live or not.

This adds a small shared backend (`/server`) that both apps now talk to. It
holds the real data (categories, stores, products, orders, users) and pushes
every change to every connected client instantly over Socket.io.

## What changed

- **`/server`** — new Node/Express + Socket.io server. Single source of
  truth, persisted to `server/db.json` (auto-created from the old seed data
  on first run).
- **`admin-app/src/utils/socket.js`**, **`buy-app/src/utils/socket.js`** —
  new: one shared socket connection per app.
- **`DataContext.jsx`** (both apps) — no longer reads/writes localStorage
  for categories/stores/products/orders. Instead: loads the current state
  from the server on connect, and every `addProduct`, `createStore`,
  `updateProduct`, `createOrder`, etc. now also emits a socket event. Every
  other open tab/app receives that event live and updates its state —
  that's the actual fix for "no live reaction."
- **`AuthContext.jsx`** (both apps) — same idea for the `users` list, so a
  vendor signup in the buy app shows up in the admin app immediately. Login
  sessions stay local to each app/browser as before (`session` /
  `adminSession` keys), so this doesn't cross-login you.

## Running it

Four processes, four terminals:

```bash
# 1. the shared backend
cd server
npm install
npm start          # http://localhost:4000

# 2. the buy app (customer shopping + marketplace vendor dashboard)
cd buy-app
npm install
npm run dev         # http://localhost:5173

# 3. the admin app
cd admin-app
npm install
npm run dev         # http://localhost:5174

# 4. the restaurant app (restaurant vendor dashboard, separate from buy-app)
cd restaurant-app
npm install
npm run dev         # http://localhost:5175
```

Open them side by side. Add a product in the admin app (or approve a
vendor, or sign up a vendor from the buy app) — it now appears in the other
apps immediately, no refresh.

A vendor's login works the same way in `buy-app` and `restaurant-app`
(same email/password, same account) since both read the same user list from
the server — but signing in on one doesn't sign you in on the other, and a
vendor without a restaurant just sees an "open your restaurant" prompt in
`restaurant-app` until they set one up.

## Deploying

Point both frontends at your deployed server by setting `VITE_SERVER_URL`
(e.g. in a `.env.production` in each app):

```
VITE_SERVER_URL=https://your-server.example.com
```

And run the server itself anywhere that can host a long-lived Node process
(a plain VM, Render, Railway, Fly.io, etc.) — it needs a persistent
filesystem for `db.json` and the `uploads/` folder, or swap those for a
real database + object storage (S3, R2, etc.) later.

## New features (product photos, China sourcing, food ordering)

**Up to 5 real photos per product/menu item** — `POST /api/upload` (multer)
saves files to `server/uploads/` and returns URLs; the `MultiImageUpload`
component (used in the product form, the sourcing request form, and the
menu item form) uploads on selection and stores the resulting URLs in an
`images` array (max 5, 5MB each). This replaced the old single base64
`image` field, so the "database" stays small and photos load as normal
`<img src>` requests instead of giant inline blobs.

**Ship/buy from China** — two parts, as requested:
- Any product can be flagged "Ships from China" with an estimated delivery
  time (vendor product form) — shows a badge on the product card and detail
  page.
- A separate **China sourcing** request flow (`/sourcing` in the buy app):
  a customer describes what they want (link, photos, quantity, budget), and
  admin reviews it under **China sourcing** in the admin app, sends back a
  landed price + delivery estimate, and the customer accepts the quote.

**Order food** — a self-contained section, separate from the marketplace
cart/checkout (so a food order and a marketplace order can be placed
independently):
- Customers: `/food` → browse restaurants → add items → `/food/cart` →
  `/food/checkout` (same address + payment flow as the marketplace
  checkout) → `/account/food-orders` for history.
- Vendors: any vendor account can open a restaurant from
  **Restaurant settings** in their dashboard, add dishes under
  **Menu items**, and manage incoming orders under **Food orders**.
- Admin: **Restaurants** to approve/reject restaurants, **Food orders** to
  track and update order status platform-wide.
- Two demo restaurants (Sarah's Kitchen, Golden Wok) with a few menu items
  are seeded so there's something to see on first run.


## Known limits (demo-grade, worth knowing about)

- `db.json` is a flat file, not a real database — fine for a demo/prototype,
  not for concurrent production traffic.
- No auth/validation on the socket events — anyone who can reach the server
  can emit any event. Fine on localhost, not for a public deploy as-is.
- If a client emits a mutation right as it's reconnecting (e.g. brief wifi
  drop), that specific event can be missed by other clients. Full state is
  always resynced on the next `state:init`, though, so nothing gets
  permanently out of sync.
