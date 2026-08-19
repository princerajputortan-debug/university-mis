const DATE_ONLY_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const SLASH_OR_DASH_DATE = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/;

function buildLocalDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/** Parse DD-MM-YYYY (Indian payment CSV format). */
export function parseDateInputDmy(value: unknown) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const datePart = raw.split(/[ T]/)[0];
  const dmy = datePart.match(SLASH_OR_DASH_DATE);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    return buildLocalDate(year, month, day);
  }

  return parseDateInput(value);
}

export function parseDateInput(value: unknown) {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return buildLocalDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    return isNaN(date.getTime())
      ? null
      : buildLocalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const datePart = raw.split(/[ T]/)[0];
  const isoMatch = datePart.match(DATE_ONLY_ISO);
  if (isoMatch) {
    return buildLocalDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dateMatch = datePart.match(SLASH_OR_DASH_DATE);
  if (dateMatch) {
    const first = Number(dateMatch[1]);
    const second = Number(dateMatch[2]);
    const year = Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]);

    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;

    return buildLocalDate(year, month, day);
  }

  const directDate = new Date(raw);
  if (isNaN(directDate.getTime())) return null;

  return buildLocalDate(
    directDate.getFullYear(),
    directDate.getMonth() + 1,
    directDate.getDate()
  );
}

export function formatDateForDisplay(value: Date | string | null | undefined) {
  const date = parseDateInput(value);
  if (!date) return '';

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();

  return `${dd}-${mm}-${yyyy}`;
}
