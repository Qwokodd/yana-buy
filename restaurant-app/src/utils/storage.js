const PREFIX = "yanabuy_";

export function loadState(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveState(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — fail silently in this demo
  }
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Approximate USD → LRD mid-market rate. Update this periodically —
// see e.g. tradingeconomics.com/liberia/currency for current figures.
const LRD_PER_USD = 183;

// Prices in this app are stored in USD (the currency most Liberian
// storefronts actually price in). Use formatUSD/formatLRD for a single
// currency, or formatPrice for the combined "$X (L$Y)" display used
// throughout the UI.
export function formatUSD(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatLRD(amount) {
  const lrd = Number(amount) * LRD_PER_USD;
  return `L$${lrd.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatPrice(amount) {
  return `${formatUSD(amount)} (${formatLRD(amount)})`;
}
