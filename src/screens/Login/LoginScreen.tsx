import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface LoginScreenProps {
  onSubmit: (usuario: string, clave: string) => Promise<void>;
}

export function LoginScreen({ onSubmit }: LoginScreenProps) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!usuario.trim() || !clave.trim()) {
      setError('Ingrese usuario y clave.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await onSubmit(usuario.trim(), clave);
    } catch (e: any) {
      const apiMessage = e?.response?.data?.message;
      const isTimeout = e?.code === 'ECONNABORTED' || String(e?.message ?? '').toLowerCase().includes('timeout');

      if (apiMessage) {
        setError(apiMessage);
      } else if (isTimeout) {
        setError('La API tardó demasiado en responder. Verifica URL y estado del servidor.');
      } else {
        setError(e?.message ?? 'No fue posible iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wrapper}
    >
      <View style={styles.card}>
        <Image source={require('../../../assets/icon.png')} style={styles.logo} />

        <Text style={styles.title}>PLATAFORMA ELECTORAL</Text>
        <Text style={styles.subtitle}>Digita tu usuario y clave para ingresar.</Text>

        <Text style={styles.label}>Usuario</Text>
        <TextInput
          value={usuario}
          onChangeText={setUsuario}
          placeholder="Tu usuario"
          style={styles.input}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Clave</Text>
        <TextInput
          value={clave}
          onChangeText={setClave}
          placeholder="********"
          secureTextEntry
          style={styles.input}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>ENTRAR</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#24384d',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 38,
    fontWeight: '700',
    color: '#1f3a59',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 22,
    color: '#6f7985',
    marginBottom: 24,
  },
  label: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#ece8b8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d1d1',
    height: 54,
    paddingHorizontal: 16,
    fontSize: 24,
    marginBottom: 10,
  },
  errorText: {
    color: '#b00020',
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
});
