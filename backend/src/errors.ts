import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
  }
}

export const asyncRoute = (handler: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void handler(req, res).catch(next); };

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Os dados enviados são inválidos.', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) } });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  // Do not return internal stack traces or upstream URLs to clients.
  console.error('[api-error]', error instanceof Error ? error.message : 'unknown error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'O servidor encontrou um erro inesperado.' } });
};
