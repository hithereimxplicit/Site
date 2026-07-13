const http = require("http");
const { exec } = require("child_process");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI = "http://127.0.0.1:8888/callback";

const SCOPES = [
  "user-read-currently-playing",
  "user-read-recently-played",
  "user-read-playback-state"
].join(" ");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET."
  );
  process.exit(1);
}

const authorizationUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    show_dialog: "true"
  }).toString();

function openBrowser(url) {
  const platform = process.platform;

  const command =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  exec(command);
}

async function exchangeCode(code) {
  const credentials = Buffer.from(
    `${CLIENT_ID}:${CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description ||
      data.error ||
      "Token exchange failed"
    );
  }

  return data;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(
    request.url,
    "http://127.0.0.1:8888"
  );

  if (url.pathname !== "/callback") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) {
    response.writeHead(400, {
      "Content-Type": "text/plain"
    });

    response.end(`Spotify authorization failed: ${error}`);
    server.close();
    return;
  }

  if (!code) {
    response.writeHead(400, {
      "Content-Type": "text/plain"
    });

    response.end("No authorization code received.");
    return;
  }

  try {
    const tokens = await exchangeCode(code);

    console.log("\nSpotify connected successfully.\n");

    console.log("Refresh token:\n");
    console.log(tokens.refresh_token);

    console.log("\nAdd this to your environment variables:\n");
    console.log(
      `SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`
    );

    response.writeHead(200, {
      "Content-Type": "text/html"
    });

    response.end(`
      <!DOCTYPE html>
      <html>
        <body
          style="
            margin:0;
            min-height:100vh;
            display:grid;
            place-items:center;
            background:#050505;
            color:#fff;
            font-family:Arial,sans-serif;
          "
        >
          <div style="text-align:center">
            <h1>Spotify connected</h1>
            <p>Return to Terminal to copy your refresh token.</p>
          </div>
        </body>
      </html>
    `);
  } catch (tokenError) {
    console.error(tokenError);

    response.writeHead(500, {
      "Content-Type": "text/plain"
    });

    response.end(`Token exchange failed: ${tokenError.message}`);
  } finally {
    server.close();
  }
});

server.listen(8888, "127.0.0.1", () => {
  console.log(
    "Opening Spotify authorization in your browser..."
  );

  openBrowser(authorizationUrl);
});