import { Router, Request, Response } from 'express';
import { contentProvider } from '../provider';
import { cacheGet, cacheSet, cacheKey, TTL } from '../cache';
import { ApiResponse, OTOContent } from '../types';
import { requestCounter, cacheHitCounter, apiLatency } from '../metrics';

const router = Router();

// GET /content/trending
router.get('/trending', async (_req: Request, res: Response) => {
  const end = apiLatency.startTimer({ route: '/content/trending' });
  requestCounter.inc({ route: 'trending', method: 'GET' });

  try {
    const cKey = cacheKey.trending();
    const cached = await cacheGet<OTOContent[]>(cKey);
    if (cached) {
      cacheHitCounter.inc({ route: 'trending' });
      end({ status: '200' });
      return res.json({ success: true, data: cached, source: 'cache' } as ApiResponse<OTOContent[]>);
    }

    const data = await contentProvider.trending();
    await cacheSet(cKey, data, TTL.TRENDING);
    end({ status: '200' });
    return res.json({ success: true, data, source: contentProvider.currentProvider() } as ApiResponse<OTOContent[]>);
  } catch (err) {
    end({ status: '500' });
    return res.status(500).json({ success: false, error: 'Failed to fetch trending' });
  }
});

// GET /content/search?q=query
router.get('/search', async (req: Request, res: Response) => {
  const end = apiLatency.startTimer({ route: '/content/search' });
  requestCounter.inc({ route: 'search', method: 'GET' });

  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ success: false, error: 'Query parameter q is required' });

  try {
    const cKey = cacheKey.search(q);
    const cached = await cacheGet<OTOContent[]>(cKey);
    if (cached) {
      cacheHitCounter.inc({ route: 'search' });
      end({ status: '200' });
      return res.json({ success: true, data: cached, source: 'cache' });
    }

    const data = await contentProvider.search(q);
    await cacheSet(cKey, data, TTL.SEARCH);
    end({ status: '200' });
    return res.json({ success: true, data, source: contentProvider.currentProvider() });
  } catch {
    end({ status: '500' });
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// GET /content/:id
router.get('/:id', async (req: Request, res: Response) => {
  const end = apiLatency.startTimer({ route: '/content/:id' });
  requestCounter.inc({ route: 'content_detail', method: 'GET' });

  const { id } = req.params;
  try {
    const cKey = cacheKey.detail(id);
    const cached = await cacheGet<OTOContent>(cKey);
    if (cached) {
      cacheHitCounter.inc({ route: 'detail' });
      end({ status: '200' });
      return res.json({ success: true, data: cached, source: 'cache' });
    }

    const data = await contentProvider.getById(id);
    if (!data) {
      end({ status: '404' });
      return res.status(404).json({ success: false, error: 'Content not found' });
    }

    await cacheSet(cKey, data, TTL.DETAIL);
    end({ status: '200' });
    return res.json({ success: true, data, source: contentProvider.currentProvider() });
  } catch {
    end({ status: '500' });
    return res.status(500).json({ success: false, error: 'Failed to fetch content' });
  }
});

export default router;
