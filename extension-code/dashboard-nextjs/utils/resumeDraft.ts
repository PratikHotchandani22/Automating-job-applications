export function cloneResume<T>(resume: T): T {
  return JSON.parse(JSON.stringify(resume)) as T;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function normalizeMonthYear(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = trimmed.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (numeric) {
    const month = numeric[1].padStart(2, "0");
    return `${month}/${numeric[2]}`;
  }

  const monthName = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthName) {
    const key = monthName[1].toLowerCase();
    const month = MONTHS[key];
    if (!month) return null;
    return `${month}/${monthName[2]}`;
  }

  return null;
}

export function normalizeDateRange(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const rangeMatch = trimmed.match(/^(.+?)\s*(?:-|–|—|to)\s*(.+)$/i);
  if (rangeMatch) {
    const leftRaw = rangeMatch[1].trim();
    const rightRaw = rangeMatch[2].trim();
    const left = normalizeMonthYear(leftRaw);
    const right = normalizeMonthYear(rightRaw);
    const rightIsPresent = /^(present|current|now)$/i.test(rightRaw);
    if (left && (right || rightIsPresent)) {
      return `${left} - ${rightIsPresent ? "Present" : right}`;
    }
  }

  const single = normalizeMonthYear(trimmed);
  return single ?? value;
}

export function ensureBulletPeriod(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (trimmed.endsWith(".")) return trimmed;
  return `${trimmed}.`;
}

export function normalizeBulletList(items: string[]): string[] {
  return items.map((item) => ensureBulletPeriod(item));
}

export function countWords(value: string): number {
  return value.trim().length === 0 ? 0 : value.trim().split(/\s+/).length;
}

export function estimateWordCount(payload: Record<string, unknown>): number {
  return countWords(JSON.stringify(payload));
}
