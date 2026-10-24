/**
 * Brings the old Shopify store into YanaBuy v3: shops, categories, products
 * (with options and photos), customers, the contact list and the order archive.
 *
 *   npm run import-shopify -- --dry-run          practice run: reads everything, changes nothing, writes a report
 *   npm run import-shopify                       the real import
 *
 * Options:
 *   --dir <folder>        where the Shopify CSV files are (default: the "shopify-import" folder next to this project's apps folder)
 *   --shop-phone <phone>  the number shown on imported shops until each owner takes over (default: the first admin's)
 *   --public-url <url>    how photo links start (default: PUBLIC_URL from .env, or http://localhost:4000)
 *   --skip-images         don't download photos (products without photos stay hidden)
 *   --only <parts>        e.g. --only products,customers (parts: shops, products, customers, orders, discounts)
 *
 * Safe to run again: it finds what it already brought over and updates it instead of making copies.
 * It never touches orders, balances or payouts made in v3.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { normalizeLiberianPhone, type ProductOption, type ProductVariant, type ShopifyOrderItem } from "@yanabuy/shared";
import { db, pool } from "../db/client";
import { runMigrations } from "../db/migrate";
import { seedOnce } from "../db/seed";
import { categories, discountCodes, products, shopifyContacts, shopifyOrders, shops, users } from "../db/schema";
import { normalizeCode } from "../lib/discounts";
import { env } from "../env";
import { slugify } from "../lib/slug";
import { MAX_OPTIONS, MAX_VALUES, MAX_VARIANTS, normalizeVariants, summarize } from "../lib/variants";

// ─── Arguments ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../../../..");
const DIR = path.resolve(arg("dir") ?? path.join(REPO, "shopify-import"));
const DRY = flag("dry-run");
const SKIP_IMAGES = flag("skip-images");
const PUBLIC = (arg("public-url") ?? env.PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, "");
const ONLY = new Set((arg("only") ?? "shops,products,customers,orders,discounts").split(",").map((s) => s.trim()));
const UPLOADS = path.resolve(process.cwd(), env.UPLOAD_DIR, "shopify");

// ─── Report ─────────────────────────────────────────────────────────────────

const counts = new Map<string, number>();
const warnings = new Map<string, string[]>();
const bump = (k: string, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n);
function warn(kind: string, detail: string) {
  const list = warnings.get(kind) ?? [];
  list.push(detail);
  warnings.set(kind, list);
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/** RFC 4180: quoted fields, "" inside quotes, line breaks inside quotes. */
function parseCsv(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  if (!head) return [];
  return body
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function findFiles(dir: string, test: RegExp, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findFiles(p, test, out);
    else if (test.test(e.name)) out.push(p);
  }
  return out.sort();
}

function readAll(test: RegExp, label: string) {
  const files = findFiles(DIR, test);
  if (!files.length) {
    warn("Missing files", `No ${label} file found in ${DIR} (looked for ${test})`);
    return [];
  }
  const rows = files.flatMap((f) => parseCsv(fs.readFileSync(f, "utf8")));
  console.log(`📄 ${label}: ${rows.length} rows from ${files.map((f) => path.relative(DIR, f)).join(", ")}`);
  return rows;
}

// ─── Small helpers ──────────────────────────────────────────────────────────

const cents = (v: string | undefined) => {
  const n = parseFloat((v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const phoneOf = (...values: (string | undefined)[]) => {
  for (const v of values) {
    const p = v ? normalizeLiberianPhone(v.replace(/^'+/, "")) : null;
    if (p) return p;
  }
  return null;
};
const clean = (v: string | undefined) => (v ? v.replace(/^'+/, "").trim() || null : null);
const emailOf = (v: string | undefined) => {
  const e = clean(v)?.toLowerCase() ?? null;
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};
const date = (v: string | undefined) => {
  const d = v ? new Date(v.replace(/ ([+-]\d{4})$/, "$1").replace(" ", "T")) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
/** Shopify HTML descriptions → plain text with line breaks. */
function htmlToText(html: string) {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
function cut(text: string, max: number) {
  if (text.length <= max) return text;
  const short = text.slice(0, max - 1);
  return `${short.slice(0, Math.max(short.lastIndexOf(" "), max - 15))}…`;
}
const vendorKey = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

// ─── Categories ─────────────────────────────────────────────────────────────

/** v3 categories the import may add, on top of the starter ones. */
const EXTRA_GOODS = ["Jewelry & Accessories", "Bags & Luggage", "Furniture", "Health & Medical", "Baby & Kids", "Sports & Outdoors", "Tools & Hardware", "Other"];

function goodsCategory(shopifyCategory: string, type: string, title: string): string {
  const [top = "", second = ""] = shopifyCategory.split(" > ");
  const t = `${type} ${title}`.toLowerCase();
  if (top === "Apparel & Accessories") {
    if (second === "Shoes" || /shoe|sandal|slipper|sneaker|heel/.test(t)) return "Shoes";
    if (second === "Jewelry") return "Jewelry & Accessories";
    if (second.startsWith("Handbag")) return "Bags & Luggage";
    return "Fashion";
  }
  if (top === "Health & Beauty") return second === "Health Care" ? "Health & Medical" : "Beauty";
  if (top === "Home & Garden") return "Home & Kitchen";
  if (top === "Furniture") return "Furniture";
  if (top === "Electronics" || top === "Cameras & Optics") return "Phones & Tech";
  if (top === "Luggage & Bags") return "Bags & Luggage";
  if (top === "Food, Beverages & Tobacco") return "Groceries";
  if (top === "Baby & Toddler" || top === "Toys & Games") return "Baby & Kids";
  if (top === "Sporting Goods") return "Sports & Outdoors";
  if (top === "Hardware") return "Tools & Hardware";
  if (top === "Business & Industrial") return second === "Medical" ? "Health & Medical" : second === "Hairdressing & Cosmetology" ? "Beauty" : "Other";
  // No Shopify category: guess from the type and name.
  if (/shoe|sandal|slipper|sneaker/.test(t)) return "Shoes";
  if (/dress|shirt|cloth|wear|apparel|abaya|bikini|pajama|lingerie|trouser|suit|ankara|outfit|hat/.test(t)) return "Fashion";
  if (/perfume|deodorant|skin|hair|beauty|cream|lotion|soap/.test(t)) return "Beauty";
  if (/bag|wallet/.test(t)) return "Bags & Luggage";
  if (/jewel|bead|necklace|earring|bracelet|gold/.test(t)) return "Jewelry & Accessories";
  if (/phone|modem|starlink|charger|speaker|tv|laptop/.test(t)) return "Phones & Tech";
  if (/cup|kitchen|plate|decor|sticker/.test(t)) return "Home & Kitchen";
  if (/provision|rice|oil|yogurt|milk/.test(t)) return "Groceries";
  return "Other";
}

function foodCategory(shopifyCategory: string, type: string, title: string): string {
  const [, second = "", third = ""] = shopifyCategory.split(" > ");
  if (second === "Beverages") return "Drinks";
  if (third === "Bakery" || third.startsWith("Frozen Desserts")) return "Pastries & desserts";
  const t = `${type} ${title}`.toLowerCase();
  if (/drink|juice|soda|water|coffee|tea\b|smoothie|milkshake|wine|beer|malt/.test(t)) return "Drinks";
  if (/cake|pastry|pastries|bread|bakery|pie\b|donut|doughnut|cookie|muffin|dessert|ice cream|cupcake|croissant|roll\b/.test(t)) return "Pastries & desserts";
  if (/burger|pizza|shawarma|fries|wings|sandwich|hot ?dog|chinese|noodle|fried rice|spring roll|nugget|wrap|taco|sushi/.test(t)) return "Fast food";
  return "Local dishes";
}

const FOOD_TYPES = /^(food|cake|pastry|chinese food|fish pie&meat pie)$/i;

// ─── Photos ─────────────────────────────────────────────────────────────────

const photoUrl = (src: string) => {
  const ext = (path.extname(new URL(src).pathname).toLowerCase().match(/^\.(jpe?g|png|webp|gif)$/)?.[0] ?? ".jpg").replace(".jpeg", ".jpg");
  const name = `${crypto.createHash("sha1").update(src.split("?")[0]).digest("hex").slice(0, 24)}${ext}`;
  return { file: path.join(UPLOADS, name), url: `${PUBLIC}/uploads/shopify/${name}` };
};

/** Phone numbers that get (or already have) an account in this run — so a practice run can count linked orders too. */
const accountPhones = new Map<string, string>();

const downloaded = new Map<string, string | null>();

async function fetchPhoto(src: string): Promise<string | null> {
  if (downloaded.has(src)) return downloaded.get(src)!;
  const { file, url } = photoUrl(src);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    bump("photos already downloaded");
    downloaded.set(src, url);
    return url;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(45_000) });
      if (res.status === 404 || res.status === 410) {
        attempt = 3; // gone from Shopify — no point trying again
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? "";
      if (!type.startsWith("image/") || type.includes("svg")) throw new Error(`not a photo (${type})`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(`${file}.part`, buf);
      fs.renameSync(`${file}.part`, file);
      bump("photos downloaded");
      bump("photo bytes", buf.length);
      downloaded.set(src, url);
      return url;
    } catch (err) {
      if (attempt === 3) {
        warn("Photos that couldn't be downloaded", `${src} — ${err instanceof Error ? err.message : err}`);
        downloaded.set(src, null);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return null;
}

/** Downloads a list of photos a few at a time, keeping their order. */
async function fetchPhotos(srcs: string[]) {
  const out: (string | null)[] = new Array(srcs.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, srcs.length) }, async () => {
      while (next < srcs.length) {
        const i = next++;
        out[i] = await fetchPhoto(srcs[i]);
      }
    })
  );
  return out;
}

// ─── Read and shape the products ────────────────────────────────────────────

interface ShapedProduct {
  handle: string;
  vendor: string;
  name: string;
  description: string | null;
  type: string;
  shopifyCategory: string;
  status: "active" | "draft" | "archived";
  images: string[];
  options: ProductOption[];
  variants: (Omit<ProductVariant, "id"> & { imageSrc: string | null })[];
  price: number;
  compareAtPrice: number | null;
  /** From "Variant Grams" (Shopify always exports grams there). */
  weightGrams: number | null;
}

/** Shopify's "Variant Grams" → whole grams, or null when empty / zero. */
const gramsOf = (r: Record<string, string | undefined>) => {
  const g = Math.round(Number(r["Variant Grams"] ?? ""));
  return Number.isFinite(g) && g > 0 && g <= 1_000_000 ? g : null;
};

function shapeProducts(rows: Record<string, string>[]): ShapedProduct[] {
  const byHandle = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    if (!r.Handle) continue;
    const list = byHandle.get(r.Handle) ?? [];
    list.push(r);
    byHandle.set(r.Handle, list);
  }
  const out: ShapedProduct[] = [];
  for (const [handle, rs] of byHandle) {
    const first = rs.find((r) => r.Title) ?? rs[0];
    if (!first.Title) {
      warn("Products skipped", `${handle}: no title`);
      continue;
    }
    const status = (first.Status || (first.Published === "true" ? "active" : "draft")).toLowerCase() as ShapedProduct["status"];
    if (status === "archived") {
      bump("products skipped (archived on Shopify)");
      continue;
    }
    const vendor = (first.Vendor || "YanaBuy").trim().replace(/\s+/g, " ");

    let name = first.Title.replace(/\s+/g, " ").trim();
    if (name.length > 80) {
      warn("Names shortened to 80 letters", name);
      name = cut(name, 80);
    }
    const bodyText = htmlToText(first["Body (HTML)"] || "") || htmlToText(first["Description (product.metafields.custom.description)"] || "");
    let description = bodyText || null;
    if (description && description.length > 2000) {
      bump("descriptions shortened to 2,000 letters");
      description = cut(description, 2000);
    }

    // Photos in Shopify's order.
    const images = [...new Map(rs.filter((r) => r["Image Src"]).sort((a, b) => Number(a["Image Position"] || 99) - Number(b["Image Position"] || 99)).map((r) => [r["Image Src"], true])).keys()];
    if (images.length > 8) {
      bump("products with more than 8 photos (first 8 kept)");
      images.length = 8;
    }

    // Options and variants.
    const names = [first["Option1 Name"], first["Option2 Name"], first["Option3 Name"]].map((n) => (n ?? "").trim());
    const variantRows = rs.filter((r) => r["Variant Price"] !== undefined && r["Variant Price"] !== "");
    const simple = variantRows.length <= 1 && (!names[0] || names[0] === "Title") && (!variantRows[0]?.["Option1 Value"] || variantRows[0]["Option1 Value"] === "Default Title");

    const shaped: ShapedProduct = { handle, vendor, name, description, type: first.Type || "", shopifyCategory: first["Product Category"] || "", status, images, options: [], variants: [], price: 0, compareAtPrice: null, weightGrams: null };

    if (simple) {
      const v = variantRows[0] ?? first;
      shaped.price = cents(v["Variant Price"]);
      const cmp = cents(v["Variant Compare At Price"]);
      shaped.compareAtPrice = cmp > shaped.price ? cmp : null;
      shaped.weightGrams = gramsOf(v);
    } else {
      const used = names.map((n, i) => ({ name: n === "Title" ? "Choice" : n || `Option ${i + 1}`, index: i })).filter((o) => variantRows.some((r) => r[`Option${o.index + 1} Value`]));
      if (used.length > MAX_OPTIONS) used.length = MAX_OPTIONS;
      const values = used.map(() => [] as string[]);
      const seen = new Set<string>();
      for (const r of variantRows) {
        const combo = used.map((o) => (r[`Option${o.index + 1} Value`] || "").trim().slice(0, 60));
        if (combo.some((c) => !c)) continue;
        const key = combo.map((c) => c.toLowerCase()).join("\u0000");
        if (seen.has(key)) continue;
        const price = cents(r["Variant Price"]);
        if (price <= 0) {
          bump("options skipped (no price on Shopify)");
          continue;
        }
        combo.forEach((c, i) => {
          if (!values[i].some((x) => x.toLowerCase() === c.toLowerCase())) values[i].push(c);
        });
        seen.add(key);
        const cmp = cents(r["Variant Compare At Price"]);
        shaped.variants.push({ values: combo, price, compareAtPrice: cmp > price ? cmp : null, stock: null, image: null, imageSrc: r["Variant Image"] || null, weightGrams: gramsOf(r) });
      }
      if (values.some((v) => v.length > MAX_VALUES) || shaped.variants.length > MAX_VARIANTS) {
        warn("Products with too many options (cut to fit)", `${name}: ${shaped.variants.length} combinations`);
        values.forEach((v, i) => (values[i] = v.slice(0, MAX_VALUES)));
        shaped.variants = shaped.variants.filter((v) => v.values.every((x, i) => values[i].includes(x))).slice(0, MAX_VARIANTS);
      }
      shaped.options = used.map((o, i) => ({ name: o.name.slice(0, 40), values: values[i] }));
      if (!shaped.variants.length) {
        shaped.options = [];
        shaped.price = 0;
      } else {
        const s = summarize(shaped.variants.map((v) => ({ ...v, id: "x" })));
        shaped.price = s.price;
        shaped.compareAtPrice = s.compareAtPrice;
        bump("products with options");
        bump("option combinations", shaped.variants.length);
      }
    }
    if (shaped.price <= 0) warn("Products with no price (imported hidden, waiting in Approvals)", `${name} (${vendor})`);
    out.push(shaped);
  }
  return out;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${DRY ? "🧪 PRACTICE RUN — nothing will be changed" : "🚚 IMPORTING"} from ${DIR}\n`);
  if (!fs.existsSync(DIR)) throw new Error(`Folder not found: ${DIR}. Put the Shopify CSV files there, or give --dir <folder>.`);

  const productRows = ONLY.has("products") || ONLY.has("shops") ? readAll(/^products_export.*\.csv$/i, "Products") : [];
  const customerRows = ONLY.has("customers") ? readAll(/^customers_export.*\.csv$/i, "Customers") : [];
  const orderRows = ONLY.has("orders") ? readAll(/^orders_export.*\.csv$/i, "Orders") : [];
  const discountRows = ONLY.has("discounts") ? readAll(/^discounts_export.*\.csv$/i, "Discounts") : [];

  await runMigrations();
  await seedOnce();

  const shaped = shapeProducts(productRows);

  // ── Shops ────────────────────────────────────────────────────────────────
  const vendors = new Map<string, { name: string; food: number; total: number }>();
  for (const p of shaped) {
    const k = vendorKey(p.vendor);
    const v = vendors.get(k) ?? { name: p.vendor, food: 0, total: 0 };
    v.total++;
    if (FOOD_TYPES.test(p.type.trim()) || p.shopifyCategory.startsWith("Food, Beverages")) v.food++;
    vendors.set(k, v);
  }
  // A vendor is a restaurant when most of its items are food — except provision/grocery shops.
  const kindOf = (v: { name: string; food: number; total: number }) => (v.food / v.total > 0.6 && !/provision|mart|warehouse|mall/i.test(v.name) ? "restaurant" : "store") as "store" | "restaurant";

  const [firstAdmin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const shopPhone = arg("shop-phone") ? normalizeLiberianPhone(arg("shop-phone")!) : (firstAdmin?.phone ?? null);
  if (arg("shop-phone") && !shopPhone) throw new Error("--shop-phone isn't a valid Liberian number");
  if (!shopPhone) throw new Error("Create the admin first (npm run create-admin), or give --shop-phone");
  if (!arg("shop-phone")) warn("Check", `Imported shops show ${shopPhone} as their phone until each owner takes over. Use --shop-phone to choose YanaBuy's customer-care number.`);

  const existingShops = await db.select().from(shops).where(eq(shops.importedFrom, "shopify"));
  const shopByKey = new Map(existingShops.map((s) => [s.importedKey!, s]));
  const usedSlugs = new Set((await db.select({ slug: shops.slug }).from(shops)).map((s) => s.slug));

  for (const [key, v] of vendors) {
    const kind = kindOf(v);
    bump(kind === "restaurant" ? "restaurants" : "shops");
    if (shopByKey.has(key)) {
      bump("shops already imported");
      continue;
    }
    if (DRY) {
      bump("shops to create");
      continue;
    }
    // Placeholder owner until the real owner signs up and an admin hands the shop over.
    const n = String(existingShops.length + shopByKey.size + 1).padStart(6, "0");
    let phone = `+231000${n}`;
    for (let i = 0; (await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1)).length; i++) phone = `+231000${String(Number(n) + 500 + i).padStart(6, "0")}`;
    const [owner] = await db
      .insert(users)
      .values({ fullName: `${v.name} (from Shopify)`.slice(0, 80), phone, passwordHash: "!unclaimed", role: "vendor", unclaimed: true, importedFrom: "shopify", city: "Monrovia" })
      .returning();
    let slug = slugify(v.name);
    for (let i = 2; usedSlugs.has(slug); i++) slug = `${slugify(v.name).slice(0, 55)}-${i}`;
    usedSlugs.add(slug);
    const [shop] = await db
      .insert(shops)
      .values({
        ownerId: owner.id,
        kind,
        name: v.name.slice(0, 60),
        slug,
        phone: shopPhone,
        city: "Monrovia",
        address: "Monrovia",
        status: "approved",
        idType: "national_id",
        idFrontKey: "imported-from-shopify",
        selfieKey: "imported-from-shopify",
        reviewedAt: new Date(),
        reviewedById: firstAdmin?.id ?? null,
        importedFrom: "shopify",
        importedKey: key,
      })
      .returning();
    shopByKey.set(key, shop);
    bump("shops created");
  }

  // ── Categories ───────────────────────────────────────────────────────────
  const cats = await db.select().from(categories);
  const catId = new Map(cats.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]));
  async function category(kind: "goods" | "food", name: string) {
    const k = `${kind}:${name.toLowerCase()}`;
    if (catId.has(k)) return catId.get(k)!;
    if (DRY) {
      warn("New categories that will be added", `${name} (${kind === "food" ? "Food" : "Goods & Services"})`);
      catId.set(k, `dry-${k}`);
      return catId.get(k)!;
    }
    const [c] = await db
      .insert(categories)
      .values({ kind, name, slug: slugify(name), sortOrder: 50 + catId.size })
      .onConflictDoNothing()
      .returning();
    const id = c?.id ?? (await db.select().from(categories).where(and(eq(categories.kind, kind), eq(categories.slug, slugify(name)))).limit(1))[0].id;
    catId.set(k, id);
    bump("categories added");
    return id;
  }

  // ── Products ─────────────────────────────────────────────────────────────
  if (ONLY.has("products")) {
    const existing = new Map(
      (shaped.length ? await db.select().from(products).where(inArray(products.importedKey, shaped.map((p) => p.handle))) : []).map((p) => [p.importedKey!, p])
    );
    if (!SKIP_IMAGES && !DRY) fs.mkdirSync(UPLOADS, { recursive: true });
    let done = 0;
    for (const p of shaped) {
      done++;
      if (done % 100 === 0) console.log(`   … ${done} / ${shaped.length} products`);
      const v = vendors.get(vendorKey(p.vendor))!;
      const kind = kindOf(v) === "restaurant" ? "food" : "goods";
      const catName = kind === "food" ? foodCategory(p.shopifyCategory, p.type, p.name) : goodsCategory(p.shopifyCategory, p.type, p.name);
      bump(`category: ${catName}`);
      const categoryId = await category(kind, catName);
      bump(kind === "food" ? "food items" : "goods");
      bump(`photos referenced`, p.images.length);

      const before = existing.get(p.handle);
      if (DRY) {
        bump(before ? "products to update" : "products to create");
        if (p.status === "draft") bump("drafts (will be imported hidden)");
        continue;
      }

      // Photos: download into the app.
      let images: string[] = [];
      const variantImage = new Map<string, string>();
      if (!SKIP_IMAGES) {
        const extra = [...new Set(p.variants.map((x) => x.imageSrc).filter((s): s is string => !!s && !p.images.includes(s)))];
        const got = await fetchPhotos([...p.images, ...extra]);
        images = got.slice(0, p.images.length).filter((u): u is string => !!u);
        [...p.images, ...extra].forEach((src, i) => got[i] && variantImage.set(src, got[i]!));
      } else if (before) {
        images = before.images;
      }

      let options: ProductOption[] = [];
      let variants: ProductVariant[] = [];
      try {
        ({ options, variants } = normalizeVariants(
          p.options,
          p.variants.map((x) => ({ values: x.values, price: x.price, compareAtPrice: x.compareAtPrice, stock: null, image: x.imageSrc ? (variantImage.get(x.imageSrc) ?? null) : null, weightGrams: x.weightGrams })),
          before?.variants ?? []
        ));
      } catch (err) {
        warn("Products whose options couldn't be read (imported without options)", `${p.name}: ${err instanceof Error ? err.message : err}`);
      }
      const noPrice = p.price <= 0;
      const noPhoto = images.length === 0;
      if (noPhoto) warn("Products with no photo (imported hidden)", `${p.name} (${p.vendor})`);
      const values = {
        shopId: shopByKey.get(vendorKey(p.vendor))!.id,
        categoryId,
        kind: kind as "goods" | "food",
        name: p.name,
        description: p.description,
        price: Math.max(0, p.price),
        compareAtPrice: p.compareAtPrice,
        // Product weight: the simple product's, or the lightest choice's (choices keep their own).
        weightGrams: p.weightGrams ?? (p.variants.map((x) => x.weightGrams).filter((g): g is number => !!g).sort((a, b) => a - b)[0] ?? null),
        stock: variants.length ? summarize(variants).stock : null,
        images,
        options,
        variants,
        // Drafts, products without a price and products without a photo don't go on sale.
        status: noPrice ? ("pending" as const) : ("approved" as const),
        statusReason: null,
        hidden: p.status === "draft" || noPhoto || noPrice,
        reviewedAt: noPrice ? null : new Date(),
        reviewedById: noPrice ? null : (firstAdmin?.id ?? null),
        importedKey: p.handle,
        updatedAt: new Date(),
      };
      if (before) {
        // Keeps featuring and any approval/removal an admin did since. (Paused/hidden is worked out again.)
        const { status, hidden, reviewedAt, reviewedById, ...rest } = values;
        await db
          .update(products)
          .set({ ...rest, ...(before.status === "pending" && !noPrice ? { status, reviewedAt, reviewedById } : {}), hidden })
          .where(eq(products.id, before.id));
        bump("products updated");
      } else {
        await db.insert(products).values(values);
        bump("products created");
      }
      if (values.hidden) bump("products imported hidden");
    }
  }

  // Imported shops without a directory category get the one most of their products are in.
  if (!DRY && ONLY.has("products")) {
    await db.execute(sql`
      update shops s set category_id = (
        select p.category_id from products p where p.shop_id = s.id and p.category_id is not null
        group by p.category_id order by count(*) desc limit 1
      ) where s.imported_from = 'shopify' and s.category_id is null`);
  }

  // ── Customers and contact list ───────────────────────────────────────────
  if (ONLY.has("customers")) {
    const allUsers = await db.select({ id: users.id, phone: users.phone, email: users.email }).from(users);
    const userByPhone = new Map(allUsers.map((u) => [u.phone, u.id]));
    const before = new Set(userByPhone.keys());
    const takenEmails = new Set(allUsers.map((u) => u.email).filter(Boolean));
    const existingContacts = new Set((await db.select({ id: shopifyContacts.shopifyId }).from(shopifyContacts)).map((c) => c.id));

    for (const c of customerRows) {
      const id = c["Customer ID"]?.replace(/^'+/, "");
      if (!id) continue;
      const phone = phoneOf(c.Phone, c["Default Address Phone"]);
      const email = emailOf(c.Email);
      const first = clean(c["First Name"]);
      const last = clean(c["Last Name"]);
      const rawPhone = clean(c.Phone) ?? clean(c["Default Address Phone"]);
      if (rawPhone && !phone) bump("customers with a phone that isn't Liberian (contact only)");

      let userId: string | null = phone ? (userByPhone.get(phone) ?? null) : null;
      if (phone && !userId) {
        bump(DRY ? "customer accounts to create" : "customer accounts created");
        if (!DRY) {
          const useEmail = email && !takenEmails.has(email) ? email : null;
          if (useEmail) takenEmails.add(useEmail);
          const [u] = await db
            .insert(users)
            .values({
              fullName: [first, last].filter(Boolean).join(" ").slice(0, 80) || "YanaBuy customer",
              phone,
              email: useEmail,
              passwordHash: "!unclaimed",
              role: "buyer",
              unclaimed: true,
              importedFrom: "shopify",
              city: clean(c["Default Address City"])?.slice(0, 60) ?? null,
            })
            .returning({ id: users.id });
          userId = u.id;
        }
        userByPhone.set(phone, userId ?? "dry");
      } else if (phone) bump(before.has(phone) ? "customers who already have a v3 account (linked)" : "customers sharing a phone number with another customer (same account)");
      else bump("customers without a phone (contact list only)");
      if (phone) accountPhones.set(phone, userId ?? "dry");

      const contact = {
        shopifyId: id,
        firstName: first,
        lastName: last,
        email,
        phone: phone ?? clean(c.Phone) ?? clean(c["Default Address Phone"]),
        city: clean(c["Default Address City"]),
        address: [clean(c["Default Address Address1"]), clean(c["Default Address Address2"])].filter(Boolean).join(", ") || null,
        totalSpent: cents(c["Total Spent"]),
        totalOrders: Number(c["Total Orders"]) || 0,
        acceptsEmail: c["Accepts Email Marketing"] === "yes",
        acceptsSms: c["Accepts SMS Marketing"] === "yes",
        tags: clean(c.Tags),
        note: clean(c.Note),
        userId: userId && userId !== "dry" ? userId : null,
      };
      bump(existingContacts.has(id) ? "contacts updated" : "contacts added");
      if (!DRY) {
        await db.insert(shopifyContacts).values(contact).onConflictDoUpdate({ target: shopifyContacts.shopifyId, set: contact });
      }
    }
  }

  // ── Order archive ────────────────────────────────────────────────────────
  if (ONLY.has("orders")) {
    const byName = new Map<string, Record<string, string>[]>();
    for (const r of orderRows) {
      if (!r.Name) continue;
      const list = byName.get(r.Name) ?? [];
      list.push(r);
      byName.set(r.Name, list);
    }
    const userByPhone = new Map((await db.select({ id: users.id, phone: users.phone }).from(users)).map((u) => [u.phone, u.id]));
    for (const [p, id] of accountPhones) if (!userByPhone.has(p)) userByPhone.set(p, id);
    const already = new Set((await db.select({ name: shopifyOrders.name }).from(shopifyOrders)).map((o) => o.name));
    for (const [name, rs] of byName) {
      const o = rs.find((r) => r.Total) ?? rs[0];
      const placedAt = date(o["Created at"]);
      if (!placedAt) {
        warn("Orders skipped", `${name}: no date`);
        continue;
      }
      if (already.has(name)) {
        bump("orders already in the archive");
        continue;
      }
      const items: ShopifyOrderItem[] = rs
        .filter((r) => r["Lineitem name"])
        .map((r) => ({ name: r["Lineitem name"], quantity: Number(r["Lineitem quantity"]) || 1, price: cents(r["Lineitem price"]), vendor: clean(r.Vendor), sku: clean(r["Lineitem sku"]) }));
      const phone = phoneOf(o.Phone, o["Billing Phone"], o["Shipping Phone"]);
      const userId = phone ? (userByPhone.get(phone) ?? null) : null;
      bump(userId ? "orders linked to an account" : "orders not linked (no matching phone)");
      bump("orders archived");
      if (DRY) continue;
      await db
        .insert(shopifyOrders)
        .values({
          name,
          shopifyId: clean(o.Id),
          buyerName: clean(o["Shipping Name"]) ?? clean(o["Billing Name"]),
          email: emailOf(o.Email),
          phone: phone ?? clean(o.Phone) ?? clean(o["Shipping Phone"]) ?? clean(o["Billing Phone"]),
          userId,
          vendors: [...new Set(items.map((i) => i.vendor).filter(Boolean))].join(", ") || null,
          financialStatus: clean(o["Financial Status"]),
          fulfillmentStatus: clean(o["Fulfillment Status"]),
          paymentMethod: clean(o["Payment Method"]),
          shippingMethod: clean(o["Shipping Method"]),
          currency: clean(o.Currency) ?? "USD",
          subtotal: cents(o.Subtotal),
          shipping: cents(o.Shipping),
          discount: cents(o["Discount Amount"]),
          discountCode: clean(o["Discount Code"]),
          total: cents(o.Total),
          refunded: cents(o["Refunded Amount"]),
          address: [clean(o["Shipping Address1"]), clean(o["Shipping Address2"])].filter(Boolean).join(", ") || null,
          city: clean(o["Shipping City"]),
          notes: clean(o.Notes),
          items,
          placedAt,
          cancelledAt: date(o["Cancelled at"]),
        })
        .onConflictDoNothing();
    }
    // Accounts made earlier (or just now) pick up any orders with their number.
    if (!DRY) {
      for (const [phone, id] of userByPhone) {
        if (id === "dry" || !phone) continue;
        await db.update(shopifyOrders).set({ userId: id }).where(and(eq(shopifyOrders.phone, phone), isNull(shopifyOrders.userId)));
      }
    }
  }

  // ── Discount codes ───────────────────────────────────────────────────────
  for (const d of discountRows) {
    const code = normalizeCode(d.Name ?? "");
    if (!/^[A-Z0-9$_-]{3,30}$/.test(code)) {
      warn("Discount codes skipped", `${d.Name}: not a usable code`);
      continue;
    }
    const raw = Math.abs(parseFloat(d.Value || "0"));
    const percent = (d["Value Type"] || "").startsWith("percent");
    const value = percent ? Math.round(raw) : Math.round(raw * 100);
    if (!value) continue;
    const min = parseFloat(d["Minimum Purchase Requirements"] || "");
    const values = {
      code,
      description: `From Shopify (${d["Discount Class"] || "order"} discount)`,
      type: percent ? ("percent" as const) : ("fixed" as const),
      value: percent ? Math.min(100, value) : value,
      minSubtotal: Number.isFinite(min) && min > 0 ? Math.round(min * 100) : null,
      mode: "all",
      startsAt: date(d.Start),
      endsAt: date(d.End),
      usageLimit: Number(d["Usage Limit Per Code"]) || null,
      perBuyerLimit: d["Applies Once Per Customer"] === "1" || d["Applies Once Per Customer"]?.toLowerCase() === "true" ? 1 : null,
      active: (d.Status || "").toLowerCase() === "active",
    };
    const [exists] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
    bump(exists ? "discount codes already there" : values.active ? "discount codes added (live)" : "discount codes added (switched off — expired on Shopify)");
    if (DRY || exists) continue;
    await db.insert(discountCodes).values(values);
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(`YanaBuy — Shopify import ${DRY ? "PRACTICE RUN (nothing was changed)" : "report"}`);
  lines.push(`When: ${new Date().toLocaleString("en-GB")}`);
  lines.push(`Files: ${DIR}`);
  lines.push(`Photos: ${SKIP_IMAGES ? "skipped" : DRY ? "not downloaded in a practice run" : `saved in ${UPLOADS}, links start ${PUBLIC}`}`);
  lines.push("");
  lines.push("Numbers");
  for (const [k, v] of [...counts].sort(([a], [b]) => (a.startsWith("category") === b.startsWith("category") ? a.localeCompare(b) : a.startsWith("category") ? 1 : -1))) {
    lines.push(`  ${k}: ${k === "photo bytes" ? `${(v / 1024 / 1024).toFixed(1)} MB` : v.toLocaleString("en-US")}`);
  }
  for (const [k, list] of warnings) {
    lines.push("");
    lines.push(`${k} (${list.length})`);
    for (const item of list.slice(0, 200)) lines.push(`  - ${item}`);
    if (list.length > 200) lines.push(`  … and ${list.length - 200} more`);
  }
  const report = lines.join("\n");
  const file = path.join(DIR, DRY ? "import-report-practice.txt" : "import-report.txt");
  fs.writeFileSync(file, report);
  console.log(`\n${report}\n\n📝 Report saved to ${file}`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("\n❌ Import stopped:", err instanceof Error ? err.message : err);
    await pool.end();
    process.exit(1);
  });
