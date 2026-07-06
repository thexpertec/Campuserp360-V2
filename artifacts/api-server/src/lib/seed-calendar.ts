/**
 * seed-calendar.ts — Seeds Pakistan national and religious holidays for all
 * active academic years, plus the default weekend config (Sat + Sun off).
 *
 * Idempotency: if a school_calendar_weekends row already exists for the year
 * (audience = "students"), the entire year is considered seeded and skipped.
 *
 * Islamic holiday dates are astronomical approximations.
 * Actual dates in Pakistan depend on official moon sighting and may shift ±1 day.
 */

import {
  db,
  academicYearsTable,
  schoolCalendarWeekendsTable,
  schoolHolidaysTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "national" | "religious" | "event" | "institutional" | "other";

interface HolidayEntry {
  date: string;          // YYYY-MM-DD
  name: string;
  category: Category;
  notes?: string;
}

// ── Fixed national holidays (same calendar date every year) ───────────────────

function nationalHolidays(y: number): HolidayEntry[] {
  const d = (m: number, day: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return [
    {
      date: d(2, 5), name: "Kashmir Solidarity Day", category: "national",
      notes: "National day of solidarity with the Kashmiri freedom struggle",
    },
    {
      date: d(3, 23), name: "Pakistan Day", category: "national",
      notes: "Commemorates the Lahore Resolution of 23 March 1940",
    },
    {
      date: d(5, 1), name: "Labour Day", category: "national",
      notes: "International Workers' Day",
    },
    {
      date: d(8, 14), name: "Independence Day", category: "national",
      notes: "Pakistan's independence from British rule, 14 August 1947",
    },
    {
      date: d(11, 9), name: "Iqbal Day", category: "national",
      notes: "Birthday of Allama Muhammad Iqbal, national poet and philosopher",
    },
    {
      date: d(12, 25), name: "Quaid-e-Azam Day", category: "national",
      notes: "Birthday of Quaid-e-Azam Muhammad Ali Jinnah, founder of Pakistan",
    },
  ];
}

// ── Islamic religious holidays by Gregorian calendar year ─────────────────────
// Dates are based on astronomical computation (Umm al-Qura / ISNA).
// Official Pakistan dates are determined by moon sighting and may differ by ±1 day.
// Categories: religious

const RELIGIOUS: Record<number, HolidayEntry[]> = {

  2026: [
    // 1 Shawwal 1447 — Eid-ul-Fitr
    { date: "2026-03-20", name: "Eid-ul-Fitr (Day 1)", category: "religious", notes: "1 Shawwal 1447 — subject to moon sighting" },
    { date: "2026-03-21", name: "Eid-ul-Fitr (Day 2)", category: "religious", notes: "Subject to moon sighting" },
    { date: "2026-03-22", name: "Eid-ul-Fitr (Day 3)", category: "religious", notes: "Subject to moon sighting" },
    // 10 Dhul Hijjah 1447 — Eid-ul-Adha
    { date: "2026-05-27", name: "Eid-ul-Adha (Day 1)", category: "religious", notes: "10 Dhul Hijjah 1447 — subject to moon sighting" },
    { date: "2026-05-28", name: "Eid-ul-Adha (Day 2)", category: "religious", notes: "Subject to moon sighting" },
    { date: "2026-05-29", name: "Eid-ul-Adha (Day 3)", category: "religious", notes: "Subject to moon sighting" },
    // 9–10 Muharram 1448 — Ashura
    { date: "2026-07-04", name: "Youm-e-Ashura (9 Muharram)", category: "religious", notes: "9 Muharram 1448 — subject to moon sighting" },
    { date: "2026-07-05", name: "Youm-e-Ashura (10 Muharram)", category: "religious", notes: "10 Muharram 1448 — subject to moon sighting" },
    // 12 Rabi-ul-Awwal 1448 — Eid Milad-un-Nabi
    { date: "2026-09-02", name: "Eid Milad-un-Nabi", category: "religious", notes: "12 Rabi-ul-Awwal 1448 — Prophet Muhammad's (PBUH) birthday" },
  ],

  2027: [
    // 1 Shawwal 1448 — Eid-ul-Fitr
    { date: "2027-03-09", name: "Eid-ul-Fitr (Day 1)", category: "religious", notes: "1 Shawwal 1448 — subject to moon sighting" },
    { date: "2027-03-10", name: "Eid-ul-Fitr (Day 2)", category: "religious", notes: "Subject to moon sighting" },
    { date: "2027-03-11", name: "Eid-ul-Fitr (Day 3)", category: "religious", notes: "Subject to moon sighting" },
    // 10 Dhul Hijjah 1448 — Eid-ul-Adha
    { date: "2027-05-16", name: "Eid-ul-Adha (Day 1)", category: "religious", notes: "10 Dhul Hijjah 1448 — subject to moon sighting" },
    { date: "2027-05-17", name: "Eid-ul-Adha (Day 2)", category: "religious", notes: "Subject to moon sighting" },
    { date: "2027-05-18", name: "Eid-ul-Adha (Day 3)", category: "religious", notes: "Subject to moon sighting" },
    // 9–10 Muharram 1449 — Ashura
    { date: "2027-06-23", name: "Youm-e-Ashura (9 Muharram)", category: "religious", notes: "9 Muharram 1449 — subject to moon sighting" },
    { date: "2027-06-24", name: "Youm-e-Ashura (10 Muharram)", category: "religious", notes: "10 Muharram 1449 — subject to moon sighting" },
    // 12 Rabi-ul-Awwal 1449 — Eid Milad-un-Nabi
    { date: "2027-08-22", name: "Eid Milad-un-Nabi", category: "religious", notes: "12 Rabi-ul-Awwal 1449 — Prophet Muhammad's (PBUH) birthday" },
  ],

  2028: [
    // 1 Shawwal 1449 — Eid-ul-Fitr
    { date: "2028-02-26", name: "Eid-ul-Fitr (Day 1)", category: "religious", notes: "1 Shawwal 1449 — subject to moon sighting" },
    { date: "2028-02-27", name: "Eid-ul-Fitr (Day 2)", category: "religious", notes: "Subject to moon sighting" },
    { date: "2028-02-28", name: "Eid-ul-Fitr (Day 3)", category: "religious", notes: "Subject to moon sighting" },
    // 10 Dhul Hijjah 1449 — Eid-ul-Adha
    { date: "2028-05-05", name: "Eid-ul-Adha (Day 1)", category: "religious", notes: "10 Dhul Hijjah 1449 — subject to moon sighting" },
    { date: "2028-05-06", name: "Eid-ul-Adha (Day 2)", category: "religious", notes: "Subject to moon sighting" },
    { date: "2028-05-07", name: "Eid-ul-Adha (Day 3)", category: "religious", notes: "Subject to moon sighting" },
    // 9–10 Muharram 1450 — Ashura
    { date: "2028-06-11", name: "Youm-e-Ashura (9 Muharram)", category: "religious", notes: "9 Muharram 1450 — subject to moon sighting" },
    { date: "2028-06-12", name: "Youm-e-Ashura (10 Muharram)", category: "religious", notes: "10 Muharram 1450 — subject to moon sighting" },
    // 12 Rabi-ul-Awwal 1450 — Eid Milad-un-Nabi
    { date: "2028-08-10", name: "Eid Milad-un-Nabi", category: "religious", notes: "12 Rabi-ul-Awwal 1450 — Prophet Muhammad's (PBUH) birthday" },
  ],
};

// ── Combine for a given calendar year ────────────────────────────────────────

function holidaysForCalYear(calYear: number): HolidayEntry[] {
  return [
    ...nationalHolidays(calYear),
    ...(RELIGIOUS[calYear] ?? []),
  ];
}

// ── Seed a single academic year ───────────────────────────────────────────────

export async function seedCalendarHolidaysForYear(
  year: { id: string; name: string },
): Promise<void> {
  // Idempotency gate: if weekends are already configured for this year,
  // the entire year has already been seeded — skip.
  const existing = await db.select({ id: schoolCalendarWeekendsTable.id })
    .from(schoolCalendarWeekendsTable)
    .where(and(
      eq(schoolCalendarWeekendsTable.yearId, year.id),
      eq(schoolCalendarWeekendsTable.audience, "students"),
    ))
    .limit(1);

  if (existing.length > 0) {
    logger.info({ year: year.name }, "seedCalendar: already seeded — skipping");
    return;
  }

  // Parse the two calendar years from the academic year name, e.g. "2026-2027" → [2026, 2027]
  const calYears = year.name
    .split("-")
    .map(Number)
    .filter(n => n > 2000 && n < 2100);

  if (calYears.length < 2) {
    logger.warn({ year: year.name }, "seedCalendar: cannot parse calendar years — skipping");
    return;
  }

  const allHolidays: HolidayEntry[] = [];
  for (const cy of calYears) {
    allHolidays.push(...holidaysForCalYear(cy));
  }

  // Weekend config — Sat + Sun off for both audiences
  for (const audience of ["students", "staff"] as const) {
    await db.insert(schoolCalendarWeekendsTable).values({
      yearId:   year.id,
      audience,
      mon: false, tue: false, wed: false,
      thu: false, fri: false,
      sat: true,  sun: true,
      notes: "Default Pakistan weekend (Sat–Sun)",
    }).onConflictDoNothing();
  }

  // Holidays — audience = "both" so they apply to students and staff alike
  if (allHolidays.length > 0) {
    await db.insert(schoolHolidaysTable).values(
      allHolidays.map(h => ({
        yearId:   year.id,
        audience: "both",
        date:     h.date,
        name:     h.name,
        category: h.category,
        notes:    h.notes ?? null,
      })),
    );
  }

  logger.info(
    { year: year.name, calYears, holidays: allHolidays.length },
    "seedCalendar: seeded holidays + weekend config",
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function seedCalendarHolidays(): Promise<void> {
  try {
    const years = await db.select().from(academicYearsTable)
      .where(eq(academicYearsTable.active, true));

    if (!years.length) return;

    for (const year of years) {
      await seedCalendarHolidaysForYear(year);
    }
  } catch (err) {
    logger.error({ err }, "seedCalendar: failed");
  }
}
