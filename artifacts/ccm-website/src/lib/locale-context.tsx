import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { setLocale, getLocale, formatDate, formatCurrency, formatDateLong, type Locale } from "@/lib/locale";

const API = (import.meta.env.VITE_API_BASE as string) || "";

export type LocaleContextValue = Locale & {
  formatDate: typeof formatDate;
  formatCurrency: typeof formatCurrency;
  formatDateLong: typeof formatDateLong;
};

const defaultValue: LocaleContextValue = {
  ...getLocale(),
  formatDate,
  formatCurrency,
  formatDateLong,
};

export const LocaleContext = createContext<LocaleContextValue>(defaultValue);

let _fetched = false;

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  useEffect(() => {
    if (_fetched) return;
    _fetched = true;
    fetch(`${API}/api/tenants/locale`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.currency && data.dateFormat) {
          setLocale({ currency: data.currency, dateFormat: data.dateFormat, timezone: data.timezone });
          setLocaleState(getLocale());
        }
      })
      .catch(() => {});
  }, []);

  const value: LocaleContextValue = {
    ...locale,
    formatDate,
    formatCurrency,
    formatDateLong,
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocaleContext(): LocaleContextValue {
  return useContext(LocaleContext);
}
