import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { getPuestosDivipoles, type SeguimientoRow } from '../../services/seguimientoService';
import { sessionStorage } from '../../storage/sessionStorage';

interface HistorialFiltro {
  dpto: number;
  mcpio: number;
}

interface ConfirmadoRow {
  cedula: string;
  nombres: string;
  nombre_puesto: string;
  created_at: string;
}

function toSafeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nombreUbicacion(item: SeguimientoRow, nivel: 'departamento' | 'municipio' | 'puesto'): string {
  if (nivel === 'departamento') {
    return String(
      item.departamento || item.nombre_departamento || item.desc_dpto || item.dpto || item.cod_dpto || 'Departamento',
    );
  }

  if (nivel === 'municipio') {
    return String(item.municipio || item.nombre_municipio || item.desc_mcpio || item.mcpio || item.cod_mcpio || 'Municipio');
  }

  return String(item.nombre_puesto || item.puesto || 'Puesto');
}

function obtenerDptoItem(item: SeguimientoRow): number | null {
  const raw = item.departamento_id ?? item.dpto_id ?? item.cod_dpto ?? item.departamento;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function obtenerMcpioItem(item: SeguimientoRow): number | null {
  const raw = item.municipio_id ?? item.mcpio_id ?? item.cod_mcpio ?? item.mcpio;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function faltantesFila(item: SeguimientoRow): number {
  const esperados = toSafeNumber(item.esperados, 0);
  const confirmados = toSafeNumber(item.confirmados, 0);
  const faltantes = esperados - confirmados;
  return faltantes > 0 ? faltantes : 0;
}

function buildReporteUrl(params: {
  tipo: 'esperados' | 'confirmados' | 'faltantes';
  currentDpto: number;
  currentMcpio: number;
  item: SeguimientoRow;
  roleId: number;
  liderId: number | null;
}): string | null {
  const zona = params.item.zona;
  const puesto = params.item.puesto;
  const nombrePuesto = params.item.nombre_puesto;

  if (zona === undefined || puesto === undefined || nombrePuesto === undefined) {
    return null;
  }

  let url =
    `https://apiparlamentarias.convexosit.co/reporte-${params.tipo}/` +
    `${params.currentDpto}/${params.currentMcpio}/${encodeURIComponent(String(zona))}/` +
    `${encodeURIComponent(String(puesto))}/${encodeURIComponent(String(nombrePuesto))}/` +
    `${params.roleId}`;

  if (params.roleId === 5 && params.liderId) {
    url += `/${params.liderId}`;
  }

  return url;
}

function buildTotalConfirmadosUrl(roleId: number | null, liderId: number | null): string {
  const baseUrl = 'https://apiparlamentarias.convexosit.co/total-confirmados';
  const parsedRoleId = Number(roleId);
  const parsedLiderId = Number(liderId);

  if (parsedRoleId === 5 && Number.isFinite(parsedLiderId) && parsedLiderId > 0) {
    return `${baseUrl}/${parsedLiderId}`;
  }

  return baseUrl;
}

function extractConfirmadosRawList(data: any): any[] {
  return (
    (Array.isArray(data) && data) ||
    (Array.isArray(data?.votantes) && data.votantes) ||
    (Array.isArray(data?.confirmados) && data.confirmados) ||
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.data?.votantes) && data.data.votantes) ||
    (Array.isArray(data?.data?.confirmados) && data.data.confirmados) ||
    []
  );
}

function hasLeaderScopeKeys(items: any[]): boolean {
  return items.some((item) => item?.lidere_id !== undefined || item?.lider_id !== undefined);
}

function isRowFromLeader(item: any, leaderId: number): boolean {
  const lidereId = Number(item?.lidere_id ?? item?.lider_id);
  return lidereId === leaderId;
}

export function SeguimientoScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [puestos, setPuestos] = useState<SeguimientoRow[]>([]);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [liderId, setLiderId] = useState<number | null>(null);
  const [currentDpto, setCurrentDpto] = useState<number>(-1);
  const [currentMcpio, setCurrentMcpio] = useState<number>(-1);
  const [historialFiltros, setHistorialFiltros] = useState<HistorialFiltro[]>([]);
  const [showConfirmadosModal, setShowConfirmadosModal] = useState(false);
  const [confirmadosLoading, setConfirmadosLoading] = useState(false);
  const [confirmadosError, setConfirmadosError] = useState('');
  const [confirmadosSearch, setConfirmadosSearch] = useState('');
  const [confirmadosRows, setConfirmadosRows] = useState<ConfirmadoRow[]>([]);
  const [totalConfirmadosApi, setTotalConfirmadosApi] = useState(0);

  const nivelTabla: 'departamento' | 'municipio' | 'puesto' = useMemo(() => {
    if (currentDpto === -1 && currentMcpio === -1) {
      return 'departamento';
    }

    if (currentDpto !== -1 && currentMcpio === -1) {
      return 'municipio';
    }

    return 'puesto';
  }, [currentDpto, currentMcpio]);

  const encabezadoUbicacion =
    nivelTabla === 'departamento' ? 'Departamento' : nivelTabla === 'municipio' ? 'Municipio' : 'Nombre puesto';

  const filtroLiderId = roleId === 5 ? liderId : null;

  const filteredConfirmados = useMemo(() => {
    const term = confirmadosSearch.trim().toLowerCase();
    if (!term) {
      return confirmadosRows;
    }

    return confirmadosRows.filter((item) => {
      const cedula = String(item.cedula ?? '').toLowerCase();
      const nombres = String(item.nombres ?? '').toLowerCase();
      return cedula.includes(term) || nombres.includes(term);
    });
  }, [confirmadosRows, confirmadosSearch]);

  async function abrirReporte(tipo: 'esperados' | 'confirmados' | 'faltantes', item: SeguimientoRow) {
    if (roleId === null) {
      return;
    }

    const url = buildReporteUrl({
      tipo,
      currentDpto,
      currentMcpio,
      item,
      roleId,
      liderId,
    });

    if (!url) {
      setError('No fue posible generar el enlace del reporte para este puesto.');
      return;
    }

    try {
      await Linking.openURL(url);
    } catch {
      setError('No fue posible abrir el reporte en este dispositivo.');
    }
  }

  useEffect(() => {
    bootstrapSession();
  }, []);

  useEffect(() => {
    if (roleId === null) {
      return;
    }

    getPuestos();

    const timer = setInterval(() => {
      getPuestos(false);
    }, 300000);

    return () => clearInterval(timer);
  }, [roleId, liderId, currentDpto, currentMcpio]);

  async function bootstrapSession() {
    const session = await sessionStorage.getSession();
    const corporacionId = session?.corporacionId ?? null;
    const departamentoId = session?.departamentoId ?? null;
    const municipioId = session?.municipioId ?? null;

    let initialDpto = -1;
    let initialMcpio = -1;

    if (corporacionId === 3 || corporacionId === 2) {
      initialDpto = -1;
      initialMcpio = -1;
    } else if (corporacionId === 1 || corporacionId === 6 || corporacionId === 7) {
      initialDpto = departamentoId ?? -1;
      initialMcpio = -1;
    } else {
      initialDpto = departamentoId ?? -1;
      initialMcpio = municipioId ?? -1;
    }

    setRoleId(session?.roleId !== undefined && session?.roleId !== null ? Number(session.roleId) : null);
    setLiderId(session?.userId !== undefined && session?.userId !== null ? Number(session.userId) : null);

    if (Number(session?.roleId) === 5 && !Number(session?.userId)) {
      setError('Sesion invalida: role_id 5 sin user.id en sessionStorage. Cierra sesion e inicia de nuevo.');
    }

    setCurrentDpto(initialDpto);
    setCurrentMcpio(initialMcpio);
    setLoading(false);
  }

  async function getSessionRoleAndUser(): Promise<{ roleId: number | null; userId: number | null }> {
    const session = await sessionStorage.getSession();
    const sessionRoleId = session?.roleId !== undefined && session?.roleId !== null ? Number(session.roleId) : null;
    const sessionUserId = session?.userId !== undefined && session?.userId !== null ? Number(session.userId) : null;
    return {
      roleId: Number.isFinite(Number(sessionRoleId)) ? Number(sessionRoleId) : null,
      userId: Number.isFinite(Number(sessionUserId)) ? Number(sessionUserId) : null,
    };
  }

  async function getPuestos(showLoader = true) {
    if (showLoader) {
      setRefreshing(true);
    }

    try {
      setError('');

      if (roleId === 5 && !liderId) {
        setPuestos([]);
        setTotalConfirmadosApi(0);
        setError('Sesion invalida: role_id 5 requiere user.id para consultar confirmados.');
        return;
      }

      const data = await getPuestosDivipoles({
        dpto: currentDpto,
        mcpio: currentMcpio,
        liderId: filtroLiderId,
      });

      setPuestos(data);
      const fallbackTotal = data.reduce((acc, item) => acc + toSafeNumber(item.confirmados, 0), 0);
      await loadTotalConfirmados(fallbackTotal);
    } catch (e: any) {
      setError(e?.message ?? 'No fue posible cargar el seguimiento.');
    } finally {
      if (showLoader) {
        setRefreshing(false);
      }
    }
  }

  function accionPrimeraColumna(item: SeguimientoRow) {
    if (nivelTabla === 'departamento') {
      const dpto = obtenerDptoItem(item);
      if (dpto !== null) {
        setHistorialFiltros((prev) => [...prev, { dpto: currentDpto, mcpio: currentMcpio }]);
        setCurrentDpto(dpto);
        setCurrentMcpio(-1);
      }
      return;
    }

    if (nivelTabla === 'municipio') {
      const dpto = obtenerDptoItem(item) ?? currentDpto;
      const mcpio = obtenerMcpioItem(item);
      if (mcpio !== null) {
        setHistorialFiltros((prev) => [...prev, { dpto: currentDpto, mcpio: currentMcpio }]);
        setCurrentDpto(dpto);
        setCurrentMcpio(mcpio);
      }
    }
  }

  function volverTablaAnterior() {
    if (historialFiltros.length === 0) {
      return;
    }

    const last = historialFiltros[historialFiltros.length - 1];
    setHistorialFiltros((prev) => prev.slice(0, -1));
    setCurrentDpto(last.dpto);
    setCurrentMcpio(last.mcpio);
  }

  function normalizeConfirmadosResponse(data: any): ConfirmadoRow[] {
    const rawList = extractConfirmadosRawList(data);

    return rawList.map((item: any) => ({
      cedula: String(item?.cedula ?? ''),
      nombres: String(item?.nombres ?? item?.nombre ?? ''),
      nombre_puesto: String(item?.nombre_puesto ?? item?.puesto ?? ''),
      created_at: String(item?.created_at ?? item?.fecha ?? ''),
    }));
  }

  function parseTotalConfirmados(data: any): number | null {
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return parseTotalConfirmados(JSON.parse(trimmed));
        } catch {
          // keep parsing with fallback logic below
        }
      }
    }

    const list = extractConfirmadosRawList(data);

    if (Array.isArray(list) && list.length > 0) {
      return list.length;
    }

    const raw =
      data?.total_confirmados ??
      data?.total ??
      data?.confirmados ??
      data?.data?.total_confirmados ??
      data?.data?.total ??
      (typeof data === 'number' || typeof data === 'string' ? data : null);

    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    return null;
  }

  async function loadTotalConfirmados(fallbackValue: number) {
    try {
      const sessionContext = await getSessionRoleAndUser();
      const effectiveRoleId = sessionContext.roleId ?? roleId;
      const effectiveUserId = sessionContext.userId ?? liderId;

      if (effectiveRoleId === 5 && !effectiveUserId) {
        setTotalConfirmadosApi(0);
        return;
      }

      const url = buildTotalConfirmadosUrl(effectiveRoleId, effectiveUserId);
      const { data } = await axios.get(url, {
        timeout: 30000,
        params: effectiveRoleId === 5 ? { opcion: 1 } : undefined,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      });

      if (effectiveRoleId === 5 && effectiveUserId) {
        const rawList = extractConfirmadosRawList(data);
        if (rawList.length > 0 && hasLeaderScopeKeys(rawList)) {
          const leaderScopedCount = rawList.filter((item) => isRowFromLeader(item, effectiveUserId)).length;
          setTotalConfirmadosApi(leaderScopedCount);
          return;
        }
      }

      const parsedTotal = parseTotalConfirmados(data);
      setTotalConfirmadosApi(parsedTotal ?? fallbackValue);
    } catch {
      setTotalConfirmadosApi(fallbackValue);
    }
  }

  async function loadConfirmados() {
    try {
      setConfirmadosLoading(true);
      setConfirmadosError('');

      const sessionContext = await getSessionRoleAndUser();
      const effectiveRoleId = sessionContext.roleId ?? roleId;
      const effectiveUserId = sessionContext.userId ?? liderId;

      if (effectiveRoleId === 5 && !effectiveUserId) {
        setConfirmadosRows([]);
        setConfirmadosError('Sesion invalida: role_id 5 sin user.id en sessionStorage.');
        return;
      }

      const url = buildTotalConfirmadosUrl(effectiveRoleId, effectiveUserId);
      const { data } = await axios.get(url, {
        timeout: 30000,
        params: effectiveRoleId === 5 ? { opcion: 1 } : undefined,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      });

      const rawList = extractConfirmadosRawList(data);
      if (effectiveRoleId === 5 && effectiveUserId && rawList.length > 0 && hasLeaderScopeKeys(rawList)) {
        const leaderScopedRows = rawList.filter((item) => isRowFromLeader(item, effectiveUserId));
        setConfirmadosRows(normalizeConfirmadosResponse(leaderScopedRows));
      } else {
        setConfirmadosRows(normalizeConfirmadosResponse(data));
      }
    } catch (e: any) {
      setConfirmadosRows([]);
      setConfirmadosError(e?.message ?? 'No fue posible consultar confirmados.');
    } finally {
      setConfirmadosLoading(false);
    }
  }

  async function openConfirmadosModal() {
    setShowConfirmadosModal(true);
    setConfirmadosSearch('');
    await loadConfirmados();
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1f3a59" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => getPuestos(true)} />}
    >
      <Text style={styles.title}>Seguimiento</Text>

      {historialFiltros.length > 0 && (
        <TouchableOpacity style={styles.backButton} onPress={volverTablaAnterior}>
          <Text style={styles.backButtonText}>Volver a la tabla anterior</Text>
        </TouchableOpacity>
      )}

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.tableCard}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerCell, styles.ubicacionCol]}>{encabezadoUbicacion}</Text>
          <Text style={[styles.headerCell, styles.metricCol]}>Esperados</Text>
          <Text style={[styles.headerCell, styles.metricCol]}>Confirmados</Text>
          <Text style={[styles.headerCell, styles.metricCol]}>Faltantes</Text>
        </View>

        {puestos.map((item, index) => {
          const esperados = toSafeNumber(item.esperados, 0);
          const confirmados = toSafeNumber(item.confirmados, 0);
          const faltantes = faltantesFila(item);

          return (
            <View key={`${index}-${nombreUbicacion(item, nivelTabla)}`} style={styles.dataRow}>
              <View style={[styles.cell, styles.ubicacionCol]}>
                {nivelTabla === 'puesto' ? (
                  <Text style={styles.cellText}>{`${index + 1} - ${nombreUbicacion(item, nivelTabla)}`}</Text>
                ) : (
                  <TouchableOpacity onPress={() => accionPrimeraColumna(item)}>
                    <Text style={[styles.cellText, styles.linkText]}>{`${index + 1} - ${nombreUbicacion(item, nivelTabla)}`}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.cell, styles.metricCol, styles.metricCell]}>
                {nivelTabla === 'puesto' ? (
                  <TouchableOpacity onPress={() => abrirReporte('esperados', item)}>
                    <Text style={[styles.cellText, styles.metricText, styles.linkText]}>
                      {Intl.NumberFormat('es-CO').format(esperados)}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.cellText, styles.metricText]}>{Intl.NumberFormat('es-CO').format(esperados)}</Text>
                )}
              </View>

              <View style={[styles.cell, styles.metricCol, styles.metricCell]}>
                {nivelTabla === 'puesto' ? (
                  <TouchableOpacity onPress={() => abrirReporte('confirmados', item)}>
                    <Text style={[styles.cellText, styles.metricText, styles.linkText]}>
                      {Intl.NumberFormat('es-CO').format(confirmados)}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.cellText, styles.metricText]}>{Intl.NumberFormat('es-CO').format(confirmados)}</Text>
                )}
              </View>

              <View style={[styles.cell, styles.metricCol, styles.metricCell]}>
                {nivelTabla === 'puesto' ? (
                  <TouchableOpacity onPress={() => abrirReporte('faltantes', item)}>
                    <Text style={[styles.cellText, styles.metricText, styles.linkText]}>
                      {Intl.NumberFormat('es-CO').format(faltantes)}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.cellText, styles.metricText]}>{Intl.NumberFormat('es-CO').format(faltantes)}</Text>
                )}
              </View>
            </View>
          );
        })}

        {puestos.length === 0 && !refreshing && <Text style={styles.emptyText}>Sin resultados para el filtro actual.</Text>}
      </View>

      <TouchableOpacity style={styles.summaryCard} onPress={openConfirmadosModal}>
        <Text style={styles.summaryTitle}>Confirmados</Text>
        <Text style={styles.summaryValue}>{Intl.NumberFormat('es-CO').format(totalConfirmadosApi)}</Text>
      </TouchableOpacity>

      <Modal
        visible={showConfirmadosModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmadosModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmadosModalCard}>
            <Text style={styles.modalTitle}>Confirmados</Text>

            <TextInput
              value={confirmadosSearch}
              onChangeText={setConfirmadosSearch}
              placeholder="Filtrar por cédula o nombres"
              style={styles.confirmadosSearchInput}
            />

            {confirmadosLoading ? (
              <View style={styles.confirmadosLoadingBox}>
                <ActivityIndicator color="#1f3a59" />
              </View>
            ) : (
              <ScrollView style={styles.confirmadosTableWrapper}>
                <View style={styles.confirmadosHeaderRow}>
                  <Text style={[styles.confirmadosHeaderCell, styles.cedulaCol]}>Cédula</Text>
                  <Text style={[styles.confirmadosHeaderCell, styles.nombreCol]}>Nombres</Text>
                  <Text style={[styles.confirmadosHeaderCell, styles.puestoCol]}>Puesto</Text>
                  <Text style={[styles.confirmadosHeaderCell, styles.fechaCol]}>Fecha</Text>
                </View>

                {filteredConfirmados.map((item, index) => (
                  <View key={`${item.cedula}-${index}`} style={styles.confirmadosDataRow}>
                    <Text style={[styles.confirmadosCell, styles.cedulaCol]}>{item.cedula}</Text>
                    <Text style={[styles.confirmadosCell, styles.nombreCol]}>{item.nombres}</Text>
                    <Text style={[styles.confirmadosCell, styles.puestoCol]}>{item.nombre_puesto}</Text>
                    <Text style={[styles.confirmadosCell, styles.fechaCol]}>{item.created_at}</Text>
                  </View>
                ))}

                {!confirmadosError && filteredConfirmados.length === 0 && (
                  <Text style={styles.confirmadosEmptyText}>No hay datos para mostrar.</Text>
                )}
              </ScrollView>
            )}

            {!!confirmadosError && <Text style={styles.errorText}>{confirmadosError}</Text>}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.modalConfirmButton]} onPress={loadConfirmados}>
                <Text style={styles.modalConfirmButtonText}>Recargar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowConfirmadosModal(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6f7fb',
  },
  container: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f3a59',
    marginBottom: 10,
    textAlign: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1f3a59',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
    backgroundColor: '#ffffff',
  },
  backButtonText: {
    color: '#1f3a59',
    fontWeight: '600',
  },
  errorText: {
    color: '#b00020',
    marginBottom: 10,
  },
  tableCard: {
    borderWidth: 1,
    borderColor: '#aeb6c2',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#ecf0f4',
    borderBottomWidth: 1,
    borderBottomColor: '#c7cfda',
  },
  headerCell: {
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 8,
    paddingHorizontal: 6,
    color: '#1a1f2a',
    textAlign: 'center',
  },
  ubicacionCol: {
    flex: 2.6,
    textAlign: 'left',
  },
  metricCol: {
    flex: 1,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e7ef',
  },
  cell: {
    paddingVertical: 7,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  metricCell: {
    alignItems: 'center',
  },
  cellText: {
    color: '#111827',
    fontSize: 12,
    lineHeight: 16,
  },
  metricText: {
    textAlign: 'center',
  },
  linkText: {
    color: '#1d62d1',
    textDecorationLine: 'underline',
  },
  emptyText: {
    padding: 12,
    textAlign: 'center',
    color: '#5d6673',
  },
  summaryCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d5dce7',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  summaryTitle: {
    fontSize: 16,
    color: '#2f3a4a',
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 34,
    color: '#1f8f4f',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  confirmadosModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#d7dce3',
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f3a59',
    marginBottom: 10,
  },
  confirmadosSearchInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6dce5',
    backgroundColor: '#f9fbff',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  confirmadosLoadingBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  confirmadosTableWrapper: {
    maxHeight: 420,
    borderWidth: 1,
    borderColor: '#d8dee8',
    borderRadius: 8,
  },
  confirmadosHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#ecf0f4',
    borderBottomWidth: 1,
    borderBottomColor: '#c7cfda',
  },
  confirmadosHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 8,
    paddingHorizontal: 6,
    color: '#1a1f2a',
  },
  confirmadosDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  confirmadosCell: {
    fontSize: 12,
    color: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  cedulaCol: {
    flex: 1,
  },
  nombreCol: {
    flex: 1.7,
  },
  puestoCol: {
    flex: 1.7,
  },
  fechaCol: {
    flex: 1.4,
  },
  confirmadosEmptyText: {
    textAlign: 'center',
    color: '#5d6673',
    paddingVertical: 10,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#1f3a59',
  },
  modalCancelButtonText: {
    color: '#1f3a59',
    fontWeight: '700',
  },
  modalConfirmButton: {
    backgroundColor: '#1e66d8',
  },
  modalConfirmButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
