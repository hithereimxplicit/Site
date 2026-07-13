import { createClient } from "@supabase/supabase-js";

let cachedAccessToken = null;
let accessTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt) {
    return cachedAccessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Spotify environment variables");
  }

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    const reason = tokenData.error === "invalid_grant"
      ? "Spotify authorization expired; reconnect the account"
      : "Unable to refresh Spotify access token";
    throw new Error(reason);
  }

  cachedAccessToken = tokenData.access_token;
  accessTokenExpiresAt = Date.now() + Math.max(0, (tokenData.expires_in || 3600) - 60) * 1000;
  return cachedAccessToken;
}

function normalizeTrack(item, isPlaying, playedAt = null) {
  if (!item) return null;

  const artists = item.type === "episode"
    ? item.show?.publisher || item.show?.name || "Spotify"
    : (item.artists || []).map((artist) => artist.name).join(", ");

  const images = item.type === "episode" ? item.images : item.album?.images;
  const smallestImage = images?.at(-1);

  return {
    id: item.id || item.uri || null,
    track: item.name || "Unknown track",
    artist: artists || "Spotify",
    albumArt: smallestImage?.url || images?.[0]?.url || null,
    isPlaying,
    playedAt,
    url: item.external_urls?.spotify || item.show?.external_urls?.spotify || null,
  };
}

async function spotifyFetch(path, accessToken) {
  return fetch(`https://api.spotify.com/v1${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function fetchSpotifySnapshot() {
  const accessToken = await getAccessToken();
  const [currentResponse, recentResponse] = await Promise.all([
    spotifyFetch(
      "/me/player/currently-playing?additional_types=track,episode",
      accessToken,
    ),
    spotifyFetch("/me/player/recently-played?limit=4", accessToken),
  ]);

  let currentTrack = null;

  if (currentResponse.status === 200) {
    const current = await currentResponse.json();
    currentTrack = normalizeTrack(current.item, Boolean(current.is_playing));
  } else if (currentResponse.status !== 204) {
    throw new Error(`Spotify currently-playing request failed (${currentResponse.status})`);
  }

  if (!recentResponse.ok) {
    throw new Error(`Spotify recently-played request failed (${recentResponse.status})`);
  }

  const recent = await recentResponse.json();
  const recentlyPlayed = (recent.items || [])
    .map((entry) => normalizeTrack(entry.track, false, entry.played_at))
    .filter(Boolean);
  const history = [currentTrack?.isPlaying ? currentTrack : null, ...recentlyPlayed]
    .filter((track, index, tracks) => track && tracks.findIndex((item) => item.id === track.id) === index)
    .slice(0, 3);

  const displayTrack = currentTrack || history[0] || {
    id: null,
    track: "Nothing playing",
    artist: "Spotify",
    albumArt: null,
    isPlaying: false,
    playedAt: null,
    url: null,
  };

  return {
    ...displayTrack,
    current: currentTrack,
    history,
    updatedAt: new Date().toISOString(),
  };
}

function getCacheClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables for Spotify cache");
  }

  return createClient(url, key);
}

function getCacheLocation() {
  return {
    bucket: process.env.SPOTIFY_CACHE_BUCKET || "one-time",
    path: "spotify/widget.json",
  };
}

export async function writeSpotifyCache(snapshot) {
  const supabase = getCacheClient();
  const { bucket, path } = getCacheLocation();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, Buffer.from(JSON.stringify(snapshot)), {
      contentType: "application/json; charset=utf-8",
      cacheControl: "0",
      upsert: true,
    });

  if (error) throw new Error(`Unable to save Spotify cache: ${error.message}`);
}

export async function readSpotifyCache() {
  const supabase = getCacheClient();
  const { bucket, path } = getCacheLocation();
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) throw new Error(`Unable to read Spotify cache: ${error.message}`);
  return JSON.parse(await data.text());
}
