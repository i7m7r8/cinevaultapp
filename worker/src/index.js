const TMDB_KEY = "4ef0d7355d9ffb5151e987764708ce96";
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Content-Type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

async function tmdb(path) {
  const res = await fetch(`${TMDB}${path}&api_key=${TMDB_KEY}`);
  return res.json();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const q = url.searchParams;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (path === "/trending") {
      const data = await tmdb("/trending/all/week?language=en-US");
      return json(data.results.map(item => ({
        id: item.id,
        title: item.title || item.name,
        type: item.media_type,
        poster: IMG + item.poster_path,
        rating: item.vote_average,
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        overview: item.overview
      })));
    }

    if (path === "/search") {
      const query = q.get("q") || "";
      const data = await tmdb(`/search/multi?query=${encodeURIComponent(query)}&language=en-US`);
      return json(data.results.map(item => ({
        id: item.id,
        title: item.title || item.name,
        type: item.media_type,
        poster: IMG + item.poster_path,
        rating: item.vote_average,
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        overview: item.overview
      })));
    }

    if (path.startsWith("/movie/")) {
      const id = path.split("/")[2];
      const [detail, ext] = await Promise.all([
        tmdb(`/movie/${id}?language=en-US`),
        tmdb(`/movie/${id}/external_ids?`)
      ]);
      return json({
        id: detail.id,
        title: detail.title,
        overview: detail.overview,
        poster: IMG + detail.poster_path,
        backdrop: "https://image.tmdb.org/t/p/w1280" + detail.backdrop_path,
        rating: detail.vote_average,
        year: detail.release_date?.slice(0, 4),
        runtime: detail.runtime,
        genres: detail.genres?.map(g => g.name),
        imdb_id: ext.imdb_id
      });
    }

    if (path.startsWith("/tv/")) {
      const parts = path.split("/");
      const id = parts[2];

      if (parts.length === 3) {
        const [detail, ext] = await Promise.all([
          tmdb(`/tv/${id}?language=en-US`),
          tmdb(`/tv/${id}/external_ids?`)
        ]);
        return json({
          id: detail.id,
          name: detail.name,
          overview: detail.overview,
          poster: IMG + detail.poster_path,
          backdrop: "https://image.tmdb.org/t/p/w1280" + detail.backdrop_path,
          rating: detail.vote_average,
          year: detail.first_air_date?.slice(0, 4),
          genres: detail.genres?.map(g => g.name),
          imdb_id: ext.imdb_id,
          seasons: detail.seasons?.filter(s => s.season_number > 0).map(s => ({
            season_number: s.season_number,
            name: s.name,
            episode_count: s.episode_count,
            poster: IMG + s.poster_path
          }))
        });
      }

      if (parts.length === 4) {
        const season = parts[3];
        const data = await tmdb(`/tv/${id}/season/${season}?language=en-US`);
        return json(data.episodes?.map(ep => ({
          episode_number: ep.episode_number,
          name: ep.name,
          overview: ep.overview,
          still: IMG + ep.still_path,
          runtime: ep.runtime
        })));
      }
    }

    if (path.startsWith("/streams/")) {
      const parts = path.split("/");
      const imdbId = parts[2];
      const season = parts[3];
      const episode = parts[4];
      const streamPath = season ? `series/${imdbId}:${season}:${episode}` : `movie/${imdbId}`;
      const data = await fetch(`https://torrentio.strem.fun/stream/${streamPath}.json`);
      const result = await data.json();
      return json(result.streams || []);
    }

    if (path.startsWith("/subtitles/")) {
      const imdbId = path.split("/")[2].replace("tt", "");
      const lang = q.get("lang") || "eng";
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
    }

    if (path === "/popular/movies") {
      const data = await tmdb("/movie/popular?language=en-US");
      return json(data.results.map(item => ({
        id: item.id,
        title: item.title,
        type: "movie",
        poster: IMG + item.poster_path,
        rating: item.vote_average,
        year: item.release_date?.slice(0, 4)
      })));
    }

    if (path === "/popular/tv") {
      const data = await tmdb("/tv/popular?language=en-US");
      return json(data.results.map(item => ({
        id: item.id,
        title: item.name,
        type: "tv",
        poster: IMG + item.poster_path,
        rating: item.vote_average,
        year: item.first_air_date?.slice(0, 4)
      })));
    }

    return json({ error: "Not found" }, 404);
  }
};
