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
const MONTH_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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
  const mmmm = MONTH_LONG[d.getMonth()];
  const yyyy = String(d.getFullYear());

  switch (_locale.dateFormat) {
    case "MM/DD/YYYY":  return `${mm}/${dd}/${yyyy}`;
    case "YYYY-MM-DD":  return `${yyyy}-${mm}-${dd}`;
    case "DD-MMM-YYYY": return `${dd}-${mmm}-${yyyy}`;
    default:            return `${dd}/${mm}/${yyyy}`;
  }
}

/**
 * Long-form date for readable prose. Respects the configured locale:
 *   DD/MM/YYYY | DD-MMM-YYYY → "1 January 2024"
 *   MM/DD/YYYY               → "January 1, 2024"
 *   YYYY-MM-DD               → "2024 January 1"
 */
export function formatDateLong(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  let d: Date;
  if (typeof value === "string") {
    d = value.length === 10 ? new Date(value + "T00:00:00") : new Date(value);
  } else {
    d = value;
  }
  if (isNaN(d.getTime())) return "—";
  const day   = d.getDate();
  const month = MONTH_LONG[d.getMonth()];
  const year  = d.getFullYear();
  switch (_locale.dateFormat) {
    case "MM/DD/YYYY":  return `${month} ${day}, ${year}`;
    case "YYYY-MM-DD":  return `${year} ${month} ${day}`;
    default:            return `${day} ${month} ${year}`;
  }
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount as number)) return "—";
  const sym = CURRENCY_SYMBOLS[_locale.currency] ?? _locale.currency;
  return `${sym} ${(amount as number).toLocaleString()}`;
}
