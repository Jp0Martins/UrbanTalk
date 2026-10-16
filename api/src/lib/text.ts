import { z } from 'zod';

// texto limpo: sem caracteres de controle e no máximo uma linha em branco seguida
export function cleanText(s: string) {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const linkCount = (s: string) => (s.match(/https?:\/\//gi) ?? []).length;

// campo de texto livre com limites e no máximo 2 links
export const bodyField = (min: number, max: number, what: string, maxLinks = 2) =>
  z
    .string({ error: `Escreva ${what}.` })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, `Escreva pelo menos ${min} caracteres.`)
        .max(max, `Use até ${max} caracteres.`)
        .refine((v) => linkCount(v) <= maxLinks, `Use no máximo ${maxLinks} links por mensagem.`),
    );

// texto normalizado para comparar mensagens repetidas (spam)
export const normalizeForCompare = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const likeTerm = (s: string) => `%${s.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const excerpt = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export const parseIdParam = (raw: string | string[] | undefined) => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// nome de lugar como a pessoa digitou, só sem espaços sobrando
export const placeName = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();

// chave para comparar nomes de bairro: sem acento, minúsculas e só letras/números.
// não expande abreviações ("Jd." continua diferente de "Jardim") para não juntar bairros por engano
export const placeKey = (s: string) =>
  placeName(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
