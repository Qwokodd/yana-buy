/**
 * Notification links are stored as website paths (/orders/<id>, /p/<id>…).
 * The phone app's screens have different names — this turns one into the other.
 */
export function phonePath(link: string | null | undefined): string | null {
  if (!link) return null;
  const [path, query = ""] = link.split("?");
  const q = new URLSearchParams(query);
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/orders\/([\w-]+)$/))) return `/order/${m[1]}`;
  if (path === "/orders") return "/orders";
  if ((m = path.match(/^\/p\/([\w-]+)$/))) return `/product/${m[1]}`;
  if ((m = path.match(/^\/shop\/([\w-]+)$/))) return `/shop/${m[1]}`;
  if (path === "/messages") return q.get("c") ? `/chat/${q.get("c")}` : "/messages";
  if (path === "/sell/orders") return "/seller-orders";
  if (path === "/sell/products") return "/seller-products";
  if (path === "/sell/earnings") return "/seller-earnings";
  if (path === "/sell/bookings") return "/seller-bookings";
  if (path === "/sell") return "/sell";
  if (path === "/rider") return "/rider";
  if (path === "/bookings") return "/bookings";
  if ((m = path.match(/^\/bookings\/([\w-]+)$/))) return `/booking/${m[1]}`;
  if (path === "/wishlist") return "/wishlist";
  if (path === "/sell/profile") return "/seller-profile";
  if (path === "/shops") return "/shops";
  if (path === "/china") return "/china";
  if (path === "/notifications") return "/notifications";
  if (path === "/" || path === "") return "/";
  return null;
}

export type VideoPlatform = "youtube" | "tiktok" | "instagram" | "facebook" | "other";

/**
 * Works out what a video link is. YouTube links can be played on the page
 * (embedUrl) and have a thumbnail; the others open in their app.
 */
export function videoInfo(url: string): { platform: VideoPlatform; embedUrl: string | null; thumbnail: string | null; label: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { platform: "other", embedUrl: null, thumbnail: null, label: "Video" };
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
  else if (host.endsWith("youtube.com")) id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1] ?? null;
  if (id && /^[\w-]{6,20}$/.test(id))
    return { platform: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, label: "YouTube" };
  if (host.endsWith("tiktok.com")) return { platform: "tiktok", embedUrl: null, thumbnail: null, label: "TikTok" };
  if (host.endsWith("instagram.com")) return { platform: "instagram", embedUrl: null, thumbnail: null, label: "Instagram" };
  if (host.endsWith("facebook.com") || host === "fb.watch") return { platform: "facebook", embedUrl: null, thumbnail: null, label: "Facebook" };
  return { platform: "other", embedUrl: null, thumbnail: null, label: "Video" };
}

/** Only links to the big video sites are accepted on work profiles. */
export const isVideoLink = (url: string) => /^https:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|vimeo\.com)\//i.test(url);
