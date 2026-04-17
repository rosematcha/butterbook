import { API_BASE_URL } from './env';

const TOKEN_KEY = 'butterbook.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token === null) window.localStorage.removeItem(TOKEN_KEY);
  else window.localStorage.setItem(TOKEN_KEY, token);
}

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Array<{ path: string; message: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ApiProblem;
  constructor(problem: ApiProblem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
    this.problem = problem;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  // For CSV etc. — return the raw Response instead of auto-parsing JSON.
  raw?: boolean;
}

export async function api(path: string, opts: ApiRequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(body !== undefined ? { body } : {}),
    credentials: 'omit',
  });
  if (opts.raw) return res;
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const p = parsed as ApiProblem;
    if (p?.type && p?.status) throw new ApiError(p);
    throw new ApiError({ type: 'about:blank', title: 'Request failed', status: res.status, detail: text });
  }
  return parsed;
}

// Narrowly typed convenience wrappers.
export async function apiGet<T>(path: string): Promise<T> {
  return (await api(path)) as T;
}
export async function apiPost<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return (await api(path, { method: 'POST', ...(body !== undefined ? { body } : {}), ...(headers ? { headers } : {}) })) as T;
}
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return (await api(path, { method: 'PATCH', body })) as T;
}
export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return (await api(path, { method: 'PUT', body })) as T;
}
export async function apiDelete<T>(path: string): Promise<T> {
  return (await api(path, { method: 'DELETE' })) as T;
}
