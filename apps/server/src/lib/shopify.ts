import { and, eq, isNull } from "drizzle-orm";
import type { ShopifyContact, ShopifyOrder } from "@yanabuy/shared";
import { db } from "../db/client";
import { shopifyContacts, shopifyOrders } from "../db/schema";

type OrderRow = typeof shopifyOrders.$inferSelect;
type ContactRow = typeof shopifyContacts.$inferSelect;

/** Past Shopify orders placed with this phone number now show in the person's account. */
export async function linkShopifyOrders(userId: string, phone: string) {
  await db
    .update(shopifyOrders)
    .set({ userId })
    .where(and(eq(shopifyOrders.phone, phone), isNull(shopifyOrders.userId)));
}

export function shopifyOrderOut(o: OrderRow): ShopifyOrder {
  return {
    id: o.id,
    name: o.name,
    buyerName: o.buyerName,
    email: o.email,
    phone: o.phone,
    userId: o.userId,
    vendors: o.vendors,
    financialStatus: o.financialStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    paymentMethod: o.paymentMethod,
    shippingMethod: o.shippingMethod,
    currency: o.currency,
    subtotal: o.subtotal,
    shipping: o.shipping,
    discount: o.discount,
    discountCode: o.discountCode,
    total: o.total,
    refunded: o.refunded,
    address: o.address,
    city: o.city,
    notes: o.notes,
    items: o.items,
    placedAt: o.placedAt.toISOString(),
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
  };
}

export function shopifyContactOut(c: ContactRow): ShopifyContact {
  return {
    id: c.id,
    shopifyId: c.shopifyId,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    city: c.city,
    address: c.address,
    totalSpent: c.totalSpent,
    totalOrders: c.totalOrders,
    acceptsEmail: c.acceptsEmail,
    acceptsSms: c.acceptsSms,
    tags: c.tags,
    hasAccount: !!c.userId,
  };
}
