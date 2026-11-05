import { desktop } from './desktop';

/**
 * API client.
 * - Browser: same origin (Vite proxy / reverse proxy); auth via httpOnly cookie,
 *   mutating requests carry X-Aldetes-Client for CSRF protection.
 * - Desktop: configurable server URL; token kept in OS-encrypted storage (safeStorage) and sent as Bearer.
 */
let baseUrl = '';
let bearer: string | null = null;
let serverConfigured = true;

export async function initApi() {
  if (desktop) {
    const saved = await desktop.getServerUrl();
    serverConfigured = !!saved;
    baseUrl = (saved ?? 'http://localhost:3001').replace(/\/$/, '');
    bearer = await desktop.getToken();
  }
}

/** Desktop app opened for the first time: no server chosen yet. */
export const needsServerSetup = () => !serverConfigured;

export const getBaseUrl = () => baseUrl;
export const getBearer = () => bearer;

/** `remember=false` keeps the desktop token only in memory (logged out when the app closes). */
export async function setSessionToken(token: string | null, remember = true) {
  bearer = desktop ? token : null;
  if (desktop) await desktop.setToken(remember ? token : null);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
    /** the full JSON error body (e.g. a 409 carries the current server state) */
    public body?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Aldetes-Client': 'web' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api${path}`, { method, headers, body: payload, credentials: 'include', signal: opts.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor');
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('aldetes:unauthorized'));
    // a route this server doesn't have yet (app newer than the server during an update): a clear message, not "Route … not found"
    if (res.status === 404 && typeof data?.message === 'string' && /^Route \w+:/.test(data.message))
      throw new ApiError(404, 'OUTDATED_SERVER', 'O servidor ainda está terminando de atualizar. Tente de novo em alguns minutos.', undefined, data);
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? `Erro ${res.status}`, data?.details, data);
  }
  return data as T;
}

/** Upload with progress (XHR, since fetch lacks upload progress). */
export function upload<T>(path: string, form: FormData, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Aldetes-Client', 'web');
    if (bearer) xhr.setRequestHeader('Authorization', `Bearer ${bearer}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.code ?? 'ERROR', data?.message ?? `Erro ${xhr.status}`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Falha no envio'));
    xhr.send(form);
  });
}
