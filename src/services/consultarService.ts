import axios from 'axios';
import {
  PERSONAS_API_KEY,
  PERSONAS_EXTERNAL_API_URL,
  PERSONAS_EXTERNAL_API_URL_HTTP,
  PERSONAS_PROXY_API_URL,
  PERSONAS_PROXY_API_URL_HTTP,
} from '../config/api';
import { http } from '../api/http';

export interface LugarVotacion {
  departamento: string;
  municipio: string;
  puesto: string;
  mesa: string;
}

export interface PersonaConsultaData extends LugarVotacion {
  cedula: string;
  nombres: string;
  apellidos: string;
  estado: string;
  descEstado: string;
  departamentoId: number | null;
  municipioId: number | null;
  zona: string;
  puestoId: string;
  nombrePuesto: string;
  comuna: string;
  fechaNacimiento: string;
  direccion: string;
  telefono: string;
}

export interface AsistenciaCheckResult {
  exists: boolean;
  message: string;
}

export interface LiderOption {
  value: number;
  text: string;
}

export interface VotanteRegistradoResult {
  found: boolean;
  lidereId: number | null;
  liderNombre: string;
  persona: PersonaConsultaData | null;
  createdAt: string;
}

export interface RegistrarAsistenciaPayload {
  cedula: string;
  desc_dpto: string;
  desc_mcpio: string;
  departamento_id: number | null;
  municipio_id: number | null;
  nombres: string;
  apellidos: string;
  estado: string;
  fecha_nac: string;
  zona: string;
  puesto: string;
  nombre_puesto: string;
  mesa: string;
  lidere_id: number;
  barrio_id?: number | null;
  direccion?: string;
  telefono?: string;
  correo?: string;
  perfil?: string | null;
  observacion?: string;
  observacione_id?: number;
  comuna?: string;
}

function readStringValue(source: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return '';
}

function findFirstNonNumericString(source: any): string {
  if (typeof source === 'string') {
    const value = source.trim();
    if (value.length > 0 && !/^\d+$/.test(value)) {
      return value;
    }
    return '';
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const found = findFirstNonNumericString(item);
      if (found) {
        return found;
      }
    }
    return '';
  }

  if (source && typeof source === 'object') {
    for (const value of Object.values(source)) {
      const found = findFirstNonNumericString(value);
      if (found) {
        return found;
      }
    }
  }

  return '';
}

function sanitizeId(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/[^0-9]/g, '');
}

function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveLugarNode(data: any): Record<string, any> | null {
  if (Array.isArray(data?.lugar) && data.lugar.length > 0) {
    return data.lugar[0] as Record<string, any>;
  }

  return null;
}

function resolvePersonaNode(data: any): Record<string, any> | null {
  if (Array.isArray(data?.datosPersona) && data.datosPersona.length > 0) {
    return data.datosPersona[0] as Record<string, any>;
  }

  return null;
}

function normalizePersonasPayload(raw: any): any {
  if (raw?.data && typeof raw.data === 'object') {
    return raw.data;
  }

  return raw;
}

function mapPersonasApiError(error: any, sourceLabel = 'servicio de personas'): Error {
  if (!error?.response) {
    const networkMessage = typeof error?.message === 'string' ? error.message : 'Error de red.';
    const code = error?.code ? ` code=${error.code}` : '';
    return new Error(`No fue posible conectar con el ${sourceLabel}.${code} ${networkMessage}`);
  }

  const status = Number(error?.response?.status);
  const rawData = error?.response?.data;
  const rawString = typeof rawData === 'string' ? rawData : '';
  const looksHtml = /<html|<body|<!doctype/i.test(rawString);
  const hasSniIssue = /misdirected request|sni/i.test(rawString);

  if (status === 421 || (looksHtml && hasSniIssue)) {
    return new Error(`El ${sourceLabel} no está disponible temporalmente (status=${status || 'n/a'}). Intenta nuevamente en unos minutos.`);
  }

  if (status >= 500 && status < 600) {
    return new Error(`El ${sourceLabel} presentó un error temporal (status=${status}). Intenta nuevamente en unos minutos.`);
  }

  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return new Error(error.message);
  }

  return new Error(`No fue posible consultar el ${sourceLabel}.`);
}

function isRetryablePersonasError(error: any): boolean {
  const status = Number(error?.response?.status);
  const code = String(error?.code ?? '').toUpperCase();
  const rawData = error?.response?.data;
  const rawString = typeof rawData === 'string' ? rawData : '';
  const looksHtml = /<html|<body|<!doctype/i.test(rawString);
  const hasSniIssue = /misdirected request|sni/i.test(rawString);

  const isTransientServer = status >= 500 && status < 600;
  const isNetworkCode =
    code === 'ECONNABORTED' ||
    code === 'ERR_NETWORK' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET';

  return status === 421 || (looksHtml && hasSniIssue) || isTransientServer || isNetworkCode;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestPersonasApiByUrl(cedula: string, url: string, sourceLabel: string): Promise<any> {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Connection: 'close',
      };

      if (PERSONAS_API_KEY.trim()) {
        headers.api_key = PERSONAS_API_KEY;
      }

      const { data } = await axios.get(url, {
        params: {
          id: cedula,
          _t: Date.now(),
        },
        timeout: 30000,
        headers,
      });

      return normalizePersonasPayload(data);
    } catch (error: any) {
      const canRetry = isRetryablePersonasError(error) && attempt < maxAttempts;
      if (canRetry) {
        await delay(700 * attempt);
        continue;
      }

      throw mapPersonasApiError(error, sourceLabel);
    }
  }

  throw new Error(`No fue posible consultar el ${sourceLabel}.`);
}

async function requestPersonasApi(cedula: string): Promise<any> {
  let errors: string[] = [];

  const attempts: Array<{ url: string; label: string }> = [
    { url: PERSONAS_EXTERNAL_API_URL, label: 'servicio externo https' },
    { url: PERSONAS_EXTERNAL_API_URL_HTTP, label: 'servicio externo http' },
    { url: PERSONAS_PROXY_API_URL, label: 'servicio proxy https' },
    { url: PERSONAS_PROXY_API_URL_HTTP, label: 'servicio proxy http' },
  ];

  for (const attempt of attempts) {
    try {
      return await requestPersonasApiByUrl(cedula, attempt.url, attempt.label);
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }
  }

  throw new Error(`No fue posible consultar personas. ${errors.join(' | ')}`);
}

export async function getDepartamento(id: string): Promise<string> {
  const departamentoId = sanitizeId(id);
  if (!departamentoId) {
    return 'N/D';
  }

  const { data } = await axios.get(`https://apiparlamentarias.convexosit.co/departamentos/${departamentoId}`, {
    timeout: 30000,
  });

  const nombre = readStringValue(data?.departamento ?? {}, ['departamento']);
  return nombre || 'N/D';
}

export async function getMunicipio(departamento_id: string, municipio_id: string): Promise<string> {
  const departamentoId = sanitizeId(departamento_id);
  const municipioId = sanitizeId(municipio_id);

  if (!departamentoId || !municipioId) {
    return 'N/D';
  }

  const { data } = await axios.get(
    `https://apiparlamentarias.convexosit.co/get_municipio/${departamentoId}/${municipioId}`,
    {
    timeout: 30000,
    },
  );

  const municipioNode = data?.municipio ?? data;
  const nombre =
    readStringValue(municipioNode ?? {}, ['municipio', 'nombre_municipio', 'nombre', 'descripcion']) ||
    findFirstNonNumericString(municipioNode);

  return nombre || 'N/D';
}

export async function consultarLugarVotacion(cedula: string): Promise<LugarVotacion> {
  const data = await requestPersonasApi(cedula);

  const lugar = Array.isArray(data?.lugar) ? data.lugar[0] : null;
  if (!lugar) {
    throw new Error('No se encontró lugar de votación para la cédula consultada.');
  }

  const departamentoFallback =
    readStringValue(lugar, ['departamento', 'depto', 'nombre_departamento', 'departamento_nombre']) ||
    readStringValue(lugar, ['cod_dpto']) ||
    'N/D';

  const municipioFallback =
    readStringValue(lugar, ['municipio', 'nombre_municipio', 'mcpio', 'municipio_nombre']) ||
    readStringValue(lugar, ['cod_mcpio']) ||
    'N/D';

  const departamentoId =
    readStringValue(lugar, ['departamento_id', 'id_departamento', 'cod_dpto']) ||
    readStringValue(data, ['departamento_id']);
  const municipioId =
    readStringValue(lugar, ['municipio_id', 'id_municipio', 'cod_mcpio']) || readStringValue(data, ['municipio_id']);

  let departamento = departamentoFallback;
  let municipio = municipioFallback;

  if (departamentoId) {
    try {
      const nombreDepartamento = await getDepartamento(departamentoId);
      if (nombreDepartamento && nombreDepartamento !== 'N/D') {
        departamento = nombreDepartamento;
      }
    } catch {
      departamento = departamentoFallback;
    }
  }

  if (departamentoId && municipioId) {
    try {
      const nombreMunicipio = await getMunicipio(departamentoId, municipioId);
      if (nombreMunicipio && nombreMunicipio !== 'N/D') {
        municipio = nombreMunicipio;
      }
    } catch {
      municipio = municipioFallback;
    }
  }

  const puesto = readStringValue(lugar, ['nombre_puesto', 'puesto', 'puesto_nombre']) || 'N/D';
  const mesa = readStringValue(lugar, ['mesa']) || 'N/D';

  return {
    departamento,
    municipio,
    puesto,
    mesa,
  };
}

export async function consultarPersonaParaRegistro(cedula: string): Promise<PersonaConsultaData> {
  const cedulaSanitizada = sanitizeId(cedula);
  if (!cedulaSanitizada) {
    throw new Error('Ingrese una cédula válida.');
  }

  const data = await requestPersonasApi(cedulaSanitizada);

  const lugar = resolveLugarNode(data);
  if (!lugar) {
    throw new Error('No se encontró lugar de votación para la cédula consultada.');
  }

  const persona = resolvePersonaNode(data);

  const departamentoFallback =
    readStringValue(lugar, ['departamento', 'depto', 'nombre_departamento', 'departamento_nombre', 'desc_dpto']) ||
    readStringValue(lugar, ['cod_dpto']) ||
    'N/D';

  const municipioFallback =
    readStringValue(lugar, ['municipio', 'nombre_municipio', 'mcpio', 'municipio_nombre', 'desc_mcpio']) ||
    readStringValue(lugar, ['cod_mcpio']) ||
    'N/D';

  const departamentoIdStr =
    readStringValue(lugar, ['departamento_id', 'id_departamento', 'cod_dpto']) ||
    readStringValue(data, ['departamento_id']);
  const municipioIdStr =
    readStringValue(lugar, ['municipio_id', 'id_municipio', 'cod_mcpio']) || readStringValue(data, ['municipio_id']);

  const departamentoId = toNullableNumber(departamentoIdStr);
  const municipioId = toNullableNumber(municipioIdStr);

  let departamento = departamentoFallback;
  let municipio = municipioFallback;

  if (departamentoId !== null) {
    try {
      const nombreDepartamento = await getDepartamento(String(departamentoId));
      if (nombreDepartamento && nombreDepartamento !== 'N/D') {
        departamento = nombreDepartamento;
      }
    } catch {
      departamento = departamentoFallback;
    }
  }

  if (departamentoId !== null && municipioId !== null) {
    try {
      const nombreMunicipio = await getMunicipio(String(departamentoId), String(municipioId));
      if (nombreMunicipio && nombreMunicipio !== 'N/D') {
        municipio = nombreMunicipio;
      }
    } catch {
      municipio = municipioFallback;
    }
  }

  const nom1 = readStringValue(persona ?? {}, ['nom1', 'nombre1']);
  const nom2 = readStringValue(persona ?? {}, ['nom2', 'nombre2']);
  const ape1 = readStringValue(persona ?? {}, ['ape1', 'apellido1']);
  const ape2 = readStringValue(persona ?? {}, ['ape2', 'apellido2']);

  const nombres = [nom1, nom2].filter(Boolean).join(' ').trim();
  const apellidos = [ape1, ape2].filter(Boolean).join(' ').trim();

  return {
    cedula: cedulaSanitizada,
    nombres: nombres || 'N/D',
    apellidos: apellidos || 'N/D',
    estado: readStringValue(persona ?? {}, ['estado']) || '0',
    descEstado: readStringValue(persona ?? {}, ['desc_estado']) || 'N/D',
    fechaNacimiento: readStringValue(persona ?? {}, ['fecha_nac']) || '',
    departamento,
    municipio,
    puesto: readStringValue(lugar, ['nombre_puesto', 'puesto', 'puesto_nombre']) || 'N/D',
    mesa: readStringValue(lugar, ['mesa']) || 'N/D',
    departamentoId,
    municipioId,
    zona: readStringValue(lugar, ['zona']) || '',
    puestoId: readStringValue(lugar, ['puesto']) || '',
    nombrePuesto: readStringValue(lugar, ['nombre_puesto', 'puesto_nombre']) || 'N/D',
    comuna: readStringValue(lugar, ['comuna']) || '',
    direccion: '',
    telefono: '',
  };
}

export async function verificarAsistenciaPorCedula(cedula: string): Promise<AsistenciaCheckResult> {
  const cedulaSanitizada = sanitizeId(cedula);
  if (!cedulaSanitizada) {
    throw new Error('Ingrese una cédula válida.');
  }

  const { data } = await http.get(`/asistencia/${cedulaSanitizada}`);
  const asistenciaList = Array.isArray(data?.asistencia) ? data.asistencia : [];

  if (asistenciaList.length === 0) {
    return { exists: false, message: '' };
  }

  const firstItem = asistenciaList[0] ?? {};
  const liderNombre = readStringValue(firstItem, ['lider', 'nombre_lider', 'lider_nombre']);

  return {
    exists: true,
    message: liderNombre
      ? `La cédula consultada ya fue registrada por el líder: ${liderNombre}.`
      : 'La cédula consultada ya cuenta con asistencia registrada.',
  };
}

export async function verificarVotanteRegistrado(params: {
  cedula: string;
  candidatoId: number;
  corporacionId: number;
}): Promise<VotanteRegistradoResult> {
  const cedulaSanitizada = sanitizeId(params.cedula);
  if (!cedulaSanitizada) {
    throw new Error('Ingrese una cédula válida.');
  }

  const requestBody = {
    candidato: params.candidatoId,
    corporacion: params.corporacionId,
    cedula: cedulaSanitizada,
  };

  const { data } = await http.post('/votantes-repetidos', requestBody);
  const votantes = Array.isArray(data?.votante) ? data.votante : [];

  if (votantes.length === 0) {
    return {
      found: false,
      createdAt: '',
      lidereId: null,
      liderNombre: '',
      persona: null,
    };
  }

  const first = votantes[0] ?? {};
  const lidereId = toNullableNumber(first?.lidere_id ?? first?.lider_id);
  const liderNombre =
    readStringValue(first, ['nombre_lider']) ||
    [readStringValue(first, ['nombres_lider']), readStringValue(first, ['apellidos_lider'])].filter(Boolean).join(' ').trim();

  const persona: PersonaConsultaData = {
    cedula: sanitizeId(readStringValue(first, ['cedula', 'id']) || cedulaSanitizada),
    nombres: readStringValue(first, ['nombres']) || 'N/D',
    apellidos: readStringValue(first, ['apellidos']) || 'N/D',
    estado: readStringValue(first, ['estado']) || '0',
    descEstado: readStringValue(first, ['desc_estado']) || 'N/D',
    fechaNacimiento: readStringValue(first, ['fecha_nac']) || '',
    departamento: readStringValue(first, ['desc_dpto', 'departamento']) || 'N/D',
    municipio: readStringValue(first, ['desc_mcpio', 'municipio']) || 'N/D',
    puesto: readStringValue(first, ['nombre_puesto', 'puesto']) || 'N/D',
    mesa: readStringValue(first, ['mesa']) || 'N/D',
    departamentoId: toNullableNumber(first?.departamento_id),
    municipioId: toNullableNumber(first?.municipio_id),
    zona: readStringValue(first, ['zona']),
    puestoId: readStringValue(first, ['puesto']),
    nombrePuesto: readStringValue(first, ['nombre_puesto']) || 'N/D',
    comuna: readStringValue(first, ['comuna']),
    direccion: readStringValue(first, ['direccion']) || 'N/D',
    telefono: readStringValue(first, ['telefono']) || 'N/D',
  };

  return {
    found: true,
    createdAt: readStringValue(first, ['created_at']),
    lidereId,
    liderNombre,
    persona,
  };
}

export async function getLideres(candidatoId: number): Promise<LiderOption[]> {
  const { data } = await http.get(`/lideres`);
  const lideres = Array.isArray(data?.lideres) ? data.lideres : [];

  return lideres
    .map((item: any): LiderOption | null => {
      const value = toNullableNumber(item?.id);
      const text = [readStringValue(item ?? {}, ['nombres']), readStringValue(item ?? {}, ['apellidos'])]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (value === null) {
        return null;
      }

      return {
        value,
        text: text || `Líder ${value}`,
      };
    })
    .filter((item: LiderOption | null): item is LiderOption => item !== null);
}

export function construirPayloadAsistencia(params: {
  persona: PersonaConsultaData;
  lidereId: number;
  observacion?: string;
  observacioneId?: number;
}): RegistrarAsistenciaPayload {
  return {
    cedula: params.persona.cedula,
    desc_dpto: params.persona.departamento,
    desc_mcpio: params.persona.municipio,
    departamento_id: params.persona.departamentoId,
    municipio_id: params.persona.municipioId,
    nombres: params.persona.nombres,
    apellidos: params.persona.apellidos,
    estado: params.persona.estado,
    fecha_nac: params.persona.fechaNacimiento,
    zona: params.persona.zona,
    puesto: params.persona.puestoId,
    nombre_puesto: params.persona.nombrePuesto,
    mesa: params.persona.mesa,
    lidere_id: params.lidereId,
    barrio_id: null,
    direccion: params.persona.direccion,
    telefono: params.persona.telefono,
    correo: '',
    perfil: null,
    observacion: params.observacion,
    observacione_id: params.observacioneId ?? 1,
    comuna: params.persona.comuna,
  };
}

export async function registrarAsistencia(payload: RegistrarAsistenciaPayload): Promise<void> {
  const { data } = await http.post('/dar_asistencia', payload);

  const status = String(data?.status ?? '').toLowerCase();
  if (status !== 'success') {
    const backendMessage =
      readStringValue(data ?? {}, ['message', 'error']) ||
      (typeof data === 'string' ? data : '') ||
      (data && typeof data === 'object' ? JSON.stringify(data) : '');

    throw new Error(backendMessage || 'La API no confirmó el registro de asistencia.');
  }
}

export async function agregarPersona(payload: RegistrarAsistenciaPayload): Promise<void> {
  const { data } = await http.post('/listadovotantes', payload);

  const status = String(data?.status ?? '').toLowerCase();
  if (status !== 'success') {
    const backendMessage =
      readStringValue(data ?? {}, ['message', 'error']) ||
      (typeof data === 'string' ? data : '') ||
      (data && typeof data === 'object' ? JSON.stringify(data) : '');

    throw new Error(backendMessage || 'La API no confirmó el registro de persona.');
  }
}
