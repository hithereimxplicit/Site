import {
  fetchSpotifySnapshot,
  readSpotifyCache,
} from "../lib/spotify.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
  pragma: "no-cache",
  expires: "0",
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return response(405, { error: "Method not allowed" });
  }

  try {
    const snapshot = await fetchSpotifySnapshot();
    return response(200, snapshot);
  } catch (spotifyError) {
    console.error("Spotify API error:", spotifyError.message);

    // Preserve the last background-synced state during a temporary Spotify error.
    try {
      return response(200, await readSpotifyCache());
    } catch (cacheError) {
      console.error("Spotify cache read error:", cacheError.message);
      return response(502, { error: spotifyError.message });
    }
  }
};
