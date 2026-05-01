// Shared content types across all services
export type Platform = 'Netflix' | 'Prime Video' | 'Hotstar' | 'YouTube' | 'Zee5' | 'SonyLIV' | 'JioCinema' | 'MX Player';

export interface OTOContent {
  id: string;
  imdbId?: string;
  title: string;
  type: 'Movie' | 'Series';
  platform: Platform;
  genres: string[];
  rating: number;
  year: string;
  language: string;
  description: string;
  poster: string;
  backdrop: string;
  redirectUrl: string;
  featured: boolean;
}

export interface SearchResult {
  results: OTOContent[];
  total: number;
  page: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  source?: 'cache' | 'omdb' | 'tmdb';
  latency?: number;
}
