import { HttpErrorResponse } from '@angular/common/http';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  fields: Record<string, string>;
}

// transforma qualquer falha HTTP em mensagem legível para a interface
export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return {
        status: 0,
        code: 'offline',
        message: 'Não foi possível falar com o servidor. Confira sua conexão ou se a API está rodando e tente de novo.',
        fields: {},
      };
    }
    const body = err.error?.error;
    if (body?.message) {
      return { status: err.status, code: body.code ?? 'error', message: body.message, fields: body.fields ?? {} };
    }
    if (err.status === 413) {
      return { status: 413, code: 'too_large', message: 'O arquivo enviado é grande demais.', fields: {} };
    }
    return { status: err.status, code: 'error', message: 'O servidor respondeu com um erro inesperado. Tente novamente.', fields: {} };
  }
  return { status: -1, code: 'unknown', message: 'Algo deu errado. Tente novamente.', fields: {} };
}
