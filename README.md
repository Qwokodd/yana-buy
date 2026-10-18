# YanaBuy v3

Buy, sell and order food in Liberia. One API server, a website, an admin console and a phone app, all in this folder.

```
apps/server   API (Express + PostgreSQL)           http://localhost:4000
apps/web      Shop website (Next.js)                http://localhost:3000
apps/admin    Admin console (Next.js)               http://localhost:3001
apps/mobile   Phone app (Expo / React Native)       Expo Go on your phone
packages/shared   Code all apps share: API client, phone numbers, money, colours
packages/web-kit  Buttons, forms, photo upload and login used by web + admin
```

## First time

Run these from this folder (`yanabuy-v3`):

```bash
npm install
npm run db:up
npm run create-admin -- --phone 0770000001 --password "adminpass123" --name "YanaBuy Admin"
```

- `db:up` starts the v3 database in Docker. It uses its own storage and port 5433, so it never touches the old v2 database.
- `create-admin` makes the first admin (or turns an existing account into an admin). Run it again any time with a new `--password` to reset that admin's password.
- The database tables are created and updated automatically every time the server starts. Nothing ever resets the database.

## Every day

Stop the old v2 apps first (they use the same ports). Then open four terminals in this folder:

| Terminal | Command | Opens |
|---|---|---|
| 1 | `npm run dev:server` | API on port 4000 |
| 2 | `npm run dev:web` | http://localhost:3000 |
| 3 | `npm run dev:admin` | http://localhost:3001 |
| 4 | `npm run dev:mobile` | QR code for Expo Go |

Docker must be running. If the database stopped, run `npm run db:up` again.

## The phone app

1. Install **Expo Go** from the Play Store or App Store.
2. Connect the phone to the **same Wi-Fi** as your computer.
3. Run `npm run dev:mobile` and scan the QR code (Android: in Expo Go, iPhone: with the Camera app).
4. If Windows asks whether to allow Node.js on your network, click **Allow** — the phone needs to reach the API on port 4000.

The app finds the API on your computer by itself. If it can't, copy `apps/mobile/.env.example` to `apps/mobile/.env` and set your computer's Wi-Fi IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:4000`.

## Settings (optional)

Everything works without settings files in development. Before going live, copy `apps/server/.env.example` to `apps/server/.env` and set real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` values — the server refuses to start in production without them.

## What's built

### Shops directory, delivery areas, discounts, wishlist, notifications, bookings
- **Shops & Restaurants directory** (`/shops` on web, "Browse all shops" on the phone): each shop picks a category and opening hours in its settings; shop pages show the address, hours and a "Get directions" link.
- **Delivery fees by area**: Admin → Delivery fees → add areas (e.g. Sinkor, Paynesville) with their own fee. When any area is on, buyers must pick one at checkout. "Free over" still applies.
- **Discount codes**: Admin → Discount codes. Percent or fixed, minimum spend, goods/food/all, dates, usage limits. YanaBuy pays the discount — sellers still earn on the full item price. Import Shopify codes with `npm run import-shopify -- --only discounts --shop-phone <phone>`.
- **Wishlist**: tap ♡ on any product. People who saved a product get told when its price drops.
- **Notifications**: the bell (web header, phone Profile) for order steps, new orders, chat messages, approvals, payouts, disputes and bookings. Phone push needs a development/store build made with EAS (Expo Go shows only the in-app bell).
- **Bookings**: restaurants take table bookings; stores can mark products as bookable services (with a length). Shops switch bookings on and set days, hours, slot length and capacity under Sell → Table bookings / Appointments, then confirm or decline requests. Admin → Bookings shows them all.

### Forgot password, admin messages, work profiles, phone push
- **Forgot password**: "Forgot your password?" on login (web and app). A 6-digit code goes to the account's confirmed email and by SMS (when Twilio is set); entering it sets a new password and logs out other devices.
- **Admin → Send a message**: everyone / buyers / vendors / riders / one person (from Buyers & accounts), Liberia / USA / both, by in-app + phone notification, email and/or SMS. Shows how many people it reaches first, and keeps a history.
- **Work profile** (Sell → Work profile, or Profile & gallery for restaurants): tagline, about, years of experience, skills, certifications, areas served, languages, "comes to you / at our place", video links (YouTube plays on the page), and a portfolio of past work (up to 60 pieces, 10 photos + a video each, reorderable). Shown on the shop page with a "Services & prices" list of bookable services.
- **Phone push** needs a real app build (not Expo Go): see apps/mobile/eas.json and app.config.js, and the steps in the chat / project notes (Expo account → `eas init` → Firebase google-services.json + FCM key → `eas build -p android --profile preview`).

### Email & SMS
- Sign-up asks for an email. A 6-digit code is emailed; checkout, opening a shop, bookings, rider sign-up and China requests need a confirmed email. Existing accounts are asked to add/confirm theirs (website and phone app open "Confirm your email"; admins see a box at the top of the dashboard).
- Every notification (orders, messages, approvals, bookings, payouts, disputes, price drops) also goes by email (confirmed addresses) and SMS. Chat sends at most one email/text per conversation every 10 minutes.
- Admins get email + SMS for: shops, products and riders to approve, payout requests, reported problems, China requests, and orders that need a rider.
- Set it up in apps/server/.env (see .env.example): SMTP_HOST/PORT/USER/PASS + MAIL_FROM for email, TWILIO_ACCOUNT_SID/AUTH_TOKEN + TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID) for SMS, WEB_URL and ADMIN_URL for links. Until SMTP is set, email isn't required and codes print in the server window.

### Countries (Liberia / USA)
- A country switch in the header (website) and on Home (phone app). People only see shops, products, shop categories and banners from the country they pick. The first time, it's guessed from the device's time zone (US time zones → USA, otherwise Liberia) and then remembered.
- Sign-up and login accept Liberian (+231) and US (+1) numbers.
- Sellers pick their country when they apply; existing shops are Liberia. Admin → Vendors filters by country and can move a shop ("Move to USA").
- Admin → Delivery fees has a tab per country: its own base fee, free-delivery amount and delivery areas. Until the USA fee is filled in, USA orders use Liberia's fee.
- Mobile money is Liberia-only; USA orders pay on delivery. A cart can only check out items from the country being shopped in.
- Admin → Banners → "Show in": all countries, or one.
- A shared link to a shop or product from the other country still opens, with a "Switch to …" button.

### Bringing over the old Shopify store

1. Put the Shopify export CSV files (products, customers, orders — unzipped) in the `shopify-import` folder in this project.
2. **Practice run** (changes nothing, writes `shopify-import/import-report-practice.txt`):
   `npm run import-shopify -- --dry-run --shop-phone 0770123456`
3. **Real import** — downloads every photo into `apps/server/uploads/shopify` (keep the computer online; it can take a while):
   `npm run import-shopify -- --shop-phone 0770123456`
   `--shop-phone` is the number shown on imported shops until each owner takes over (YanaBuy customer care). Safe to run again: it updates what it already brought over.
   Testing photos on a phone? Add `--public-url http://<this computer's Wi-Fi IP>:4000` (or set PUBLIC_URL in apps/server/.env) so photo links work from the phone.
- Each Shopify **vendor** becomes an approved shop or restaurant owned by a placeholder account. **Admin → Vendors → the shop → Hand over shop**: once the real owner has signed up with their own number, type it in and the shop with all its products is theirs.
- **Products** keep their options (colour/size/MOQ, each with its own price and photo), photos (up to 8), description and category. Drafts, items with no price and items with no photo come over hidden; items with no price wait in Approvals.
- **Customers with a Liberian phone** get an account waiting for them. When they sign up with the same number they take it over (and see their past orders). Logging in before that tells them to sign up.
- **Admin → Old Shopify store**: every past order (read only — never counted in balances or payouts) and the full contact list with a **Download contact list (CSV)** button (each download is in the audit log). Buyers see their own past orders under Your orders.

### Product options (colour, size, MOQ)

- Sellers can add up to 3 **options** to a product (e.g. Colour: Red, Blue · Size: M, L), then tick which **combinations** they sell and give each its own price, old price and stock (website: My shop → Manage your products; phone: Profile → My shop → Manage your products). "Same price for all" fills the rest in.
- Shop cards show "from $x" (the cheapest choice). The product page has a picker; price, stock and photo follow the choice. Sold-out choices are crossed out.
- The cart, checkout, orders, seller orders, rider app, admin orders and disputes all show which choice was bought ("Red / M"). Stock goes down — and back on cancel — for that choice only.
- Changing a choice's price or stock shows straight away; adding or renaming choices goes back to Admin → Approvals. Admin sees every combination with its price and stock.
- Prices are in US dollars (`$24.99`), stored as whole cents.

### Rider sign-up

- **Anyone can apply to deliver** — website: "Deliver with YanaBuy" on the home page (or `/ride`, and Account → Become a rider); phone: Profile → Become a rider. They choose motorbike, keke, car, bicycle or on foot, give the plate number (motor vehicles), city and areas they cover, an emergency contact, and upload their ID (front/back), a selfie holding it and — for motorbike, keke and car — their driver's licence. The photos are private, like shop ID photos.
- **Admin → Approvals → Riders** (also on the Riders page): the details and photos, a checklist, then **Approve rider** or **Ask for changes** with a reason they see. Approving turns the account into a rider straight away; the phone app then shows Profile → My deliveries. Approved riders can be **suspended** (they go back to a normal buyer account — only once they have no deliveries in progress) and **reinstated**. Everything is in the audit log.
- One account is either a seller or a rider, not both — people who want both use a second phone number. Admins can still make someone a rider directly in Buyers & accounts.

### Phase 6: reviews, chat, disputes, China sourcing

- **Reviews**: once an order is delivered, the buyer rates each item (1–5 stars and a comment) on the order page — and can change it later. Stars show on product cards, product pages and shop pages (shown as "Grace W.", never the full name). Search can sort by **Top rated**. Sellers answer reviews in **My shop → Reviews**. **Admin → Reviews**: search every review; hide rude or fake ones with a reason (hidden reviews don't count in the stars) or show them again.
- **Chat**: "Ask the shop a question" on product pages, "Message the shop" on shop and order pages. One thread per buyer and shop, with the product or order attached to the message, and photos. The website header and the phone's Profile show unread messages; sellers answer from **My shop → Messages**. New messages appear within a few seconds. **Admin → Chats**: read any chat (each time is written in the audit log) and write into it as "YanaBuy".
- **Disputes**: up to 7 days after delivery, the buyer can **Report a problem** (what went wrong, what happened, photos). The seller sees it at the top of Shop orders and gives their side. **Admin → Disputes**: both sides, the order, then decide — full refund, part refund or no refund. Send the refund to the buyer by mobile money first, then record the transaction ID; choose how much comes out of the seller's balance (it shows in their Earnings as "Refund to buyer"). Buyer and seller both see the decision.
- **China sourcing** (website: "Buy from China" on the home page and account page; phone: home card and Profile → Buy from China): the buyer sends a link and/or photos, description, quantity and budget. **Admin → China sourcing**: quote one landed price and the delivery time (or turn it down with a reason). The buyer accepts, gives the delivery address and pays with MTN MoMo (when connected) or cash on delivery. Admin then marks Ordered → Shipped (with a tracking note) → Arrived in Liberia → Delivered; the buyer follows every step.
- **"Ships from China" products**: sellers can tick "Ships from China" and give a delivery time in days on a product. Cards show a 🇨🇳 badge, product pages show the delivery time, and search has a **From China** filter.
- The admin overview shows open disputes and China requests waiting, with badges in the menu.

### Phase 5: earnings, payouts, commission, MTN MoMo

- **Commission**: when an order is delivered, the seller's share (item price minus YanaBuy's commission) goes into their balance. Set the commission for shops and for restaurants, and the smallest payout, in **Admin → Money overview**. Delivery fees stay with YanaBuy.
- **Sellers → Earnings** (website: My shop → Earnings; phone: Profile → My shop → Earnings): what they can take out, what they sold and earned this month, every sale and payout. They save their MTN MoMo or Orange Money number and request a payout — the money leaves their balance straight away so it can't be asked for twice.
- **Admin → Payouts**: waiting requests with the number and name to send to. Send the money from YanaBuy's mobile money account, then "I've sent it — record payment" with the transaction ID (the seller sees it). Or refuse with a reason — the money goes back to their balance.
- **Admin → Money overview**: sales and commission this month, what YanaBuy owes sellers, **cash riders are holding** from cash-on-delivery orders ("Cash received" when they hand it in), every seller's balance with its history, and "Correct the balance" for mistakes (logged in the audit log).
- **Riders** see "Cash to hand in" at the top of My deliveries.
- **MTN Mobile Money checkout**: the shopper picks MTN MoMo, gets a prompt on their phone, approves with their PIN, and the order goes to the shop only once it's paid. If they decline or don't approve within 10 minutes, the order is cancelled, stock goes back, and their cart is still there to try again.
- **Turning MTN MoMo on** needs YanaBuy's MTN MoMo **Collections** API keys — put them in `apps/server/.env` (see `.env.example`), restart the API, then tick MTN Mobile Money in Admin → Delivery fees. Without keys it stays "coming soon" and can't be switched on.
- **Orange Money and card** stay "coming soon" until those merchant accounts are connected.

To try MoMo payments without real keys, run the pretend MTN server: `cd apps/server && npx tsx src/scripts/mock-mtn.ts`, and put these in `apps/server/.env`, then restart the API:

```
MTN_MOMO_BASE_URL=http://localhost:4555
MTN_MOMO_SUBSCRIPTION_KEY=test
MTN_MOMO_API_USER=test
MTN_MOMO_API_KEY=test
```

Paying from a number ending in **1** approves, **2** declines, anything else waits (and times out after 10 minutes). Remove these lines again afterwards.

### Phase 4: cart, checkout, orders, riders

- **Shoppers**: Add to cart / Buy now, a cart that re-checks prices and stock with the server, checkout with delivery address (remembered for next time) and **cash on delivery**. Orders from two shops become two orders. Order pages show progress (placed → shop accepted → packed → on the way → delivered), the rider's name and phone, and a cancel button until the shop accepts.
- **Sellers** (website: My shop → Shop orders; phone: Profile → My shop → Shop orders): new orders appear by themselves; Accept → "Packed — ready for the rider", or "Can't do it" with a reason.
- **Admin → Assign riders**: accepted orders with no rider, oldest first, with each rider's workload; pick a rider and assign. **Admin → Orders**: every order with items, pickup and drop-off addresses, timeline, change rider, cancel with a reason. **Admin → Riders** and **Delivery fees** (fee per order, free delivery above an amount). The overview shows orders today, orders needing a rider, deliveries and sales today.
- **Riders** use the phone app: make someone a rider in Admin → Buyers & accounts (Role → Rider). They see Profile → My deliveries: pickup and drop-off with call buttons, "I've picked it up", then tick "I collected the cash" and "Delivered" — that marks the order paid.
- Stock goes down when an order is placed and comes back if it's cancelled. MTN MoMo arrived in phase 5.

### Phase 3: products, review, storefront, search

- **Sellers add products** (website: My shop → Manage your products; phone: Profile → My shop → Manage your products): up to 8 photos (pick the main one), name, category, price, old price for deals, stock, description. Restaurants call it their menu.
- New products, and changes to a product's name, photos, category or description, go to **Admin → Approvals → Products** first. Price and stock changes and pausing show straight away.
- **Admin → Products**: every product with photos; approve, ask for changes (the seller sees the reason), remove or put back on sale, and ★ feature the best on the home page.
- **Shoppers**: products on the home page (featured first), product pages with photos, deal and stock, shop pages, and search by words, category and price order — on the website and in the app. Suspended shops and blocked sellers disappear from the shop at once.
- Ordering isn't open yet: product pages show a "Call the shop" button until checkout arrives in phase 4.

### Phase 2: shops, categories, banners, branding

- **Open a shop or restaurant** (website `/sell`, phone: Profile → Start selling): shop details and logo, then ID check — type of ID, front and back photos (passport: one page) and a selfie holding the ID. On the phone the selfie opens the front camera.
- ID photos are **private**: stored in `apps/server/private-uploads`, never in the public uploads folder, and shown only through links that expire after an hour.
- **Admin → Approvals**: oldest first, shows the ID and selfie, a checklist to tick before approving, or "Ask for changes" with a reason the seller sees. Approving makes the owner a seller.
- **Admin → Vendors**: every shop and restaurant, search, suspend with a reason, reinstate.
- **Admin → Categories**: add (with an icon), rename, hide, delete and reorder — separately for Goods & Services and Food. Starter categories are added the first time the server runs.
- **Admin → Banners & ads**: top banners and promo cards with a picture, text, button and link; paid ads are labelled "Ad · advertiser"; choose website/app, Goods/Food, start and end dates; switch on/off, reorder, tap counts.
- **Admin → Branding**: app name, tagline, logo, browser icon and the four brand colours, with a live preview and readability warnings. The website and admin change straight away; the phone app picks it up the next time it opens. (The icon on phone home screens only changes with a new app release.)

### Phase 1: accounts

- Sign up and log in with a Liberian phone number in any format (0770…, +231…, 770…).
- Profile with photo upload (web and phone: camera or gallery), name, email, city, password change.
- Admin console: overview, every account with search and filters, change roles, block and unblock with a reason (blocked people are signed out at once and see the reason), audit log of every admin action.
- Security: passwords hashed with bcrypt, short-lived login tokens with rotating refresh tokens, failed-login rate limiting, admin-only routes checked on the server, photo uploads limited to real image types.

All six planned phases are built. What's left before launch: a real MTN MoMo account (and Orange Money / card when those merchant accounts exist), testing on real phones, and putting the server, website and admin online (and the app in the stores).

## Checks

```bash
npm run typecheck                                  # all apps
cd apps/server && npx tsx src/scripts/smoke-phase1.ts   # 38 account checks (server must be running)
cd apps/server && npx tsx src/scripts/smoke-phase2.ts   # 68 shop / catalogue / branding checks
cd apps/server && npx tsx src/scripts/smoke-phase3.ts   # 45 product / review / search checks
cd apps/server && npx tsx src/scripts/smoke-phase4.ts   # 51 cart / checkout / order / rider checks (API running WITHOUT MTN keys)
cd apps/server && npx tsx src/scripts/smoke-phase5.ts   # 45 money / payout / MoMo checks (API using the pretend MTN above)
cd apps/server && npx tsx src/scripts/smoke-phase6.ts   # 75 review / chat / dispute / China checks (72 without MTN)
cd apps/server && npx tsx src/scripts/smoke-riders.ts   # 27 rider sign-up checks
cd apps/server && npx tsx src/scripts/smoke-options.ts  # 26 product option checks
cd apps/server && npx tsx src/scripts/smoke-shopify.ts  # 34 Shopify import checks
cd apps/server && npx tsx src/scripts/smoke-extras.ts    # 39 forgot-password / admin message / work profile checks (same 2nd API as below)
cd apps/server && npx tsx src/scripts/smoke-notify.ts    # 34 email/SMS checks (needs a 2nd API: OUTBOX_FILE=/tmp/yb-outbox.jsonl PORT=4100 npx tsx src/index.ts)
cd apps/server && npx tsx src/scripts/smoke-countries.ts # 32 country (Liberia/USA) checks
cd apps/server && npx tsx src/scripts/smoke-features.ts # 65 directory / areas / discount / wishlist / notification / booking checks
```
