import type { Request } from "express";
import type { AdminBanner, Banner, Category, Shop, ShopDocuments } from "@yanabuy/shared";
import type { BannerRow, CategoryRow, ShopRow } from "../db/schema";
import { signedUrl } from "./private-files";
import { shops, type UserRow } from "../db/schema";
import { db } from "../db/client";
import { eq } from "drizzle-orm";
import { needsVerification } from "./email-codes";
import { emailReady, smsReady } from "./outbound";
import type { AdminUser, User } from "@yanabuy/shared";

/** What a user may see about themselves. Never includes the password hash. */
export function publicUser(u: UserRow): User {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
    needsVerification: needsVerification(u),
    needsEmail: needsVerification(u),
    canVerifyBy: [...(smsReady() ? (["sms"] as const) : []), ...(emailReady() ? (["email"] as const) : [])],
    role: u.role,
    status: u.status,
    avatarUrl: u.avatarUrl,
    city: u.city,
    createdAt: u.createdAt.toISOString(),
    location: lastLocation(u),
    riderOnline: u.riderOnline,
  };
}

/** publicUser() plus the seller's own approved shop — for log-in and /api/me, so the apps open on "My shop". */
export async function userWithShop(u: UserRow): Promise<User> {
  const base = publicUser(u);
  if (u.role !== "vendor") return { ...base, myShop: null };
  const [s] = await db.select({ id: shops.id, kind: shops.kind, name: shops.name, slug: shops.slug, status: shops.status }).from(shops).where(eq(shops.ownerId, u.id)).limit(1);
  return { ...base, myShop: s && s.status === "approved" ? { id: s.id, kind: s.kind, name: s.name, slug: s.slug } : null };
}

/** A user's last GPS spot, if they've shared one. */
export function lastLocation(u: Pick<UserRow, "lat" | "lng" | "locatedAt">) {
  return u.lat != null && u.lng != null && u.locatedAt ? { lat: u.lat, lng: u.lng, at: u.locatedAt.toISOString() } : null;
}

export function adminUser(u: UserRow): AdminUser {
  return {
    ...publicUser(u),
    blockedReason: u.blockedReason,
    blockedAt: u.blockedAt?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  };
}

export function shopOut(s: ShopRow): Shop {
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    slug: s.slug,
    description: s.description,
    logoUrl: s.logoUrl,
    coverUrl: s.coverUrl,
    phone: s.phone,
    city: s.city,
    address: s.address,
    status: s.status,
    statusReason: s.statusReason,
    submittedAt: s.submittedAt.toISOString(),
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    importedFrom: s.importedFrom,
    categoryId: s.categoryId,
    hours: s.hours,
    location: s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null,
    country: s.country,
    eatIn: s.kind === "restaurant" && s.eatIn,
    pickup: s.kind === "restaurant" && s.pickup,
  };
}

/** Fresh signed links to the ID photos — only call this for the owner or an admin. */
export function shopDocuments(req: Request, s: ShopRow): ShopDocuments {
  return {
    idType: s.idType,
    idFrontUrl: signedUrl(req, s.idFrontKey),
    idBackUrl: s.idBackKey ? signedUrl(req, s.idBackKey) : null,
    selfieUrl: signedUrl(req, s.selfieKey),
  };
}

export function categoryOut(c: CategoryRow): Category {
  return { id: c.id, kind: c.kind, name: c.name, slug: c.slug, iconUrl: c.iconUrl, sortOrder: c.sortOrder, visible: c.visible };
}

export function bannerOut(b: BannerRow): Banner {
  return {
    id: b.id,
    kind: b.kind,
    title: b.title,
    subtitle: b.subtitle,
    imageUrl: b.imageUrl,
    videoUrl: b.videoUrl,
    linkUrl: b.linkUrl,
    buttonLabel: b.buttonLabel,
    advertiser: b.advertiser,
    placement: b.placement,
    platform: b.platform,
    mode: b.mode,
    country: b.country ?? null,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
    active: b.active,
    sortOrder: b.sortOrder,
  };
}

export function adminBannerOut(b: BannerRow, now = new Date()): AdminBanner {
  const state: AdminBanner["state"] = !b.active
    ? "off"
    : b.endsAt && b.endsAt <= now
      ? "ended"
      : b.startsAt && b.startsAt > now
        ? "scheduled"
        : "live";
  return { ...bannerOut(b), clicks: b.clicks, state, createdAt: b.createdAt.toISOString() };
}
