export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
};

export type SpotifyPlayback = {
  title: string;
  artist: string;
  album: string;
  progress_ms: number;
  duration_ms: number;
  is_playing: boolean;
};

const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const redirectUri = "http://127.0.0.1:5173/callback";
const scopes = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state"
];

const authEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const playbackEndpoint = "https://api.spotify.com/v1/me/player/currently-playing";
const playerEndpoint = "https://api.spotify.com/v1/me/player";

const tokenStorageKey = "floatlyrics.spotify.tokens";
const verifierStorageKey = "floatlyrics.spotify.code_verifier";
const stateStorageKey = "floatlyrics.spotify.state";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

type SpotifyPlaybackResponse = {
  is_playing?: boolean;
  progress_ms?: number | null;
  item?: {
    name?: string;
    duration_ms?: number;
    album?: {
      name?: string;
    };
    artists?: Array<{
      name?: string;
    }>;
  } | null;
};

export function hasSpotifyClientId() {
  return Boolean(clientId);
}

export function getStoredTokens(): SpotifyTokens | null {
  const rawTokens = localStorage.getItem(tokenStorageKey);
  if (!rawTokens) return null;

  try {
    const tokens = JSON.parse(rawTokens) as SpotifyTokens;
    const grantedScopes = tokens.scope?.split(" ") ?? [];
    const hasAllScopes = scopes.every((scope) => grantedScopes.includes(scope));

    if (!hasAllScopes) {
      localStorage.removeItem(tokenStorageKey);
      return null;
    }

    return tokens;
  } catch {
    localStorage.removeItem(tokenStorageKey);
    return null;
  }
}

export function clearSpotifyTokens() {
  localStorage.removeItem(tokenStorageKey);
}

export async function startSpotifyLogin() {
  if (!clientId) {
    throw new Error("Missing VITE_SPOTIFY_CLIENT_ID.");
  }

  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(24);

  localStorage.setItem(verifierStorageKey, codeVerifier);
  localStorage.setItem(stateStorageKey, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state
  });

  const authUrl = `${authEndpoint}?${params.toString()}`;

  if (window.floatLyrics?.openSpotifyAuthWindow) {
    await window.floatLyrics.openSpotifyAuthWindow(authUrl);
    return;
  }

  const popup = window.open(
    authUrl,
    "floatlyrics-spotify-login",
    "popup=yes,width=520,height=760,resizable=yes,scrollbars=yes"
  );

  if (!popup) {
    throw new Error("Spotify login popup was blocked.");
  }
}

export async function exchangeCallbackForTokens(currentUrl = window.location.href) {
  if (!clientId) {
    throw new Error("Missing VITE_SPOTIFY_CLIENT_ID.");
  }

  const url = new URL(currentUrl);
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(`Spotify login failed: ${error}`);
  }

  const code = url.searchParams.get("code");
  if (!code) return null;

  const returnedState = url.searchParams.get("state");
  const savedState = localStorage.getItem(stateStorageKey);
  if (!returnedState || returnedState !== savedState) {
    throw new Error("Spotify login state did not match.");
  }

  const codeVerifier = localStorage.getItem(verifierStorageKey);
  if (!codeVerifier) {
    throw new Error("Missing Spotify PKCE code verifier.");
  }

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });

  if (!response.ok) {
    throw new Error("Could not exchange Spotify authorization code.");
  }

  const tokenResponse = (await response.json()) as TokenResponse;
  localStorage.removeItem(verifierStorageKey);
  localStorage.removeItem(stateStorageKey);

  return saveTokenResponse(tokenResponse);
}

export async function getCurrentPlayback() {
  return fetchCurrentPlayback(false);
}

export async function pauseSpotifyPlayback() {
  await sendPlaybackCommand("PUT", `${playerEndpoint}/pause`, false);
}

export async function resumeSpotifyPlayback() {
  await sendPlaybackCommand("PUT", `${playerEndpoint}/play`, false);
}

export async function skipSpotifyPlayback() {
  await sendPlaybackCommand("POST", `${playerEndpoint}/next`, false);
}

export async function previousSpotifyPlayback() {
  await sendPlaybackCommand("POST", `${playerEndpoint}/previous`, false);
}

async function fetchCurrentPlayback(hasRetried: boolean): Promise<SpotifyPlayback | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;

  const response = await fetch(playbackEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 204) {
    return null;
  }

  if (response.status === 401 && !hasRetried) {
    await refreshSpotifyToken();
    return fetchCurrentPlayback(true);
  }

  if (!response.ok) {
    throw new Error(`Spotify playback request failed (${response.status}).`);
  }

  const data = (await response.json()) as SpotifyPlaybackResponse;
  if (!data.item) return null;

  return {
    title: data.item.name ?? "Unknown title",
    artist:
      data.item.artists
        ?.map((artist) => artist.name)
        .filter(Boolean)
        .join(", ") || "Unknown artist",
    album: data.item.album?.name ?? "Unknown album",
    progress_ms: data.progress_ms ?? 0,
    duration_ms: data.item.duration_ms ?? 0,
    is_playing: Boolean(data.is_playing)
  };
}

async function sendPlaybackCommand(method: "PUT" | "POST", url: string, hasRetried: boolean) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401 && !hasRetried) {
    await refreshSpotifyToken();
    return sendPlaybackCommand(method, url, true);
  }

  if (response.status === 403) {
    clearSpotifyTokens();
    throw new Error("Reconnect Spotify to allow playback controls.");
  }

  if (!response.ok && response.status !== 204) {
    throw new Error(`Spotify control failed (${response.status}).`);
  }
}

async function getValidAccessToken() {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  if (Date.now() < tokens.expiresAt - 30_000) {
    return tokens.accessToken;
  }

  const refreshedTokens = await refreshSpotifyToken();
  return refreshedTokens.accessToken;
}

async function refreshSpotifyToken() {
  if (!clientId) {
    throw new Error("Missing VITE_SPOTIFY_CLIENT_ID.");
  }

  const storedTokens = getStoredTokens();
  if (!storedTokens?.refreshToken) {
    throw new Error("Missing Spotify refresh token.");
  }

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: storedTokens.refreshToken
    })
  });

  if (!response.ok) {
    clearSpotifyTokens();
    throw new Error("Could not refresh Spotify access token.");
  }

  const tokenResponse = (await response.json()) as TokenResponse;
  return saveTokenResponse(tokenResponse, storedTokens.refreshToken, storedTokens.scope);
}

function saveTokenResponse(
  tokenResponse: TokenResponse,
  fallbackRefreshToken?: string,
  fallbackScope?: string
) {
  const tokens: SpotifyTokens = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? fallbackRefreshToken ?? "",
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
    scope: tokenResponse.scope ?? fallbackScope
  };

  localStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
  return tokens;
}

function generateRandomString(length: number) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(values, (value) => possible[value % possible.length]).join("");
}

async function generateCodeChallenge(codeVerifier: string) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return base64UrlEncode(digest);
}

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
