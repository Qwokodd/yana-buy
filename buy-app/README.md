# Yana Buy — Buy & Sell Marketplace (React)

A Jumia-style multi-vendor marketplace built with React, React Router and Tailwind CSS.
This app has two customer-facing experiences: **Customer** and **Vendor**, plus a
checkout flow with a Visa/Mastercard card form and a Mobile Money form.

Marketplace **management (Admin)** lives in a separate project — `yana-buy-admin`, a sibling
folder next to this one — so visitors and vendors browsing this site never see an admin
login link or any management screens. See that project's own README for details, and
"Admin app" below for how the two connect.

This is a fully working **front-end demo**. It uses your browser's `localStorage` as a
mock database (no server required), so you can run it and click through every flow —
sign up, open a store, list products, browse, add to cart, and check out — immediately.
Read "Going to production" below for what to change to make it a real, live marketplace.

## Features

**Customer**
- Browse by category, search products & stores, view product detail pages
- Cart, multi-step checkout (address then payment), order history, profile editing
- Sign up / log in

**Vendor**
- Apply to open a store (goes to admin for approval)
- Store settings (name, description, logo, location)
- Add / edit / delete products, publish/unpublish
- View orders containing their products, revenue stats

**Payments**
- Visa / Mastercard card form (name, number, expiry, CVV) with Luhn validation
- Mobile Money form (MTN / Vodafone / AirtelTigo) with number validation
- Simulated processing — see "Going to production" for wiring up real gateways

## Admin app

Approving vendor stores, managing categories/products/users, and viewing all orders is
all done from the separate `yana-buy-admin` project, not this one. That app:

- Has its own login screen, not linked from anywhere on this site
- Shares the same demo "database" (localStorage, same `yanabuy_` key prefix) **only when
  both apps are deployed on the same domain** — e.g. this site at `yanabuy.com/` and the
  admin build at `yanabuy.com/admin/`. Its `vite.config.js` already sets `base: '/admin/'`
  for production builds to make that easy.
- If deployed on a different domain/subdomain instead (e.g. `admin.yanabuy.com`), the two
  apps won't share localStorage — you'd need to move to a real shared backend/database
  first (see "Going to production").
- In local development the two run on separate ports (this app on 5173, admin on 5174 by
  default) and so will **not** share data — that's expected, and only matters for local
  testing convenience, not production.

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

To build for production:

```bash
npm run build
npm run preview
```

## Demo accounts

| Role     | Email               | Password    |
|----------|---------------------|-------------|
| Vendor   | vendor@yanabuy.com    | vendor123   |
| Customer | customer@yanabuy.com  | customer123 |

The admin demo account lives in the separate `yana-buy-admin` project, not here — signing
in with admin credentials on this site's login page is intentionally rejected.

Or just click "Create account" / "Sell on Yana Buy" to sign up as a new customer or vendor.

For card payments in the demo, any Luhn-valid card number works, e.g. 4242 4242 4242 4242,
any future expiry (MM/YY) and any 3-digit CVV. For Mobile Money, any 10-digit number
starting with 0 works, e.g. 0244123456.

## Project structure

```
src/
  data/seed.js            mock categories, users, stores, products
  utils/storage.js        localStorage helpers + USD/LRD currency formatter
  context/                AuthContext, DataContext, CartContext (app "backend")
  components/              shared UI: Navbar, ProductCard, PaymentForm, DashboardShell...
  pages/                  public pages (Home, ProductDetail, Cart, Checkout, ...)
  pages/customer/         customer account pages
  pages/vendor/           vendor dashboard pages
```

Admin dashboard pages live in the sibling `yana-buy-admin/` project, not in this one.

## Going to production

This project intentionally has no backend so it can run anywhere instantly. To turn it
into a real marketplace you'd typically:

1. **Replace DataContext / AuthContext with real API calls** to a backend
   (Node/Express, Django, Laravel, etc.) backed by a real database (Postgres, MySQL).
   Keep the same function signatures (login, addProduct, createOrder, ...) and swap
   their internals from localStorage to fetch/axios calls — the UI won't need to change.
2. **Real authentication**: hash passwords (never store plaintext), use sessions or JWTs,
   and add email/phone verification.
3. **Real payments**:
   - **Visa/Mastercard**: integrate a PCI-compliant processor such as Stripe,
     Paystack, or Flutterwave. Never collect raw card numbers on your own server —
     use the provider's hosted fields / Elements / Checkout so card data never touches
     your backend.
   - **Mobile Money**: integrate a local aggregator such as Paystack, Flutterwave,
     or Hubtel, which support MTN Mobile Money, Vodafone Cash and AirtelTigo Money via
     a single API — they handle the USSD/STK push prompt to the customer's phone.
   - Swap the setTimeout simulation in src/components/PaymentForm.jsx for a real API
     call to your backend, which in turn calls the payment provider and returns a
     transaction reference.
4. **File uploads**: replace the emoji/color placeholder images (ProductThumb.jsx) with
   real image uploads (e.g. to S3/Cloudinary) once a backend exists.
5. **Search**: for large catalogs, move search to a real search service (Algolia,
   Meilisearch, Postgres full-text search) instead of the client-side filter used here.

## Notes

- All data lives in your browser's localStorage under keys prefixed yanabuy_. Clearing
  your browser storage resets the demo back to the seeded data.
- This is a demo project and is not affiliated with or endorsed by Jumia.
