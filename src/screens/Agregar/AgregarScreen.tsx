import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  construirPayloadAsistencia,
  consultarPersonaParaRegistro,
  getLideres,
  agregarPersona,
  type LiderOption,
  type PersonaConsultaData,
  type VotanteRegistradoResult,
  verificarAsistenciaPorCedula,
  verificarVotanteRegistrado,
} from '../../services/consultarService';
import { sessionStorage } from '../../storage/sessionStorage';

type PersonaSource = 'listadovotantes' | 'externa' | null;

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveApiErrorMessage(error: any, fallback: string): string {
  const responseMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    (typeof error?.response?.data === 'string' ? error.response.data : null);

  if (typeof responseMessage === 'string' && responseMessage.trim().length > 0) {
    return responseMessage;
  }

  const status = error?.response?.status;
  if (status === 500) {
    return `${fallback} (Error interno del servidor).`;
  }

  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function isCedulaNoRegistradaMessage(message: string): boolean {
  const normalized = normalizeSearchText(message);
  return (
    normalized.includes('no se encontro lugar de votacion') ||
    normalized.includes('no se encontro') ||
    normalized.includes('no registrada') ||
    normalized.includes('no registrado') ||
    normalized.includes('sin registros')
  );
}

export function AgregarScreen() {
  const formContainerRef = useRef<View>(null);
  const formScrollRef = useRef<ScrollView>(null);
  const focusedInput = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const keyboardTop = useRef<number | null>(null);
  const scrollOffset = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  function scrollToFocusedInput() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const input = focusedInput.current;
      if (!input || input !== TextInput.State.currentlyFocusedInput()) return;

      formScrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, viewportY, _width, viewportHeight) => {
        input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
          if (input !== TextInput.State.currentlyFocusedInput()) return;
          // Compare actual window coordinates after the keyboard changes the layout.
          const visibleBottom = Math.min(
            viewportY + viewportHeight,
            keyboardTop.current ?? Infinity,
          ) - 24;
          const overflow = inputY + inputHeight - visibleBottom;
          const aboveViewport = inputY - viewportY - 16;
          const adjustment = overflow > 0 ? overflow : Math.min(aboveViewport, 0);
          if (adjustment !== 0) {
            formScrollRef.current?.scrollTo({
              y: Math.max(0, scrollOffset.current + adjustment),
              animated: true,
            });
          }
        });
      });
    });
  }

  function updateKeyboardInset() {
    formContainerRef.current?.measureInWindow((_x, y, _width, height) => {
      // Android may already resize the window; only reserve the remaining overlap.
      setKeyboardInset(keyboardTop.current === null ? 0 : Math.max(0, y + height - keyboardTop.current));
      scrollToFocusedInput();
    });
  }

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      updateKeyboardInset();
    });
    const frameSubscription = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      updateKeyboardInset();
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setKeyboardInset(0);
    });
    return () => {
      showSubscription.remove();
      frameSubscription.remove();
      hideSubscription.remove();
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    };
  }, []);

  const [cedula, setCedula] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [persona, setPersona] = useState<PersonaConsultaData | null>(null);
  const [registroExistente, setRegistroExistente] = useState<VotanteRegistradoResult | null>(null);
  const [showRegistroExistenteModal, setShowRegistroExistenteModal] = useState(false);
  const [personaSource, setPersonaSource] = useState<PersonaSource>(null);
  const [lideres, setLideres] = useState<LiderOption[]>([]);
  const [selectedLiderId, setSelectedLiderId] = useState<number | null>(null);
  const [bloquearSeleccionLider, setBloquearSeleccionLider] = useState(false);
  const [asistenciaExistente, setAsistenciaExistente] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showLiderModal, setShowLiderModal] = useState(false);
  const [showGeneralLideres, setShowGeneralLideres] = useState(false);
  const [liderSearch, setLiderSearch] = useState('');
  const [observacion, setObservacion] = useState('');


  const hasResultOrMessage = Boolean(persona || error || infoMessage || asistenciaExistente);

  const liderSeleccionado = useMemo(
    () => lideres.find((item) => item.value === selectedLiderId) ?? null,
    [lideres, selectedLiderId],
  );

  const filteredLideres = useMemo(() => {
    const search = normalizeSearchText(liderSearch);
    if (!search) {
      return lideres;
    }

    return lideres.filter((item) => normalizeSearchText(item.text).includes(search));
  }, [lideres, liderSearch]);

  function clearResultState() {
    setPersona(null);
    setRegistroExistente(null);
    setShowRegistroExistenteModal(false);
    setPersonaSource(null);
    setError('');
    setInfoMessage('');
    setSuccessMessage('');
    setLideres([]);
    setSelectedLiderId(null);
    setBloquearSeleccionLider(false);
    setAsistenciaExistente(false);
    setShowConfirmModal(false);
    setShowLiderModal(false);
    setShowGeneralLideres(false);
    setLiderSearch('');
    setObservacion('');
  }

  function handleSelectLider(liderId: number) {
    setSelectedLiderId(liderId);
    setShowLiderModal(false);
    setLiderSearch('');
  }

  function handleNuevaConsulta() {
    Keyboard.dismiss();
    setCedula('');
    clearResultState();
  }

  async function handleConsultar() {
    Keyboard.dismiss();
    setSuccessMessage('');

    if (!cedula.trim()) {
      setError('Ingrese una cédula para consultar.');
      return;
    }

    try {
      setLoading(true);
      clearResultState();
      const warnings: string[] = [];

      const session = await sessionStorage.getSession();
      if (!session?.candidatoId || !session?.corporacionId) {
        throw new Error('La sesión no tiene candidato/corporación. Cierra sesión e inicia nuevamente.');
      }

      // try {
      //   const asistencia = await verificarAsistenciaPorCedula(cedula.trim());
      //   if (asistencia.exists) {
      //     setAsistenciaExistente(true);
      //     setInfoMessage(asistencia.message);
      //     return;
      //   }
      // } catch (asistenciaError: any) {
      //   warnings.push('No fue posible validar asistencia en este momento. Continuamos con la consulta.');
      // }

      let lideresDisponibles: LiderOption[] = [];
      try {
        lideresDisponibles = await getLideres(session.candidatoId);
        setLideres(lideresDisponibles);
      } catch {
        warnings.push('No fue posible cargar líderes en este momento.');
      }

      try {
        const votanteRegistrado = await verificarVotanteRegistrado({
          cedula: cedula.trim(),
          candidatoId: session.candidatoId,
          corporacionId: session.corporacionId,
        });

        if (votanteRegistrado.found) {
          setRegistroExistente({
            ...votanteRegistrado,
            liderNombre: votanteRegistrado.liderNombre ||
              lideresDisponibles.find((lider) => lider.value === votanteRegistrado.lidereId)?.text || '',
          });
          setShowRegistroExistenteModal(true);
          setInfoMessage('Esta persona ya fue registrada. No se permite guardarla nuevamente.');
          return;
        }
      } catch {
        warnings.push('No fue posible validar listadovotantes en este momento. Se consultará fuente externa.');
      }

      try {
        const consultaExterna = await consultarPersonaParaRegistro(cedula.trim());
        setPersona(consultaExterna);
        setPersonaSource('externa');
        const successMessage = 'Consulta encontrada. Seleccione un líder y diligencie los campos vacios.';
        setInfoMessage(warnings.length > 0 ? `${warnings.join(' ')} ${successMessage}` : successMessage);
      } catch (externalError: any) {
        const externalMessage = resolveApiErrorMessage(externalError, 'No fue posible consultar la cédula.');
        if (!isCedulaNoRegistradaMessage(externalMessage)) {
          throw externalError;
        }

        setPersona(null);
        setPersonaSource(null);
        setShowGeneralLideres(true);

        const noRegistroMessage =
          'La cédula no está registrada en la base de datos. Puede seleccionar un líder del listado general.';
        setInfoMessage(warnings.length > 0 ? `${warnings.join(' ')} ${noRegistroMessage}` : noRegistroMessage);
      }

      if (session.roleId === 5 && session.userId) {
        const liderPropio = lideresDisponibles.some((item) => item.value === session.userId);

        if (liderPropio) {
          // Se sugiere el lider propio, pero se mantiene editable para elegir del listado completo.
          setSelectedLiderId((prev) => prev ?? session.userId);
          setBloquearSeleccionLider(false);
        }
      }
    } catch (e: any) {
      const message = resolveApiErrorMessage(e, 'No fue posible realizar la consulta.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenRegistroModal() {
    Keyboard.dismiss();

    if (registroExistente?.found) {
      setShowRegistroExistenteModal(true);
      return;
    }

    if (!persona) {
      setError('Primero consulte una cédula.');
      return;
    }

    if (!selectedLiderId) {
      setError('Debe seleccionar un líder para registrar la persona.');
      return;
    }

    setError('');
    setShowConfirmModal(true);
  }

  async function handleConfirmarAgregar() {
    if (registroExistente?.found) {
      setShowConfirmModal(false);
      setShowRegistroExistenteModal(true);
      return;
    }

    if (!persona || !selectedLiderId) {
      setShowConfirmModal(false);
      setError('No hay datos completos para registrar la persona.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = construirPayloadAsistencia({
        persona,
        lidereId: selectedLiderId,
        observacion: observacion.trim() || undefined,
        observacioneId: personaSource === 'listadovotantes' ? 4 : 1,
      });

      await agregarPersona(payload);
      handleNuevaConsulta();
      setSuccessMessage('Persona registrada exitosamente.');
      formScrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (e: any) {
      setError(resolveApiErrorMessage(e, 'No fue posible registrar la persona.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View
      ref={formContainerRef}
      style={[styles.container, { paddingBottom: keyboardInset }]}
      onLayout={updateKeyboardInset}
    >
      <ScrollView
        ref={formScrollRef}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onLayout={scrollToFocusedInput}
        onContentSizeChange={scrollToFocusedInput}
        onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        <Text style={styles.title}>AGREGAR</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Cédula</Text>
          <TextInput
            value={cedula}
            onChangeText={(value) => setCedula(value.replace(/[^0-9]/g, ''))}
            placeholder="Ingresa número de cédula"
            keyboardType="number-pad"
            style={[styles.input, !cedula && styles.inputPlaceholder]}
            onFocus={() => {
              focusedInput.current = TextInput.State.currentlyFocusedInput();
              scrollToFocusedInput();
            }}
          />

          <TouchableOpacity onPress={handleConsultar} style={styles.button} disabled={loading || saving}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>CONSULTAR</Text>
            )}
          </TouchableOpacity>

          {hasResultOrMessage && (
            <TouchableOpacity
              onPress={handleNuevaConsulta}
              style={[styles.button, styles.secondaryButton]}
              disabled={loading || saving}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>NUEVA CONSULTA</Text>
            </TouchableOpacity>
          )}

          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {!!infoMessage && <Text style={styles.noResultsText}>{infoMessage}</Text>}
          {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}
          {registroExistente?.found && (
            <TouchableOpacity
              onPress={() => setShowRegistroExistenteModal(true)}
              style={[styles.button, styles.secondaryButton]}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>VER REGISTRO EXISTENTE</Text>
            </TouchableOpacity>
          )}

          {showGeneralLideres && (
            <View style={styles.generalLeadersCard}>
              <Text style={styles.generalLeadersTitle}>Listado general de lideres</Text>

              {lideres.length === 0 ? (
                <Text style={styles.noLeaderText}>No hay lideres disponibles para este candidato.</Text>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      setLiderSearch('');
                      setShowLiderModal(true);
                    }}
                    style={styles.liderSelectorButton}
                    disabled={saving || loading}
                  >
                    <Text style={styles.liderSelectorText}>{liderSeleccionado?.text || 'Seleccionar lider'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.liderSelectorHint}>Lideres disponibles: {lideres.length}</Text>
                </>
              )}
            </View>
          )}

          {persona && !registroExistente?.found && (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Censo</Text>

              {/* <Text style={styles.resultLine}>
                <Text style={styles.resultKey}>Nombres: </Text>
                {persona.nombres}
              </Text>

              <Text style={styles.resultLine}>
                <Text style={styles.resultKey}>Apellidos: </Text>
                {persona.apellidos}
              </Text> */}

              <Text style={styles.resultLine}>
                <Text style={styles.resultKey}>Departamento: </Text>
                {persona.departamento}
              </Text>

              <Text style={styles.resultLine}>
                <Text style={styles.resultKey}>Municipio: </Text>
                {persona.municipio}
              </Text>

              <Text style={styles.resultLine}>
                <Text style={styles.resultKey}>Puesto: </Text>
                {persona.puesto}
              </Text>

              <Text style={styles.resultLine}>
                <Text style={styles.resultKey}>Mesa: </Text>
                {persona.mesa}
              </Text>

              <Text style={[styles.resultLine, styles.liderLabel]}>Líder</Text>

              {bloquearSeleccionLider && liderSeleccionado ? (
                <View style={styles.lockedLeaderBox}>
                  <Text style={styles.lockedLeaderText}>{liderSeleccionado.text}</Text>
                </View>
              ) : (
                <View style={styles.liderSelectorWrapper}>
                  {lideres.length === 0 ? (
                    <Text style={styles.noLeaderText}>No hay líderes disponibles para este candidato.</Text>
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={() => {
                          setLiderSearch('');
                          setShowLiderModal(true);
                        }}
                        style={styles.liderSelectorButton}
                        disabled={saving || loading}
                      >
                        <Text style={styles.liderSelectorText}>{liderSeleccionado?.text || 'Seleccionar líder'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.liderSelectorHint}>Líderes disponibles: {lideres.length}</Text>
                    </>
                  )}
                </View>
              )}

              <Text style={styles.modalObservationLabel}>Nombres</Text>
              <TextInput
                value={persona.nombres}
                onChangeText={(value) => setPersona((prev) => prev ? { ...prev, nombres: value } : prev)}
                placeholder="Ingrese los nombres"
                style={[styles.input, !persona.nombres && styles.inputPlaceholder]}
                onFocus={() => {
                  focusedInput.current = TextInput.State.currentlyFocusedInput();
                  scrollToFocusedInput();
                }}
                editable={!saving}
              />

              <Text style={styles.modalObservationLabel}>Apellidos</Text>
              <TextInput
                value={persona.apellidos}
                onChangeText={(value) => setPersona((prev) => prev ? { ...prev, apellidos: value } : prev)}
                placeholder="Ingrese los apellidos"
                style={[styles.input, !persona.apellidos && styles.inputPlaceholder]}
                onFocus={() => {
                  focusedInput.current = TextInput.State.currentlyFocusedInput();
                  scrollToFocusedInput();
                }}
                editable={!saving}
              />

              <Text style={styles.modalObservationLabel}>Dirección</Text>
              <TextInput
                value={persona.direccion}
                onChangeText={(value) => setPersona((prev) => prev ? { ...prev, direccion: value } : prev)}
                placeholder="Ingrese la dirección"
                style={[styles.input, !persona.direccion && styles.inputPlaceholder]}
                onFocus={() => {
                  focusedInput.current = TextInput.State.currentlyFocusedInput();
                  scrollToFocusedInput();
                }}
                editable={!saving}
              />

              <Text style={styles.modalObservationLabel}>Telefono</Text>
              <TextInput
                value={persona.telefono}
                onChangeText={(value) => setPersona((prev) => prev ? { ...prev, telefono: value } : prev)}
                keyboardType="number-pad"
                placeholder="Ingrese el numero de telefono"
                style={[styles.input, !persona.telefono && styles.inputPlaceholder]}
                onFocus={() => {
                  focusedInput.current = TextInput.State.currentlyFocusedInput();
                  scrollToFocusedInput();
                }}
                editable={!saving}
              />

              {!asistenciaExistente && (
                <TouchableOpacity
                  onPress={handleOpenRegistroModal}
                  style={[styles.button, styles.saveButton]}
                  disabled={saving || loading}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>GUARDAR</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <Modal
          visible={showRegistroExistenteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRegistroExistenteModal(false)}
        >
          <View style={styles.modalOverlay}>
            <ScrollView
              style={styles.confirmModalScroll}
              contentContainerStyle={styles.modalCard}
            >
              <Text style={styles.modalTitle}>Persona ya registrada</Text>
              <Text style={styles.noResultsText}>
                La consulta encontró un registro existente. No se permite guardar nuevamente esta persona.
              </Text>
              {[
                ['Cédula', registroExistente?.persona?.cedula],
                ['Nombres', registroExistente?.persona?.nombres],
                ['Apellidos', registroExistente?.persona?.apellidos],
                ['Fecha de registro', registroExistente?.createdAt],
                ['Líder asignado', registroExistente?.liderNombre ||
                  (registroExistente?.lidereId ? `Líder ${registroExistente.lidereId}` : '')],
                ['Dirección', registroExistente?.persona?.direccion],
                ['Teléfono', registroExistente?.persona?.telefono],
                ['Departamento', registroExistente?.persona?.departamento],
                ['Municipio', registroExistente?.persona?.municipio],
                ['Puesto de votación', registroExistente?.persona?.puesto],
                ['Mesa', registroExistente?.persona?.mesa],
                ['Zona', registroExistente?.persona?.zona],
                ['Comuna', registroExistente?.persona?.comuna],
                ['Fecha de nacimiento', registroExistente?.persona?.fechaNacimiento],
                ['Estado', registroExistente?.persona?.descEstado],
              ].map(([label, value]) => (
                <Text key={label} style={styles.modalLine}>
                  <Text style={styles.modalKey}>{label}: </Text>
                  {value && value !== 'N/D' ? value : 'No informado'}
                </Text>
              ))}
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  onPress={() => setShowRegistroExistenteModal(false)}
                  style={[styles.modalButton, styles.modalCancelButton]}
                >
                  <Text style={styles.modalCancelButtonText}>Cerrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleNuevaConsulta}
                  style={[styles.modalButton, styles.modalConfirmButton]}
                >
                  <Text style={styles.modalConfirmButtonText}>Nueva consulta</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>

        <Modal
          visible={showConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowConfirmModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              style={styles.confirmModalScroll}
              contentContainerStyle={styles.modalCard}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Confirmar registro</Text>

              <Text style={styles.modalLine}>
                <Text style={styles.modalKey}>Cédula: </Text>
                {persona?.cedula ?? 'N/D'}
              </Text>
              <Text style={styles.modalLine}>
                <Text style={styles.modalKey}>Nombre: </Text>
                {persona ? `${persona.nombres} ${persona.apellidos}`.trim() : 'N/D'}
              </Text>
              <Text style={styles.modalLine}>
                <Text style={styles.modalKey}>Departamento/Municipio: </Text>
                {persona ? `${persona.departamento} / ${persona.municipio}` : 'N/D'}
              </Text>
              <Text style={styles.modalLine}>
                <Text style={styles.modalKey}>Puesto/Mesa: </Text>
                {persona ? `${persona.puesto} / ${persona.mesa}` : 'N/D'}
              </Text>
              <Text style={styles.modalLine}>
                <Text style={styles.modalKey}>Líder: </Text>
                {liderSeleccionado?.text ?? 'N/D'}
              </Text>

              <Text style={styles.modalObservationLabel}>Observación (opcional)</Text>
              <TextInput
                value={observacion}
                onChangeText={setObservacion}
                placeholder="Ingrese una observación para el registro"
                multiline
                style={[styles.modalObservationInput, !observacion && styles.observationPlaceholder]}
                editable={!saving}
              />

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  onPress={() => setShowConfirmModal(false)}
                  style={[styles.modalButton, styles.modalCancelButton]}
                  disabled={saving}
                >
                  <Text style={styles.modalCancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirmarAgregar}
                  style={[styles.modalButton, styles.modalConfirmButton]}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.modalConfirmButtonText}>Confirmar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={showLiderModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLiderModal(false)}
        >
          <KeyboardAvoidingView
            style={[styles.modalOverlay, styles.liderModalOverlay]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[styles.modalCard, styles.liderModalCard]}>
              <Text style={styles.modalTitle}>Seleccionar líder</Text>

              <TextInput
                value={liderSearch}
                onChangeText={setLiderSearch}
                placeholder="Buscar líder por nombre"
                style={[styles.liderSearchInput, !liderSearch && styles.inputPlaceholder]}
                autoCapitalize="words"
              />

              <ScrollView
                style={styles.liderModalList}
                contentContainerStyle={styles.liderModalListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {filteredLideres.map((lider) => {
                  const isSelected = lider.value === selectedLiderId;

                  return (
                    <TouchableOpacity
                      key={lider.value}
                      onPress={() => handleSelectLider(lider.value)}
                      style={[styles.leaderItem, isSelected && styles.leaderItemSelected]}
                    >
                      <Text style={[styles.leaderItemText, isSelected && styles.leaderItemTextSelected]}>{lider.text}</Text>
                    </TouchableOpacity>
                  );
                })}

                {filteredLideres.length === 0 && (
                  <Text style={styles.noLeaderInModal}>No hay líderes que coincidan con la búsqueda.</Text>
                )}
              </ScrollView>

              <TouchableOpacity
                onPress={() => {
                  setShowLiderModal(false);
                  setLiderSearch('');
                }}
                style={[styles.modalButton, styles.modalCancelButton, styles.liderModalCloseButton]}
              >
                <Text style={styles.modalCancelButtonText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f7fb',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1f3a59',
    marginBottom: 18,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7dce3',
    padding: 18,
  },
  label: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1f2a',
    marginBottom: 8,
  },
  inputPlaceholder: {
    fontSize: 16,
  },
  observationPlaceholder: {
    fontSize: 14,
  },
  confirmModalScroll: {
    flexGrow: 0,
    maxHeight: '100%',
  },
  input: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d6d0ad',
    backgroundColor: '#ece8b8',
    paddingHorizontal: 14,
    fontSize: 28,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#1f3a59',
  },
  secondaryButtonText: {
    color: '#1f3a59',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    color: '#b00020',
    fontSize: 16,
    marginTop: 10,
  },
  successText: {
    color: '#155724',
    backgroundColor: '#d4edda',
    borderWidth: 1,
    borderColor: '#c3e6cb',
    borderRadius: 8,
    fontSize: 16,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  noResultsText: {
    color: '#915f00',
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffe69c',
    borderRadius: 8,
    fontSize: 16,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  resultCard: {
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dce3',
    backgroundColor: '#f8fbff',
    padding: 14,
  },
  generalLeadersCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dce3',
    backgroundColor: '#f8fbff',
    padding: 12,
  },
  generalLeadersTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f3a59',
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1e66d8',
    marginBottom: 12,
  },
  resultLine: {
    fontSize: 18,
    color: '#101828',
    marginBottom: 8,
  },
  resultKey: {
    fontWeight: '700',
  },
  liderLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontWeight: '700',
  },
  liderSelectorWrapper: {
    borderWidth: 1,
    borderColor: '#d7dce3',
    borderRadius: 10,
    padding: 8,
  },
  liderSelectorButton: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f0f4f9',
  },
  liderSelectorText: {
    color: '#16212f',
    fontSize: 16,
    fontWeight: '600',
  },
  liderSelectorHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#5d6673',
  },
  leaderItem: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f0f4f9',
    marginBottom: 6,
  },
  leaderItemSelected: {
    backgroundColor: '#1e66d8',
  },
  leaderItemText: {
    color: '#16212f',
    fontSize: 16,
    fontWeight: '600',
  },
  leaderItemTextSelected: {
    color: '#ffffff',
  },
  noLeaderText: {
    color: '#915f00',
    fontSize: 14,
  },
  lockedLeaderBox: {
    backgroundColor: '#edf5ff',
    borderColor: '#8fb5ed',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  lockedLeaderText: {
    color: '#154286',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButton: {
    marginTop: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d7dce3',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f3a59',
    marginBottom: 10,
  },
  modalLine: {
    fontSize: 15,
    color: '#101828',
    marginBottom: 6,
  },
  modalKey: {
    fontWeight: '700',
  },
  modalObservationLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#1f3a59',
  },
  modalObservationInput: {
    minHeight: 78,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6dce5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    textAlignVertical: 'top',
    backgroundColor: '#f9fbff',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 8,
  },
  modalButton: {
    flex: 1,
    height: 46,
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
    fontSize: 15,
  },
  modalConfirmButton: {
    backgroundColor: '#1e66d8',
  },
  modalConfirmButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  liderModalList: {
    maxHeight: 280,
    flexShrink: 1,
    marginBottom: 10,
  },
  liderModalListContent: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  liderModalOverlay: {
    paddingVertical: 32,
  },
  liderModalCard: {
    maxHeight: '100%',
    flexShrink: 1,
  },
  liderSearchInput: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6dce5',
    backgroundColor: '#f9fbff',
    paddingHorizontal: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  noLeaderInModal: {
    fontSize: 14,
    color: '#5d6673',
    textAlign: 'center',
    paddingVertical: 12,
  },
  liderModalCloseButton: {
    width: '100%',
    flex: 0,
  },
});
