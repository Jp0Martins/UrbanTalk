import { Pipe, PipeTransform } from '@angular/core';

const TZ = 'America/Sao_Paulo';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const shortFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso)).replace(',', ' às');
// dia local YYYY-MM-DD, sem conversão de fuso
export const formatDay = (day: string) => {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
};
export const formatDayShort = (day: string) => shortFmt.format(new Date(`${day}T00:00:00Z`)).replace('.', '');

export function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  return `em ${formatDate(iso)}`;
}

// data local de hoje em YYYY-MM-DD (fuso de Sorocaba)
export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// tom do avatar estável por nome (1 a 5)
export function avatarTone(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String((h % 5) + 1);
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

@Pipe({ name: 'data' })
export class DatePipe implements PipeTransform {
  transform(iso: string | null | undefined, withTime = false) {
    if (!iso) return '';
    return withTime ? formatDateTime(iso) : formatDate(iso);
  }
}

@Pipe({ name: 'relativo' })
export class RelativePipe implements PipeTransform {
  transform(iso: string | null | undefined) {
    return iso ? relativeTime(iso) : '';
  }
}
