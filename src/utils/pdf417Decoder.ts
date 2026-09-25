/**
 * Decodificador PDF417 100 % JavaScript (ZXing) para leer la cédula amarilla
 * desde una FOTO. Funciona en Expo Go y en la app compilada, iOS y Android.
 *
 * Se usa porque el lector en vivo de la cámara en iOS falla con el PDF417 de la
 * cédula (datos binarios con separadores \0). Aquí se conservan los bytes tal cual.
 */
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  PDF417Reader,
  RGBLuminanceSource,
  ZXingStringEncoding,
} from '@zxing/library';
import * as jpeg from 'jpeg-js';

// Los bytes del PDF417 se convierten 1:1 a caracteres (latin1) para no perder los \0.
ZXingStringEncoding.customDecoder = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]+,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
    if (p < len) out[p++] = (a << 2) | (b >> 4);
    if (p < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}

function rotar90(lum: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fila = y * w;
    for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = lum[fila + x];
  }
  return out;
}

function intentarDecodificar(lum: Uint8ClampedArray, w: number, h: number): string | null {
  const hints = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, h)));
    return new PDF417Reader().decode(bitmap, hints).getText();
  } catch {
    return null;
  }
}

/**
 * Recibe una imagen JPEG en base64 y devuelve el contenido del PDF417 (o null).
 * Prueba la imagen horizontal y rotada 90° (cédula de lado).
 */
export function decodificarPdf417DesdeJpegBase64(base64: string): string | null {
  const img = jpeg.decode(base64ToBytes(base64), { useTArray: true, formatAsRGBA: true });
  const { width: w, height: h, data } = img;

  const lum = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
  }

  return intentarDecodificar(lum, w, h) ?? intentarDecodificar(rotar90(lum, w, h), h, w);
}
