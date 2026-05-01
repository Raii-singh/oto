// TMDB API Adapter (Fallback)
import axios from 'axios';
import { OTOContent } from '../types';
import { assignPlatform, buildRedirectUrl, FALLBACK_POSTER } from '../utils';

const BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY || '';
const IMG = 'https://image.tmdb.org/t/p';

interface TMDBRaw {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  genre_ids: number[];
  release_date?: string;
  first_air_date?: string;
  original_language: string;
  popularity: number;
  media_type?: string;
}

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 18: 'Drama', 27: 'Horror', 9648: 'Mystery',
  10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 99: 'Documentary',
  10759: 'Action & Adventure', 10765: 'Sci-Fi & Fantasy',
};

const transform = (item: TMDBRaw, mediaType: 'movie' | 'tv' = 'movie'): OTOContent => {
  const title = item.title || item.name || 'Unknown';
  const id = String(item.id);
  const platform = assignPlatform(id);
  return {
    id,
    title,
    type: mediaType === 'tv' ? 'Series' : 'Movie',
    platform,
    genres: (item.genre_ids || []).map(gid => GENRE_MAP[gid]).filter(Boolean).slice(0, 3),
    rating: Math.round((item.vote_average || 0) * 10) / 10,
    year: (item.release_date || item.first_air_date || '').slice(0, 4),
    language: item.original_language?.toUpperCase() || 'EN',
    description: item.overview || '',
    poster: item.poster_path ? `${IMG}/w500${item.poster_path}` : FALLBACK_POSTER,
    backdrop: item.backdrop_path ? `${IMG}/original${item.backdrop_path}` : `${IMG}/w1280${item.poster_path}`,
    redirectUrl: buildRedirectUrl(platform, title),
    featured: (item.vote_average || 0) >= 7.5 && (item.popularity || 0) > 100,
  };
};

export const tmdb = {
  available: () => !!KEY,

  async trending(): Promise<OTOContent[]> {
    if (!KEY) return [];
    const [m, tv] = await Promise.all([
      axios.get(`${BASE}/trending/movie/week?api_key=${KEY}`).catch(() => ({ data: { results: [] } })),
      axios.get(`${BASE}/trending/tv/week?api_key=${KEY}`).catch(() => ({ data: { results: [] } })),
    ]);
    return [
      ...(m.data.results || []).slice(0, 10).map((r: TMDBRaw) => transform(r, 'movie')),
      ...(tv.data.results || []).slice(0, 10).map((r: TMDBRaw) => transform(r, 'tv')),
    ].sort((a, b) => b.rating - a.rating);
  },

  async search(query: string): Promise<OTOContent[]> {
    if (!KEY) return [];
    const { data } = await axios.get(`${BASE}/search/multi?api_key=${KEY}&query=${encodeURIComponent(query)}`);
    return (data.results || [])
      .filter((r: TMDBRaw & { media_type?: string }) => r.media_type !== 'person' && r.poster_path)
      .slice(0, 10)
      .map((r: TMDBRaw & { media_type?: string }) => transform(r, r.media_type === 'tv' ? 'tv' : 'movie'));
  },

  async getById(id: string): Promise<OTOContent | null> {
    if (!KEY) return null;
    try {
      const { data } = await axios.get(`${BASE}/movie/${id}?api_key=${KEY}`);
      data.genre_ids = (data.genres || []).map((g: { id: number }) => g.id);
      return transform(data, 'movie');
    } catch {
      try {
        const { data } = await axios.get(`${BASE}/tv/${id}?api_key=${KEY}`);
        data.genre_ids = (data.genres || []).map((g: { id: number }) => g.id);
        return transform(data, 'tv');
      } catch { return null; }
    }
  },
};
