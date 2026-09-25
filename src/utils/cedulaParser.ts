/**
 * Utilidades para extraer el número de cédula colombiana.
 *
 *  - Cédula amarilla con hologramas: código PDF417 del reverso.
 *  - Cédula digital: zona MRZ (3 líneas "<<<") de la parte inferior del reverso.
 */

export type CedulaOrigen = 'amarilla' | 'digital';

export interface CedulaResultado {
  numero: string;
  origen: CedulaOrigen;
  primerApellido?: string;
  segundoApellido?: string;
  nombres?: string;
  sexo?: string;
  fechaNacimiento?: string; // AAAA-MM-DD
  /** true si el dígito de control compuesto de la MRZ confirmó la lectura (cédula digital). */
  verificado?: boolean;
}

/* ------------------------------------------------------------------ */
/* CÉDULA AMARILLA (PDF417)                                            */
/* ------------------------------------------------------------------ */

/**
 * Estructura del PDF417 (campos de longitud fija, rellenos con \0):
 *   0-23   : código interno
 *   24-31  : "PubDSK_1"
 *   40-47  : 8 dígitos (huella / control)
 *   48-57  : número de cédula (10 dígitos con ceros a la izquierda)
 *   58-80  : primer apellido
 *   81-103 : segundo apellido
 *   104-126: primer nombre
 *   127-149: segundo nombre
 *   151    : sexo (M/F)
 *   152-159: fecha nacimiento AAAAMMDD
 *
 * Algunos lectores eliminan los caracteres \0, por eso primero se intenta
 * por posición fija y, si falla, por posición relativa a "PubDSK_1".
 */
export function parseCedulaAmarilla(raw: string): CedulaResultado | null {
  if (!raw) return null;

  // 1) Posiciones fijas (el lector conservó los \0)
  if (raw.length >= 160 && raw.substring(24, 32) === 'PubDSK_1') {
    const numero = raw.substring(48, 58).replace(/\D/g, '').replace(/^0+/, '');
    if (numero.length >= 5) {
      const campo = (a: number, b: number) =>
        raw.substring(a, b).replace(/\0/g, '').trim() || undefined;
      const fn = raw.substring(152, 160);
      return {
        numero,
        origen: 'amarilla',
        primerApellido: campo(58, 81),
        segundoApellido: campo(81, 104),
        nombres: [campo(104, 127), campo(127, 150)].filter(Boolean).join(' ') || undefined,
        sexo: campo(151, 152),
        fechaNacimiento: /^\d{8}$/.test(fn)
          ? `${fn.slice(0, 4)}-${fn.slice(4, 6)}-${fn.slice(6, 8)}`
          : undefined,
      };
    }
  }

  // 2) Relativo a "PubDSK_1" (el lector eliminó los \0)
  const idx = raw.indexOf('PubDSK_1');
  if (idx >= 0) {
    const resto = raw.substring(idx + 8).replace(/\0/g, '');
    // 8 dígitos de control + 10 dígitos de cédula, seguidos del primer apellido
    const m = resto.match(/^\s*\d{8}(\d{10})/);
    if (m) {
      const numero = m[1].replace(/^0+/, '');
      if (numero.length >= 5) {
        return { numero, origen: 'amarilla' };
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* CÉDULA DIGITAL (MRZ, formato ICAO TD1: 3 líneas de 30 caracteres)   */
/* ------------------------------------------------------------------ */

const PESOS = [7, 3, 1];

function valorMRZ(c: string): number {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  return 0; // '<'
}

function digitoControl(s: string): number {
  let suma = 0;
  for (let i = 0; i < s.length; i++) suma += valorMRZ(s[i]) * PESOS[i % 3];
  return suma % 10;
}

/** Corrige confusiones típicas del OCR en campos que solo deben ser numéricos. */
function aNumerico(s: string): string {
  return s
    .replace(/[OQD]/g, '0')
    .replace(/[IL|]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/G/g, '6');
}

function normalizarTextoOCR(texto: string): string[] {
  return texto
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 20);
}

/**
 * Recibe el texto completo que devuelve el OCR de la foto del reverso de la
 * cédula digital y retorna el número de cédula (NUIP).
 *
 * Ejemplo de MRZ:
 *   ICCOL000125066213010<<<<<<<<<<      ← línea 1: n.º de serie del documento
 *   8411132F3102086COL30688933<<<9      ← línea 2: el NUIP va después de "COL"
 *   MORELO<PEREZ<<BIBIANA<PAOLA<<<      ← línea 3: apellidos<<nombres
 */
export function parseCedulaDigitalMRZ(textoOCR: string): CedulaResultado | null {
  const lineas = normalizarTextoOCR(textoOCR);

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const pos = l.indexOf('COL');
    // En la línea 2, "COL" está en la posición 15 (precedido por 15 caracteres de fechas)
    if (pos < 15 || l.startsWith('IC') || l.startsWith('ID')) continue;

    const inicio = pos - 15;
    const fechas = aNumerico(l.substring(inicio, pos)); // AAMMDD C S AAMMDD C
    const nacimiento = fechas.substring(0, 6);
    const ctrlNac = Number(fechas[6]);
    const sexo = l[inicio + 7];

    if (!/^\d{6}$/.test(nacimiento)) continue;
    // Validamos con el dígito de control para asegurar que es la línea correcta
    if (digitoControl(nacimiento) !== ctrlNac) continue;

    const opcional = aNumerico(l.substring(pos + 3).split('<')[0]);
    const numero = opcional.replace(/\D/g, '').replace(/^0+/, '');
    if (numero.length < 5 || numero.length > 10) continue;

    // Dígito de control compuesto (TD1): cubre línea 1 y los datos de la línea 2,
    // incluido el NUIP. Si coincide, la lectura es confiable.
    let verificado = false;
    const l2 = l.substring(inicio, inicio + 30);
    const l1 = [...lineas.slice(0, i)].reverse().find((x) => /^I[A-Z0-9<]C[O0]L/.test(x) && x.length >= 30);
    if (l1 && l2.length === 30 && /\d/.test(l2[29])) {
      const n2 = (a: number, b: number) => aNumerico(l2.substring(a, b));
      const compuesto = l1.substring(5, 30) + n2(0, 7) + n2(8, 15) + n2(18, 29);
      verificado = digitoControl(compuesto) === Number(aNumerico(l2[29]));
    }

    // Línea 3 (nombres), si existe
    let primerApellido: string | undefined;
    let segundoApellido: string | undefined;
    let nombres: string | undefined;
    const l3 = lineas[i + 1];
    if (l3 && l3.includes('<<')) {
      const [ap, no] = l3.split('<<').filter((x, k) => k < 2);
      const aps = (ap || '').split('<').filter(Boolean);
      primerApellido = aps[0];
      segundoApellido = aps.slice(1).join(' ') || undefined;
      nombres = (l3.substring(l3.indexOf('<<') + 2) || no || '')
        .split('<')
        .filter(Boolean)
        .join(' ') || undefined;
    }

    const yy = Number(nacimiento.slice(0, 2));
    const siglo = yy > new Date().getFullYear() % 100 ? '19' : '20';

    return {
      numero,
      origen: 'digital',
      primerApellido,
      segundoApellido,
      nombres,
      sexo: sexo === 'M' || sexo === 'F' ? sexo : undefined,
      fechaNacimiento: `${siglo}${nacimiento.slice(0, 2)}-${nacimiento.slice(2, 4)}-${nacimiento.slice(4, 6)}`,
      verificado,
    };
  }

  return null;
}
