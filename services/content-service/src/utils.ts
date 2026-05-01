import { OTOContent, Platform } from './types';

const PLATFORMS: Platform[] = ['Netflix', 'Prime Video', 'Hotstar', 'Zee5', 'SonyLIV', 'JioCinema'];

// Deterministic platform assignment (consistent across sessions)
export const assignPlatform = (id: string): Platform => {
  const hash = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return PLATFORMS[hash % PLATFORMS.length];
};

export const buildRedirectUrl = (platform: Platform, title: string): string => {
  const enc = encodeURIComponent(title);
  const map: Record<Platform, string> = {
    'Netflix':     `https://www.netflix.com/search?q=${enc}`,
    'Prime Video': `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${enc}`,
    'Hotstar':     `https://www.hotstar.com/in/search?q=${enc}`,
    'Zee5':        `https://www.zee5.com/search?q=${enc}`,
    'SonyLIV':     `https://www.sonyliv.com/search?query=${enc}`,
    'JioCinema':   `https://www.jiocinema.com/search/${enc}`,
    'YouTube':     `https://www.youtube.com/results?search_query=${enc}+full+movie`,
    'MX Player':   `https://www.mxplayer.in/search?q=${enc}`,
  };
  return map[platform];
};

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
export const FALLBACK_POSTER = 'https://via.placeholder.com/300x450/1C1C1C/C9A84C?text=No+Poster';
export const FALLBACK_BACKDROP = 'https://via.placeholder.com/1280x720/141414/C9A84C?text=OTO';
