import type { Prisma } from "@prisma/client";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_WEEK = MS_PER_DAY * 7;

export type JsonRecord = Record<string, string>;

export const toRecord = (value: Prisma.JsonValue | null): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value).map(([key, v]) => [
    key,
    v === undefined || v === null ? "" : String(v),
  ]);
  return Object.fromEntries(entries);
};

export const parseIsoDate = (value: string): Date | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, yearStr, monthStr, dayStr] = isoMatch;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return null;
    }
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const [, part1Str, part2Str, yearFragment] = slashMatch;
    const part1 = Number(part1Str);
    const part2 = Number(part2Str);
    let year = Number(yearFragment);
    if (Number.isNaN(part1) || Number.isNaN(part2) || Number.isNaN(year)) {
      return null;
    }
    if (yearFragment.length === 2) {
      year += year >= 70 ? 1900 : 2000;
    }
    const candidates: Array<{ month: number; day: number }> = [
      { month: part2, day: part1 },
      { month: part1, day: part2 },
    ];
    for (const candidate of candidates) {
      const { month, day } = candidate;
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        continue;
      }
      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) {
        continue;
      }
      if (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      ) {
        return date;
      }
    }
    return null;
  }

  return null;
};

export const parseMmDdYyyy = (value: string): number | null => {
  const date = parseIsoDate(value);
  return date ? date.getTime() : null;
};

export const parseCurrency = (value: string): number | null => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[^0-9.\-]/g, "");
  if (!normalized) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isNaN(amount) ? null : amount;
};

export const parseNumberStrict = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[^0-9.\-]/g, "");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

export const computeAgeFromBirthDate = (
  birthMs: number | null,
): number | null => {
  if (birthMs === null) {
    return null;
  }
  const birthDate = new Date(birthMs);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

export const extractPatientAge = (
  record: Record<string, string> | undefined,
): number | null => {
  if (!record) {
    return null;
  }
  const ageKeys = ["Age", "Patient Age", "Age Years"];
  for (const key of ageKeys) {
    const candidate = parseNumberStrict(record[key]);
    if (candidate !== null) {
      return candidate;
    }
  }
  const dobKeys = ["DOB", "Date of Birth", "Birthdate"];
  for (const key of dobKeys) {
    const value = record[key];
    if (!value) {
      continue;
    }
    const ms = parseMmDdYyyy(value);
    const age = computeAgeFromBirthDate(ms);
    if (age !== null) {
      return age;
    }
  }
  return null;
};

export const normalizeKey = (value: string | null | undefined): string => {
  return (value ?? "").trim().toLowerCase();
};

export const composeNameKey = (
  name: string | null | undefined,
  location: string | null | undefined,
) => {
  if (!name) {
    return null;
  }
  let normalizedName = name.trim();
  if (!normalizedName) {
    return null;
  }
  if (normalizedName.includes(",")) {
    const [last, first] = normalizedName.split(",", 2);
    normalizedName = `${(first ?? "").trim()} ${(last ?? "").trim()}`.trim();
  }
  return `${normalizeKey(normalizedName)}|${normalizeKey(location ?? "")}`;
};

export const extractPatientId = (record: Record<string, string> | undefined) => {
  if (!record) {
    return null;
  }
  const candidates = ["Patient ID", "Patient", "Account Number", "ID"];
  for (const key of candidates) {
    if (record[key]) {
      const candidate = record[key].toString().trim();
      if (candidate) {
        return candidate;
      }
    }
  }
  const ref = record["Reference #"]?.toString().trim();
  if (ref) {
    return ref;
  }
  return null;
};

export const extractThirdPartyBenefit = (
  primary: Record<string, string> | undefined,
  fallback?: Record<string, string>,
): number | null => {
  const sources = [primary, fallback].filter(Boolean) as Array<
    Record<string, string>
  >;
  const explicitKeys = [
    "Third Party Benefit",
    "3rd Party Benefit",
    "3rd party benefit",
    "Third party benefit",
    "3rd Party Benefit Balance",
  ];
  for (const source of sources) {
    for (const key of explicitKeys) {
      const value = source[key];
      if (value) {
        const parsed = parseCurrency(value);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }
  return null;
};

export const startOfWeekMonday = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.getTime();
};
