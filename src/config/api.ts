export const API_BASE_URL = 'https://apidemo.convexosit.co/api';

// Proxy Laravel para evitar errores intermitentes de SNI/421 en cliente móvil.
export const PERSONAS_PROXY_API_URL = 'https://proxy.convexosit.co/api/personas-proxy';
export const PERSONAS_PROXY_API_URL_HTTP = 'http://proxy.convexosit.co/api/personas-proxy';

// Endpoint externo original (fallback si el proxy falla temporalmente).
export const PERSONAS_EXTERNAL_API_URL = 'https://apiserver.convexosit.co/personas';
export const PERSONAS_EXTERNAL_API_URL_HTTP = 'http://apiserver.convexosit.co/personas';

// Alias legado para mantener compatibilidad en servicios existentes.
export const PERSONAS_API_URL = PERSONAS_PROXY_API_URL;

// Opcional: solo se usa si el proveedor externo aún lo exige desde backend o en fallback.
export const PERSONAS_API_KEY = 'S3CUR32025';
