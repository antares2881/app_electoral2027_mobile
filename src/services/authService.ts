import { http } from '../api/http';
import type { LoginPayload, LoginResponse, LoginResult } from '../types/auth';

function getPathValue(source: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], source);
}

function looksLikeSanctumToken(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length < 20) {
    return false;
  }

  const looksSanctum = trimmed.includes('|');
  const looksJwt = trimmed.split('.').length === 3;
  const looksOpaque = /^[A-Za-z0-9_\-\.\|]+$/.test(trimmed);

  return looksSanctum || looksJwt || looksOpaque;
}

function resolveToken(data: any): string | null {
  const candidatePaths = [
    'access_token',
    'plainTextToken',
    'token',
    'token.plainTextToken',
    'token.accessToken.token',
    'signup.access_token',
    'signup.plainTextToken',
    'signup.token',
    'signup.token.plainTextToken',
    'signup.token.accessToken.token',
    'data.access_token',
    'data.plainTextToken',
    'data.token',
    'data.token.plainTextToken',
    'data.token.accessToken.token',
  ];

  for (const path of candidatePaths) {
    const value = getPathValue(data, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  const possibleStrings: string[] = [];
  const queue: Array<{ path: string; value: any }> = [{ path: 'root', value: data }];

  while (queue.length > 0) {
    const currentNode = queue.shift();
    const current = currentNode?.value;
    const currentPath = currentNode?.path ?? 'root';

    if (!current || typeof current !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const nextPath = `${currentPath}.${key}`;

      if (typeof value === 'string') {
        const keyLooksLikeToken = /token|bearer|access/i.test(key);
        if (keyLooksLikeToken && value.trim().length > 0) {
          return value;
        }

        possibleStrings.push(value);
      } else if (value && typeof value === 'object') {
        queue.push({ path: nextPath, value });
      }
    }
  }

  const sanctumToken = possibleStrings.find(looksLikeSanctumToken);
  return sanctumToken ?? null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveFirstNumber(data: any, paths: string[]): number | null {
  for (const path of paths) {
    const value = getPathValue(data, path);
    const parsed = toNullableNumber(value);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function resolveFirstNumberByKey(data: any, keyMatcher: RegExp): number | null {
  const queue: any[] = [data];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (keyMatcher.test(key)) {
        const parsed = toNullableNumber(value);
        if (parsed !== null) {
          return parsed;
        }
      }

      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function resolveDisplayName(data: any, fallbackUsername: string): string {
  const candidatePaths = [
    'user.name',
    'signup.user.name',
    'data.user.name',
    'user.usuario',
    'signup.user.usuario',
    'data.user.usuario',
    'name',
    'usuario',
    'username',
  ];

  for (const path of candidatePaths) {
    const value = getPathValue(data, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallbackUsername;
}

function resolveUsername(data: any, fallbackUsername: string): string {
  const candidatePaths = [
    'user.usuario',
    'signup.user.usuario',
    'data.user.usuario',
    'usuario',
    'username',
    'user.username',
    'signup.user.username',
    'data.user.username',
  ];

  for (const path of candidatePaths) {
    const value = getPathValue(data, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallbackUsername;
}

export async function loginRequest(payload: LoginPayload): Promise<LoginResult> {
  const requestBody = {
    username: payload.username,
    password: payload.password,
    json: JSON.stringify({
      username: payload.username,
      password: payload.password,
    }),
  };

  const { data } = await http.post<LoginResponse | any>('/login', requestBody);
  const token = resolveToken(data);

  if (!token) {
    const backendMessage =
      data?.message ||
      data?.signup?.message ||
      data?.data?.message ||
      (data?.status === 'error' || data?.signup?.status === 'error'
        ? 'Credenciales inválidas o usuario inactivo.'
        : null);

    const responseKeys =
      data && typeof data === 'object'
        ? Object.keys(data).slice(0, 8).join(', ')
        : typeof data;

    throw new Error(
      backendMessage ||
        `La API no retornó token. Estructura recibida: ${responseKeys || 'sin datos'}. Verifica /api/login en Laravel.`,
    );
  }

  const userId =
    resolveFirstNumber(data, [
      'user.id',
      'signup.user.id',
      'data.user.id',
      'usuario.id',
      'signup.usuario.id',
      'data.usuario.id',
      'user_id',
      'signup.user_id',
      'data.user_id',
    ]) || resolveFirstNumberByKey(data, /^user_id$/i);

  const roleId =
    resolveFirstNumber(data, [
      'user.role_id',
      'signup.user.role_id',
      'role_id',
      'data.user.role_id',
      'data.role_id',
      'signup.role_id',
    ]) || resolveFirstNumberByKey(data, /^role_id$|^rol_id$/i);

  const candidatoId =
    resolveFirstNumber(data, [
      'user.candidato_id',
      'signup.user.candidato_id',
      'candidato_id',
      'data.user.candidato_id',
      'data.candidato_id',
      'signup.candidato_id',
      'user.candidato.id',
      'user.candidato.0.id',
      'signup.user.candidato.id',
      'signup.user.candidato.0.id',
      'data.user.candidato.id',
      'data.user.candidato.0.id',
    ]) || resolveFirstNumberByKey(data, /^candidato_id$|^candidate_id$/i);

  const corporacionId =
    resolveFirstNumber(data, [
      'user.corporacion_id',
      'signup.user.corporacion_id',
      'corporacion_id',
      'data.user.corporacion_id',
      'data.corporacion_id',
      'signup.corporacion_id',
      'user.candidato.corporacione_id',
      'user.candidato.corporacion_id',
      'user.candidato.0.corporacione_id',
      'user.candidato.0.corporacion_id',
      'signup.user.candidato.corporacione_id',
      'signup.user.candidato.corporacion_id',
      'signup.user.candidato.0.corporacione_id',
      'signup.user.candidato.0.corporacion_id',
      'data.user.candidato.corporacione_id',
      'data.user.candidato.corporacion_id',
      'data.user.candidato.0.corporacione_id',
      'data.user.candidato.0.corporacion_id',
    ]) || resolveFirstNumberByKey(data, /^corporacione_id$|^corporacion_id$/i);

  const departamentoId =
    resolveFirstNumber(data, [
      'user.departamento_id',
      'signup.user.departamento_id',
      'data.user.departamento_id',
      'user.candidato.departamento_id',
      'user.candidato.0.departamento_id',
      'signup.user.candidato.departamento_id',
      'signup.user.candidato.0.departamento_id',
      'data.user.candidato.departamento_id',
      'data.user.candidato.0.departamento_id',
    ]) || resolveFirstNumberByKey(data, /^departamento_id$|^dpto_id$/i);

  const municipioId =
    resolveFirstNumber(data, [
      'user.municipio_id',
      'signup.user.municipio_id',
      'data.user.municipio_id',
      'user.candidato.municipio_id',
      'user.candidato.0.municipio_id',
      'signup.user.candidato.municipio_id',
      'signup.user.candidato.0.municipio_id',
      'data.user.candidato.municipio_id',
      'data.user.candidato.0.municipio_id',
    ]) || resolveFirstNumberByKey(data, /^municipio_id$|^mcpio_id$/i);

  const displayName = resolveDisplayName(data, payload.username);
  const username = resolveUsername(data, payload.username);

  return {
    token,
    userId,
    username,
    displayName,
    roleId,
    candidatoId,
    corporacionId,
    departamentoId,
    municipioId,
  };
}
