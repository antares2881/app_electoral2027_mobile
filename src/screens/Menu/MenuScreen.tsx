import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { sessionStorage } from '../../storage/sessionStorage';

interface MenuScreenProps {
  onGoAgregar: () => void;
  onGoConsultar: () => void;
  onGoSeguimiento: () => void;
  onLogout: () => void;
}

export function MenuScreen({ onGoAgregar, onGoConsultar, onGoSeguimiento, onLogout }: MenuScreenProps) {
  const [usernameLabel, setUsernameLabel] = useState('');

  useEffect(() => {
    loadUserLabel();
  }, []);

  async function loadUserLabel() {
    const session = await sessionStorage.getSession();
    const username = session?.username?.trim();
    const displayName = session?.displayName?.trim();

    if (username) {
      setUsernameLabel(username);
      return;
    }

    if (displayName) {
      setUsernameLabel(displayName);
      return;
    }

    if (session?.userId) {
      setUsernameLabel(`usuario${session.userId}`);
      return;
    }

    setUsernameLabel('usuario');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.welcomeText}>{`Bienvenido ${usernameLabel}`}</Text>

      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Sesion activa</Text>
        <Text style={styles.userName}>{usernameLabel}</Text>
      </View>
      <TouchableOpacity style={styles.buttonPrimary} onPress={onGoAgregar}>
        <Text style={styles.buttonPrimaryText}>AGREGAR</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonPrimary} onPress={onGoConsultar}>
        <Text style={styles.buttonPrimaryText}>CONSULTAR</Text>
      </TouchableOpacity>


      <TouchableOpacity style={styles.buttonPrimary} onPress={onGoSeguimiento}>
        <Text style={styles.buttonPrimaryText}>SEGUIMIENTO</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonSecondary} onPress={onLogout}>
        <Text style={styles.buttonSecondaryText}>CERRAR SESIÓN</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#f6f7fb',
    paddingHorizontal: 24,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  kicker: {
    color: '#5f6b7a',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontWeight: '600',
  },
  userName: {
    color: '#1f3a59',
    fontSize: 18,
    fontWeight: '700',
  },
  welcomeText: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1f3a59',
    marginBottom: 18,
    textAlign: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 14,
  },
  buttonPrimaryText: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  buttonSecondary: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1f3a59',
  },
  buttonSecondaryText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1f3a59',
  },
});
