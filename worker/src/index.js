const TMDB_KEY = "4ef0d7355d9ffb5151e987764708ce96";
const TMDB = "https://api.themoviedb.org/3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
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

    // ── STREAM-PROXY ──────────────────────────────────────────
    // Pipes any video URL with CORS + Range support for Video.js
    if (path === "/stream-proxy") {
      const targetUrl = params.get("url");
      if (!targetUrl || (!targetUrl.startsWith("https://") && !targetUrl.startsWith("http://"))) {
        return json({ error: "invalid url" }, 400);
      }

      const proxyHeaders = new Headers({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*",
      });

      const range = request.headers.get("Range");
      if (range) proxyHeaders.set("Range", range);

      try {
        const upstream = await fetch(targetUrl, {
          headers: proxyHeaders,
          redirect: "follow",
        });

        const respHeaders = new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Type",
          "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
        });

        for (const h of ["content-type","content-length","content-range","accept-ranges","last-modified","etag"]) {
          const v = upstream.headers.get(h);
          if (v) respHeaders.set(h, v);
        }

        return new Response(upstream.body, {
          status: upstream.status,
          headers: respHeaders
        });
      } catch(e) {
        return json({ error: e.message }, 502);
      }
    }

    // ── TORRENT STREAM via proxy ──────────────────────────────
    // GET /torrent-stream/:hash/:fileIdx
    // Fetches streams from Torrentio, finds matching hash, proxies the video
    const torrentMatch = path.match(/^\/torrent-stream\/([0-9a-f]{32,40})(?:\/(\d+))?$/i);
    if (torrentMatch) {
      const hash = torrentMatch[1].toLowerCase();
      const fileIdx = parseInt(torrentMatch[2] || "0");

      // Torrentio direct stream URL format
      const candidates = [
        `https://torrentio.strem.fun/${hash}/${fileIdx}/stream.mp4`,
        `https://torrentio.strem.fun/${hash}/${fileIdx}/video.mp4`,
      ];

      for (const candidate of candidates) {
        try {
          const probe = await fetch(candidate, {
            method: "HEAD",
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (probe.ok) {
            // Proxy it with Range support
            const range = request.headers.get("Range");
            const upHeaders = new Headers({ "User-Agent": "Mozilla/5.0", "Accept": "*/*" });
            if (range) upHeaders.set("Range", range);

            const upstream = await fetch(candidate, { headers: upHeaders });
            const respHeaders = new Headers({
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
              "Accept-Ranges": "bytes",
            });
            for (const h of ["content-type","content-length","content-range","accept-ranges"]) {
              const v = upstream.headers.get(h);
              if (v) respHeaders.set(h, v);
            }
            return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
          }
        } catch {}
      }

      return json({ error: "no_stream" }, 404);
    }

    // ── APIBAY PROXY ─────────────────────────────────────────
    // GET /apibay?q=...&cat=200
    // Proxies apibay.org to avoid browser CORS issues
    if (path === "/apibay") {
      const q = params.get("q") || "";
      const cat = params.get("cat") || "200";
      try {
        const r = await fetch(
          `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=${cat}`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );
        const text = await r.text();
        return new Response(text, {
          headers: { ...cors, "Content-Type": "application/json" }
        });
      } catch(e) {
        return new Response("[]", {
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }
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

    // ── TMDB PROXY ────────────────────────────────────────────
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
