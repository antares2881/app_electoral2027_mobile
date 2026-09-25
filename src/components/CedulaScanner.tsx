import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import {
  type CedulaOrigen,
  type CedulaResultado,
  parseCedulaAmarilla,
  parseCedulaDigitalMRZ,
} from '../utils/cedulaParser';

/**
 * OCR en el dispositivo (Apple Vision en iOS / ML Kit en Android) mediante
 * `expo-text-extractor`. Es un módulo nativo: NO existe dentro de Expo Go,
 * solo en un development build o en la app compilada con EAS.
 */
type TextExtractor = {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
};

let textExtractor: TextExtractor | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-text-extractor') as TextExtractor;
  textExtractor = mod?.isSupported ? mod : null;
} catch {
  textExtractor = null;
}

export const ocrDisponible = textExtractor !== null;

interface Props {
  visible: boolean;
  /** 'amarilla' = código PDF417 del reverso | 'digital' = zona MRZ (<<<) del reverso */
  modo: CedulaOrigen;
  onDetectado: (resultado: CedulaResultado) => void;
  onCerrar: () => void;
}

export function CedulaScanner({ visible, modo, onDetectado, onCerrar }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const camaraRef = useRef<CameraView>(null);
  // Refs a los callbacks para que el ciclo automático use siempre la versión actual
  const onDetectadoRef = useRef(onDetectado);
  const onCerrarRef = useRef(onCerrar);
  onDetectadoRef.current = onDetectado;
  onCerrarRef.current = onCerrar;
  const bloqueado = useRef(false);
  const ultimoAviso = useRef(0);
  const [camaraLista, setCamaraLista] = useState(false);
  const autoActivo = useRef(false);
  const ocupado = useRef(false);
  const lecturaPrevia = useRef<string | null>(null);

  const esDigitalAuto = visible && modo === 'digital' && !!permiso?.granted && textExtractor !== null;

  /* ---------- Cédula digital: lectura AUTOMÁTICA de la MRZ ----------
   * Cada ~1,2 s toma una foto silenciosa, la pasa por OCR y busca las líneas <<<.
   * Acepta el número si el dígito de control de la MRZ lo confirma, o si sale
   * igual en dos lecturas seguidas.
   */
  useEffect(() => {
    if (!esDigitalAuto || !camaraLista) return;
    autoActivo.current = true;
    lecturaPrevia.current = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const ciclo = async () => {
      if (!autoActivo.current) return;
      if (!ocupado.current && !bloqueado.current && textExtractor) {
        ocupado.current = true;
        try {
          const foto = await camaraRef.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
          if (foto?.uri && autoActivo.current) {
            const lineas = await textExtractor.extractTextFromImage(foto.uri);
            const r = parseCedulaDigitalMRZ(lineas.join('\n'));
            if (r && autoActivo.current) {
              if (r.verificado || lecturaPrevia.current === r.numero) {
                autoActivo.current = false;
                entregar(r);
                return;
              }
              lecturaPrevia.current = r.numero;
            }
          }
        } catch {
          // se reintenta en el siguiente ciclo
        } finally {
          ocupado.current = false;
        }
      }
      if (autoActivo.current) temporizador = setTimeout(ciclo, 1200);
    };

    temporizador = setTimeout(ciclo, 800);
    return () => {
      autoActivo.current = false;
      if (temporizador) clearTimeout(temporizador);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esDigitalAuto, camaraLista]);

  useEffect(() => {
    if (!visible) setCamaraLista(false);
  }, [visible]);

  function cerrar() {
    autoActivo.current = false;
    bloqueado.current = false;
    setMensaje(null);
    setProcesando(false);
    onCerrar();
  }

  function entregar(resultado: CedulaResultado) {
    bloqueado.current = true;
    setMensaje(null);
    setProcesando(false);
    onDetectadoRef.current(resultado);
    onCerrarRef.current();
    // se libera al volver a abrir el escáner
    setTimeout(() => {
      bloqueado.current = false;
    }, 800);
  }

  /* ---------- Cédula amarilla: lectura automática del PDF417 ---------- */
  function alEscanear(r: BarcodeScanningResult) {
    if (bloqueado.current) return;
    const resultado = parseCedulaAmarilla(r.data ?? '') ?? parseCedulaAmarilla(r.raw ?? '');
    if (resultado) {
      entregar(resultado);
      return;
    }
    // Evita re-renderizar en cada fotograma
    const ahora = Date.now();
    if (ahora - ultimoAviso.current > 1500) {
      ultimoAviso.current = ahora;
      setMensaje('Se leyó un código, pero no corresponde a una cédula. Enfoca el código del reverso.');
    }
  }

  /* ---------- Cédula digital: foto + OCR de la zona MRZ ---------- */
  async function capturarMRZ() {
    if (!textExtractor) {
      setMensaje(
        'La lectura de la cédula digital no está disponible en Expo Go. Usa la app compilada (development build) o digita el número.',
      );
      return;
    }
    try {
      setProcesando(true);
      setMensaje(null);
      const foto = await camaraRef.current?.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!foto?.uri) throw new Error('No se obtuvo la foto.');
      const lineas = await textExtractor.extractTextFromImage(foto.uri);
      const resultado = parseCedulaDigitalMRZ(lineas.join('\n'));
      if (resultado) {
        entregar(resultado);
      } else {
        setMensaje('No se pudo leer la zona inferior (<<<). Acerca la cámara, con buena luz y sin reflejos.');
      }
    } catch {
      setMensaje('Error al procesar la imagen. Intenta de nuevo.');
    } finally {
      setProcesando(false);
    }
  }

  const esAmarilla = modo === 'amarilla';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <View style={styles.contenedor}>
        {!permiso ? (
          <ActivityIndicator style={styles.flex} color="#ffffff" />
        ) : !permiso.granted ? (
          <View style={styles.centro}>
            <Text style={styles.textoClaro}>Se necesita permiso para usar la cámara.</Text>
            <Pressable style={styles.boton} onPress={pedirPermiso}>
              <Text style={styles.textoBoton}>DAR PERMISO</Text>
            </Pressable>
            <Pressable style={[styles.boton, styles.botonSecundario]} onPress={cerrar}>
              <Text style={styles.textoBoton}>CANCELAR</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {visible && (
              <CameraView
                ref={camaraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                autofocus="on"
                barcodeScannerSettings={esAmarilla ? { barcodeTypes: ['pdf417'] } : undefined}
                onBarcodeScanned={esAmarilla ? alEscanear : undefined}
                onCameraReady={() => setCamaraLista(true)}
              />
            )}

            <View style={styles.overlay} pointerEvents="none">
              <Text style={styles.titulo}>{esAmarilla ? 'Cédula amarilla' : 'Cédula digital'}</Text>
              <View style={esAmarilla ? styles.marcoPdf417 : styles.marcoMRZ} />
              <Text style={styles.textoClaro}>
                {esAmarilla
                  ? 'Enfoca el código de barras del REVERSO dentro del recuadro.'
                  : esDigitalAuto
                    ? 'Enfoca las 3 líneas con «<<<» de la parte inferior del REVERSO. Se leerá automáticamente.'
                    : 'Enfoca las 3 líneas con «<<<» de la parte inferior del REVERSO y toca CAPTURAR.'}
              </Text>
              {esDigitalAuto && !mensaje && (
                <View style={styles.buscando}>
                  <ActivityIndicator color="#ffffff" />
                  <Text style={styles.textoClaro}>Buscando…</Text>
                </View>
              )}
              {!!mensaje && <Text style={styles.error}>{mensaje}</Text>}
            </View>

            <View style={styles.acciones}>
              {!esAmarilla && !esDigitalAuto && (
                <Pressable
                  style={styles.boton}
                  onPress={capturarMRZ}
                  disabled={procesando}
                >
                  {procesando ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.textoBoton}>CAPTURAR</Text>
                  )}
                </Pressable>
              )}
              <Pressable style={[styles.boton, styles.botonSecundario]} onPress={cerrar}>
                <Text style={styles.textoBoton}>CANCELAR</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenedor: { flex: 1, backgroundColor: '#000000' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  titulo: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
  marcoPdf417: { width: '92%', aspectRatio: 3.2, borderWidth: 3, borderColor: '#28a745', borderRadius: 12 },
  marcoMRZ: { width: '95%', aspectRatio: 4, borderWidth: 3, borderColor: '#1e66d8', borderRadius: 12 },
  buscando: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textoClaro: { color: '#ffffff', textAlign: 'center', fontSize: 16 },
  error: {
    color: '#ffffff',
    backgroundColor: 'rgba(176, 0, 32, 0.9)',
    padding: 10,
    borderRadius: 8,
    textAlign: 'center',
    overflow: 'hidden',
  },
  acciones: { position: 'absolute', bottom: 40, left: 24, right: 24, gap: 12 },
  boton: {
    backgroundColor: '#28a745',
    height: 52,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSecundario: { backgroundColor: '#1f3a59' },
  textoBoton: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
});
