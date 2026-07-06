/**
 * Locale singleton — loaded once at app startup from /api/tenants/locale.
 * formatDate / formatCurrency are plain functions that any code (hooks,
 * column definitions, HTML-string generators) can import without needing React.
 */

export type Locale = {
  currency: string;
  dateFormat: string;
  timezone: string;
};

let _locale: Locale = {
  currency: "PKR",
  dateFormat: "DD/MM/YYYY",
  timezone: "Asia/Karachi",
};

export function setLocale(l: Partial<Locale>): void {
  _locale = { ..._locale, ...l };
}

export function getLocale(): Locale {
  return _locale;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  PKR: "Rs",
  USD: "$",
  GBP: "£",
  AED: "AED",
  SAR: "SAR",
};

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Format a date value using the institution's configured date format.
 * Falls back to "—" for null/undefined/invalid values.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  let d: Date;
  if (typeof value === "string") {
    d = value.length === 10 ? new Date(value + "T00:00:00") : new Date(value);
  } else {
    d = value;
  }
  if (isNaN(d.getTime())) return "—";

  const dd  = String(d.getDate()).padStart(2, "0");
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const mmm = MONTH_SHORT[d.getMonth()];
  const yyyy = String(d.getFullYear());

  switch (_locale.dateFormat) {
    case "MM/DD/YYYY":  return `${mm}/${dd}/${yyyy}`;
    case "YYYY-MM-DD":  return `${yyyy}-${mm}-${dd}`;
    case "DD-MMM-YYYY": return `${dd}-${mmm}-${yyyy}`;
    default:            return `${dd}/${mm}/${yyyy}`;
  }
}

/**
 * Format a currency amount using the institution's configured currency.
 * Falls back to "—" for null/undefined/NaN values.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount as number)) return "—";
  const sym = CURRENCY_SYMBOLS[_locale.currency] ?? _locale.currency;
  return `${sym} ${(amount as number).toLocaleString()}`;
}

/**
 * Format a date+time value using the configured date format + 24-h time.
 * Falls back to "—" for null/undefined/invalid values.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${min}`;
}

/**
 * Return today's date as an ISO-8601 string (YYYY-MM-DD).
 * Use as `max` on financial date inputs to block future dates.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Format a compact currency amount (e.g. "Rs 1.2M", "Rs 500K").
 * Used in dashboard KPI cards where space is limited.
 */
export function formatCurrencyCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount as number)) return "—";
  const n = amount as number;
  const sym = CURRENCY_SYMBOLS[_locale.currency] ?? _locale.currency;
  if (n >= 1_000_000) return `${sym} ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${sym} ${(n / 1_000).toFixed(0)}K`;
  return `${sym} ${n.toLocaleString()}`;
}
