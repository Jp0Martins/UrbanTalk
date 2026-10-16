// Sorocaba usa o fuso America/Sao_Paulo, UTC-3 fixo desde 2019 (sem horário de verão)
const OFFSET_MS = -3 * 60 * 60 * 1000;

export const nowIso = () => new Date().toISOString();

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(day: string) {
  if (!DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

// início do dia local em UTC ISO
export function startOfLocalDay(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - OFFSET_MS).toISOString();
}

// fim do dia local em UTC ISO (exclusivo: início do dia seguinte)
export function endOfLocalDayExclusive(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - OFFSET_MS + 86_400_000).toISOString();
}

// data local (YYYY-MM-DD) de um instante ISO
export function localDay(iso: string) {
  return new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 10);
}

export function todayLocal() {
  return localDay(nowIso());
}

export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function formatDayBr(day: string) {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBr(iso: string) {
  const local = new Date(Date.parse(iso) + OFFSET_MS).toISOString();
  return `${formatDayBr(local.slice(0, 10))} às ${local.slice(11, 16)}`;
}
