import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = 'auth_token';

export const tokenStorage = {
  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(AUTH_TOKEN_KEY);
  },

  async setToken(token: string): Promise<void> {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  },

  async clearToken(): Promise<void> {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  },
};
