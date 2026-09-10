export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  token?: string | { plainTextToken?: string; accessToken?: { token?: string } };
  access_token?: string;
  plainTextToken?: string;
  message?: string;
  status?: string;
  candidato_id?: number | string;
  role_id?: number | string;
  corporacion_id?: number | string;
  user?: {
    id: number;
    role_id?: number | string;
    candidato_id?: number | string;
    corporacion_id?: number | string;
    candidato?: {
      corporacione_id?: number | string;
      corporacion_id?: number | string;
    };
    name?: string;
    usuario?: string;
  };
}

export interface LoginResult {
  token: string;
  userId: number | null;
  username?: string | null;
  displayName?: string | null;
  roleId: number | null;
  candidatoId: number | null;
  corporacionId: number | null;
  departamentoId: number | null;
  municipioId: number | null;
}
