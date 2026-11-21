import { config } from '../config.js';
import { ApiError } from '../errors.js';

const BASE_URL = 'https://api.themoviedb.org/3';

export async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!config.tmdbToken) {
    throw new ApiError(503, 'A API Key TMDB ainda não foi configurada no backend.', 'TMDB_NOT_CONFIGURED');
  }
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${config.tmdbToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 401 || response.status === 403) throw new ApiError(502, 'O token TMDB configurado no backend foi recusado.', 'TMDB_AUTH_FAILED');
  if (response.status === 404) throw new ApiError(404, 'Conteúdo não encontrado no catálogo TMDB.', 'MEDIA_NOT_FOUND');
  if (!response.ok) throw new ApiError(502, 'O serviço de metadados está temporariamente indisponível.', 'TMDB_UPSTREAM_ERROR');
  return await response.json() as T;
}
