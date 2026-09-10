import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_SESSION_KEY = 'auth_session';

export interface AuthSession {
  userId: number | null;
  username?: string | null;
  displayName?: string | null;
  roleId: number | null;
  candidatoId: number | null;
  corporacionId: number | null;
  departamentoId: number | null;
  municipioId: number | null;
  token: string;
}

export const sessionStorage = {
  async getSession(): Promise<AuthSession | null> {
    const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AuthSession;
    } catch {
      await AsyncStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
  },

  async setSession(session: AuthSession): Promise<void> {
    await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  },

  async clearSession(): Promise<void> {
    await AsyncStorage.removeItem(AUTH_SESSION_KEY);
  },
};
