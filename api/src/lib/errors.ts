import type { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, 'invalid_request', message, fields);
export const unauthorized = (message = 'Entre na sua conta para continuar.') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Recurso não encontrado.') => new HttpError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

// converte erros do zod em mensagens por campo
export function fromZod(err: ZodError, message = 'Revise os campos destacados.') {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return badRequest(message, fields);
}
