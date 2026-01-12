const ACCESS_TOKEN_KEY = "presence360_tenant_access_token";
const REFRESH_TOKEN_KEY = "presence360_tenant_refresh_token";

let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;

export function getAccessToken(): string | null {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  if (typeof window === "undefined") {
    return null;
  }
  cachedAccessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  return cachedAccessToken;
}

export function setAccessToken(token: string | null) {
  cachedAccessToken = token;
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

export function getRefreshToken(): string | null {
  if (cachedRefreshToken) {
    return cachedRefreshToken;
  }
  if (typeof window === "undefined") {
    return null;
  }
  cachedRefreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  return cachedRefreshToken;
}

export function setRefreshToken(token: string | null) {
  cachedRefreshToken = token;
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function clearSession() {
  setAccessToken(null);
  setRefreshToken(null);
}
