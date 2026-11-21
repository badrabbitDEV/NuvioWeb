import { ApiError } from '../errors.js';
import { safeFetchJson } from '../security/safe-fetch.js';

export const normalizeManifestUrl = (raw: string): string => {
  const url = new URL(raw);
  if (!/manifest\.json$/i.test(url.pathname)) url.pathname = `${url.pathname.replace(/\/$/, '')}/manifest.json`;
  return url.toString();
};

export const inspectAddon = async (rawManifestUrl: string, allowHttp: boolean) => {
  const manifestUrl = normalizeManifestUrl(rawManifestUrl);
  const manifest = await safeFetchJson(manifestUrl, allowHttp) as Record<string, unknown>;
  if (!manifest || typeof manifest !== 'object' || typeof manifest.id !== 'string' || typeof manifest.name !== 'string' || !Array.isArray(manifest.resources)) {
    throw new ApiError(502, 'O endereço não retornou um manifest de addon compatível.', 'INVALID_ADDON_MANIFEST');
  }
  return { manifestUrl, manifest };
};

function supportsResource(manifest: Record<string, unknown>, resource: string, type: string): boolean {
  const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
  return resources.some((entry) => {
    if (entry === resource) return true;
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as { name?: unknown; types?: unknown };
    return candidate.name === resource && (candidate.types === undefined || (Array.isArray(candidate.types) && candidate.types.includes(type)));
  });
}

export function buildResourceUrl(manifestUrl: string, resource: string, type: string, id: string, extra?: Record<string, string>): string {
  const base = new URL(normalizeManifestUrl(manifestUrl));
  const root = base.pathname.replace(/\/manifest\.json$/i, '').replace(/\/$/, '');
  const safeType = encodeURIComponent(type);
  const safeId = encodeURIComponent(id);
  let suffix = '';
  if (resource === 'catalog' && extra && Object.keys(extra).length) {
    const extraPath = Object.entries(extra).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    suffix = `/${extraPath}`;
  }
  base.pathname = `${root}/${resource}/${safeType}/${safeId}${suffix}.json`;
  return base.toString();
}

export async function fetchAddonResource(input: {
  manifestUrl: string; resource: 'catalog' | 'meta' | 'stream' | 'subtitles'; type: string; id: string;
  extra?: Record<string, string>; allowHttp: boolean;
}) {
  const { manifestUrl, manifest } = await inspectAddon(input.manifestUrl, input.allowHttp);
  if (!supportsResource(manifest, input.resource, input.type)) {
    throw new ApiError(422, `Este addon não declara o recurso ${input.resource} para ${input.type}.`, 'ADDON_RESOURCE_UNSUPPORTED');
  }
  const resourceUrl = buildResourceUrl(manifestUrl, input.resource, input.type, input.id, input.extra);
  const data = await safeFetchJson(resourceUrl, input.allowHttp);
  return { addon: { id: manifest.id, name: manifest.name }, data };
}
