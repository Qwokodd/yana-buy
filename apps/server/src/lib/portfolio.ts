import type { PortfolioItem } from "@yanabuy/shared";
import type { portfolioItems } from "../db/schema";

type Row = typeof portfolioItems.$inferSelect;

export const portfolioOut = (p: Row): PortfolioItem => ({
  id: p.id,
  title: p.title,
  description: p.description,
  images: p.images,
  videoUrl: p.videoUrl,
  sortOrder: p.sortOrder,
  createdAt: p.createdAt.toISOString(),
});
