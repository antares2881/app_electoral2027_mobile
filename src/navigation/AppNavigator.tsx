import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { loginRequest } from '../services/authService';
import { sessionStorage } from '../storage/sessionStorage';
import { tokenStorage } from '../storage/tokenStorage';
import { ConsultarScreen } from '../screens/Consultar/ConsultarScreen';
import { AgregarScreen } from '../screens/Agregar/AgregarScreen';
import { LoginScreen } from '../screens/Login/LoginScreen';
import { MenuScreen } from '../screens/Menu/MenuScreen';
import { SeguimientoScreen } from '../screens/Seguimiento/SeguimientoScreen';

type RootStackParamList = {
  Login: undefined;
  Menu: undefined;
  Consultar: undefined;
  Agregar: undefined;
  Seguimiento: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    bootstrapAuth();
  }, []);

  async function bootstrapAuth() {
    const token = await tokenStorage.getToken();
    const session = await sessionStorage.getSession();
    const hasRequiredSessionData = Boolean(session?.candidatoId && session?.corporacionId);

    // Migration guard: previous app versions persisted only token.
    // This flow requires session metadata (candidato/corporacion), so force re-login if missing.
    if (token && (!session || !hasRequiredSessionData)) {
      await tokenStorage.clearToken();
      await sessionStorage.clearSession();
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    setIsAuthenticated(Boolean(token && session));
    setLoading(false);
  }

  async function handleLogin(usuario: string, clave: string) {
    const auth = await loginRequest({
      username: usuario,
      password: clave,
    });
    await tokenStorage.setToken(auth.token);
    await sessionStorage.setSession(auth);
    setIsAuthenticated(true);
  }

  async function handleLogout() {
    await tokenStorage.clearToken();
    await sessionStorage.clearSession();
    setIsAuthenticated(false);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1f3a59" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <LoginScreen onSubmit={handleLogin} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Menu" options={{ title: 'Menú' }}>
              {({ navigation }) => (
                <MenuScreen
                  onGoAgregar={() => navigation.navigate('Agregar')}
                  onGoConsultar={() => navigation.navigate('Consultar')}
                  onGoSeguimiento={() => navigation.navigate('Seguimiento')}
                  onLogout={handleLogout}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Agregar" component={AgregarScreen} />
            <Stack.Screen name="Consultar" component={ConsultarScreen} />
            <Stack.Screen name="Seguimiento" component={SeguimientoScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6f7fb',
  },
});
