
export function canonicalizeCnic(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function canonicalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function requireCnic(raw: string | null | undefined, fieldName = "CNIC"): { ok: true; value: string } | { ok: false; error: string } {
  if (!raw?.trim()) return { ok: false, error: `${fieldName} is required` };
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return { ok: false, error: `${fieldName} must be exactly 13 digits — format: XXXXX-XXXXXXX-X` };
  return { ok: true, value: `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` };
}

export function requirePhone(raw: string | null | undefined, fieldName = "Phone"): { ok: true; value: string } | { ok: false; error: string } {
  if (!raw?.trim()) return { ok: false, error: `${fieldName} is required` };
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return { ok: false, error: `${fieldName} must be exactly 11 digits — format: 0XXX-XXXXXXX` };
  return { ok: true, value: `${digits.slice(0, 4)}-${digits.slice(4)}` };
}

export function normalizeCnicIfPresent(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return raw.trim();
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function normalizePhoneIfPresent(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return raw.trim();
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}
