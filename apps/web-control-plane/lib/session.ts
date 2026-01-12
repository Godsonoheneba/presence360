const ACCESS_TOKEN_KEY = "presence360_control_access_token";

let cachedAccessToken: string | null = null;

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

export function clearSession() {
  setAccessToken(null);
}
