const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

async function getAccessToken() {
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

  return tokenData.access_token;
}

function normalizeTrack(item, isPlaying) {
  if (!item) return null;

  const artists = item.type === "episode"
    ? item.show?.publisher || item.show?.name || "Spotify"
    : (item.artists || []).map((artist) => artist.name).join(", ");

  const images = item.type === "episode" ? item.images : item.album?.images;

  return {
    track: item.name || "Unknown track",
    artist: artists || "Spotify",
    albumArt: images?.[0]?.url || null,
    isPlaying,
    url: item.external_urls?.spotify || item.show?.external_urls?.spotify || null,
  };
}

async function spotifyFetch(path, accessToken) {
  return fetch(`https://api.spotify.com/v1${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return response(405, { error: "Method not allowed" });
  }

  try {
    const accessToken = await getAccessToken();
    const currentResponse = await spotifyFetch(
      "/me/player/currently-playing?additional_types=track,episode",
      accessToken,
    );

    if (currentResponse.status === 200) {
      const current = await currentResponse.json();
      const track = normalizeTrack(current.item, Boolean(current.is_playing));
      if (track) return response(200, track);
    } else if (currentResponse.status !== 204) {
      throw new Error(`Spotify currently-playing request failed (${currentResponse.status})`);
    }

    const recentResponse = await spotifyFetch("/me/player/recently-played?limit=1", accessToken);

    if (!recentResponse.ok) {
      throw new Error(`Spotify recently-played request failed (${recentResponse.status})`);
    }

    const recent = await recentResponse.json();
    const track = normalizeTrack(recent.items?.[0]?.track, false);

    return response(200, track || {
      track: "Nothing playing",
      artist: "Spotify",
      albumArt: null,
      isPlaying: false,
      url: null,
    });
  } catch (error) {
    console.error("Spotify API error:", error.message);
    return response(502, { error: error.message });
  }
};
