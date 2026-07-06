
export function formatCnic(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 4) return d;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

export function normalizeCnic(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function canonicalizeCnic(raw: string): string | null {
  const digits = normalizeCnic(raw);
  if (digits.length !== 13) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function canonicalizePhone(raw: string): string | null {
  const digits = normalizePhone(raw);
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}
