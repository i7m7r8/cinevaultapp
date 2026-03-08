const TMDB_KEY = "4ef0d7355d9ffb5151e987764708ce96";
const TMDB = "https://api.themoviedb.org/3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Content-Type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const params = url.searchParams;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // ── TORRENTIO STREAMS ─────────────────────────────────────
    if (path.startsWith("/streams/")) {
      const parts = path.split("/");
      const imdbId = parts[2];
      const season = parts[3];
      const episode = parts[4];
      const streamPath = season ? `series/${imdbId}:${season}:${episode}` : `movie/${imdbId}`;
      try {
        const res = await fetch(`https://torrentio.strem.fun/stream/${streamPath}.json`);
        const data = await res.json();
        return json(data.streams || []);
      } catch(e) {
        return json([]);
      }
    }

    // ── SUBTITLES ─────────────────────────────────────────────
    if (path.startsWith("/subtitles/")) {
      const imdbId = path.split("/")[2].replace("tt", "");
      const lang = params.get("lang") || "eng";
      try {
        const res = await fetch(
          `https://rest.opensubtitles.org/search/imdbid-${imdbId}/sublanguageid-${lang}`,
          { headers: { "X-User-Agent": "TemporaryUserAgent" } }
        );
        const subs = await res.json();
        return json(subs.map(s => ({
          lang: s.LanguageName,
          url: s.SubDownloadLink,
          format: s.SubFormat,
          name: s.MovieReleaseName
        })));
      } catch(e) {
        return json([]);
      }
    }

    // ── TMDB PROXY — forwards all other paths to TMDB ─────────
    params.set("api_key", TMDB_KEY);
    const tmdbUrl = `${TMDB}${path}?${params.toString()}`;

    try {
      const res = await fetch(tmdbUrl);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: cors
      });
    } catch(e) {
      return json({ error: "Upstream error" }, 502);
    }
  }
};
