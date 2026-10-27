export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Não autenticado') => new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Permissão insuficiente') => new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Não encontrado') => new HttpError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string) => new HttpError(409, 'CONFLICT', msg);
export const tooMany = (msg = 'Muitas requisições') => new HttpError(429, 'RATE_LIMITED', msg);
