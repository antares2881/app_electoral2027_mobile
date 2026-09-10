import { http } from '../api/http';

export interface SeguimientoRow {
  [key: string]: any;
  esperados?: number;
  confirmados?: number;
  departamento?: string;
  nombre_departamento?: string;
  desc_dpto?: string;
  dpto?: string;
  cod_dpto?: number | string;
  departamento_id?: number | string;
  municipio?: string;
  nombre_municipio?: string;
  desc_mcpio?: string;
  mcpio?: string;
  cod_mcpio?: number | string;
  municipio_id?: number | string;
  nombre_puesto?: string;
  puesto?: string;
}

function normalizeNumericId(value: number | string | null): string {
  if (value === null) {
    return 'null';
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return String(parsed);
  }

  return 'null';
}

export async function getPuestosDivipoles(params: {
  dpto: number | string;
  mcpio: number | string;
  liderId: number | null;
}): Promise<SeguimientoRow[]> {
  const dpto = normalizeNumericId(params.dpto as number | string | null);
  const mcpio = normalizeNumericId(params.mcpio as number | string | null);
  const lider = normalizeNumericId(params.liderId);

  const { data } = await http.get(`/puestos_divipoles/${dpto}/${mcpio}/${lider}`);
  return Array.isArray(data?.puestos) ? (data.puestos as SeguimientoRow[]) : [];
}
