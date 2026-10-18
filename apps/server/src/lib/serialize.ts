import type { Request } from "express";
import type { AdminBanner, Banner, Category, Shop, ShopDocuments } from "@yanabuy/shared";
import type { BannerRow, CategoryRow, ShopRow } from "../db/schema";
import { signedUrl } from "./private-files";
import type { UserRow } from "../db/schema";
import { needsEmail } from "./email-codes";
import type { AdminUser, User } from "@yanabuy/shared";

/** What a user may see about themselves. Never includes the password hash. */
export function publicUser(u: UserRow): User {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    emailVerified: !!u.emailVerifiedAt,
    needsEmail: needsEmail(u),
    role: u.role,
    status: u.status,
    avatarUrl: u.avatarUrl,
    city: u.city,
    createdAt: u.createdAt.toISOString(),
  };
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
    country: s.country,
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
