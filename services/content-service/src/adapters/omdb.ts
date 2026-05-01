// OMDb API Adapter (Primary)
import axios from 'axios';
import { OTOContent } from '../types';
import { assignPlatform, buildRedirectUrl, FALLBACK_POSTER, FALLBACK_BACKDROP } from '../utils';

const BASE = process.env.OMDB_BASE_URL || 'http://www.omdbapi.com';
const KEY = process.env.OMDB_API_KEY || '';

// Popular title pools for trending (OMDb has no trending endpoint)
const TRENDING_TITLES = [
  'Inception', 'The Dark Knight', 'Interstellar', 'Parasite', 'Oppenheimer',
  'Dune', 'The Godfather', 'Pulp Fiction', 'The Matrix', 'Avengers Endgame',
  'RRR', 'Mirzapur', 'Sacred Games', 'Scam 1992', 'Panchayat',
  'Breaking Bad', 'Stranger Things', 'Money Heist', 'Squid Game', 'The Bear',
  'Peaky Blinders', 'Wednesday', '12th Fail', 'Laapataa Ladies', 'Animal',
];

interface OMDbItem {
  imdbID: string;
  Title: string;
  Year: string;
  Type: string;
  Genre: string;
  Plot: string;
  Poster: string;
  imdbRating: string;
  Language: string;
  Response: string;
  Error?: string;
}

const transform = (item: OMDbItem): OTOContent | null => {
  if (item.Response === 'False' || !item.imdbID) return null;
  const platform = assignPlatform(item.imdbID);
  return {
    id: item.imdbID,
    imdbId: item.imdbID,
    title: item.Title,
    type: item.Type === 'series' ? 'Series' : 'Movie',
    platform,
    genres: (item.Genre || 'Drama').split(', ').filter(Boolean).slice(0, 3),
    rating: parseFloat(item.imdbRating) || 0,
    year: (item.Year || '').slice(0, 4),
    language: item.Language?.split(',')[0]?.trim() || 'English',
    description: item.Plot !== 'N/A' ? item.Plot : '',
    poster: item.Poster !== 'N/A' ? item.Poster : FALLBACK_POSTER,
    backdrop: FALLBACK_BACKDROP, // OMDb doesn't provide backdrops
    redirectUrl: buildRedirectUrl(platform, item.Title),
    featured: parseFloat(item.imdbRating) >= 7.5,
  };
};

export const omdb = {
  // Fetch a single title by name
  async getByTitle(title: string): Promise<OTOContent | null> {
    try {
      const { data } = await axios.get<OMDbItem>(BASE, {
        params: { apikey: KEY, t: title, plot: 'short' },
        timeout: 5000,
      });
      return transform(data);
    } catch { return null; }
  },

  // Fetch by IMDb ID
  async getById(imdbId: string): Promise<OTOContent | null> {
    try {
      const { data } = await axios.get<OMDbItem>(BASE, {
        params: { apikey: KEY, i: imdbId, plot: 'full' },
        timeout: 5000,
      });
      return transform(data);
    } catch { return null; }
  },

  // Search OMDb
  async search(query: string): Promise<OTOContent[]> {
    try {
      const { data } = await axios.get<{ Search?: { imdbID: string; Title: string; Year: string; Type: string; Poster: string }[]; Response: string }>(BASE, {
        params: { apikey: KEY, s: query, type: '' },
        timeout: 5000,
      });
      if (!data.Search) return [];
      // Fetch details for top 5 results (OMDb search only gives basic info)
      const details = await Promise.all(
        data.Search.slice(0, 8).map(r => omdb.getById(r.imdbID))
      );
      return details.filter(Boolean) as OTOContent[];
    } catch { return []; }
  },

  // Trending = fetch popular titles in parallel
  async trending(): Promise<OTOContent[]> {
    const titles = TRENDING_TITLES.slice(0, 12);
    const results = await Promise.allSettled(titles.map(t => omdb.getByTitle(t)));
    return results
      .filter((r): r is PromiseFulfilledResult<OTOContent | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(Boolean) as OTOContent[];
  },
};
