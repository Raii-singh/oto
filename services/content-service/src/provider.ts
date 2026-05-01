// Content Provider — selects OMDb or TMDB based on config
// Switch by setting CONTENT_API_PROVIDER=omdb or tmdb in .env
import { omdb } from './adapters/omdb';
import { tmdb } from './adapters/tmdb';
import { OTOContent } from './types';

const provider = process.env.CONTENT_API_PROVIDER || 'omdb';

export const contentProvider = {
  async trending(): Promise<OTOContent[]> {
    if (provider === 'tmdb' && tmdb.available()) {
      return tmdb.trending();
    }
    // OMDb primary — fallback to TMDB if OMDb returns nothing
    const results = await omdb.trending();
    if (!results.length && tmdb.available()) return tmdb.trending();
    return results;
  },

  async search(query: string): Promise<OTOContent[]> {
    if (provider === 'tmdb' && tmdb.available()) {
      return tmdb.search(query);
    }
    const results = await omdb.search(query);
    if (!results.length && tmdb.available()) return tmdb.search(query);
    return results;
  },

  async getById(id: string): Promise<OTOContent | null> {
    // IMDb IDs start with 'tt' → always use OMDb
    if (id.startsWith('tt')) {
      const r = await omdb.getById(id);
      if (r) return r;
    }
    // Numeric ID → try TMDB
    if (tmdb.available()) return tmdb.getById(id);
    return null;
  },

  currentProvider: () => provider,
};
