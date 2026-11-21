import { Router } from 'express';
import { z } from 'zod';
import { ApiError, asyncRoute } from '../errors.js';
import { tmdbGet } from '../services/tmdb.js';

const router = Router();
const languageSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('pt-BR');
const mediaTypeSchema = z.enum(['movie', 'tv', 'all']).default('all');
const pageSchema = z.coerce.number().int().min(1).max(500).default(1);

router.get('/trending', asyncRoute(async (req, res) => {
  const mediaType = mediaTypeSchema.parse(String(req.query.type ?? 'all'));
  const language = languageSchema.parse(String(req.query.language ?? 'pt-BR'));
  const page = pageSchema.parse(req.query.page);
  const data = await tmdbGet<{ results?: Array<Record<string, unknown>> }>(`/trending/${mediaType}/week`, { language, page: String(page) });
  res.json({ ...data, results: (data.results ?? []).filter((item) => item.adult !== true) });
}));

router.get('/discover', asyncRoute(async (req, res) => {
  const type = z.enum(['movie', 'tv']).parse(String(req.query.type ?? 'movie'));
  const sortBy = z.string().regex(/^[a-z_.]+\.(asc|desc)$/).default('popularity.desc').parse(req.query.sort_by);
  const language = languageSchema.parse(String(req.query.language ?? 'pt-BR'));
  const page = pageSchema.parse(req.query.page);
  const genre = req.query.with_genres ? z.string().regex(/^\d+(,\d+)*$/).parse(req.query.with_genres) : undefined;
  const data = await tmdbGet(`/discover/${type}`, { language, sort_by: sortBy, page: String(page), include_adult: 'false', ...(genre ? { with_genres: genre } : {}) });
  res.json(data);
}));

router.get('/search', asyncRoute(async (req, res) => {
  const query = z.string().trim().min(1).max(120).parse(req.query.q);
  const language = languageSchema.parse(String(req.query.language ?? 'pt-BR'));
  const page = pageSchema.parse(req.query.page);
  const data = await tmdbGet('/search/multi', { query, language, include_adult: 'false', page: String(page) });
  res.json(data);
}));

router.get('/details/:type/:id', asyncRoute(async (req, res) => {
  const type = z.enum(['movie', 'tv']).parse(req.params.type);
  const id = z.coerce.number().int().positive().max(9_999_999).parse(req.params.id);
  const language = languageSchema.parse(String(req.query.language ?? 'pt-BR'));
  const data = await tmdbGet(`/${type}/${id}`, { language, append_to_response: 'external_ids,credits,videos,recommendations,similar,release_dates,content_ratings' });
  res.json(data);
}));

router.get('/season/:id/:season', asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().max(9_999_999).parse(req.params.id);
  const season = z.coerce.number().int().min(0).max(100).parse(req.params.season);
  const language = languageSchema.parse(String(req.query.language ?? 'pt-BR'));
  const data = await tmdbGet(`/tv/${id}/season/${season}`, { language, append_to_response: 'aggregate_credits,videos' });
  res.json(data);
}));

router.get('/genres/:type', asyncRoute(async (req, res) => {
  const type = z.enum(['movie', 'tv']).parse(req.params.type);
  const language = languageSchema.parse(String(req.query.language ?? 'pt-BR'));
  res.json(await tmdbGet(`/genre/${type}/list`, { language }));
}));

router.get('/external/:type/:id', asyncRoute(async (req, res) => {
  const type = z.enum(['movie', 'tv']).parse(req.params.type);
  const id = z.coerce.number().int().positive().max(9_999_999).parse(req.params.id);
  res.json(await tmdbGet(`/${type}/${id}/external_ids`));
}));

router.use((_req, _res, next) => next(new ApiError(404, 'Rota de catálogo não encontrada.', 'ROUTE_NOT_FOUND')));
export default router;
