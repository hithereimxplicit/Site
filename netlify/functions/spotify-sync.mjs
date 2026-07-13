import { fetchSpotifySnapshot, writeSpotifyCache } from "../lib/spotify.mjs";

export default async () => {
  try {
    const snapshot = await fetchSpotifySnapshot();
    await writeSpotifyCache(snapshot);
    console.log(`Spotify widget synced at ${snapshot.updatedAt}`);
  } catch (error) {
    console.error("Scheduled Spotify sync failed:", error.message);
    throw error;
  }
};
