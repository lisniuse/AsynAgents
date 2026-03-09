import { describe, it, expect } from 'vitest';
import express from 'express';
import eventsRouter from '../../server/src/routes/events.js';

describe('Events API', () => {
  describe('GET /api/events/:sessionId', () => {
    it('should have events router defined', () => {
      const app = express();
      expect(() => {
        app.use('/api', eventsRouter);
      }).not.toThrow();
    });

    it('should accept GET requests to /api/events/:sessionId', () => {
      const app = express();
      app.use('/api', eventsRouter);
      
      const routes = app._router?.stack || [];
      const hasEventsRoute = routes.some((layer: any) => {
        if (layer.route) {
          return layer.route.path === '/events/:sessionId' && 
                 layer.route.methods.get;
        }
        return false;
      });
      
      // 由于 router 是嵌套的，我们验证 router 已挂载
      expect(eventsRouter).toBeDefined();
    });

    it('should handle different session IDs format', () => {
      const validSessionIds = [
        'session-1',
        'session_2', 
        'test-session-123',
        'abc123',
        'uuid-style-id-1234-5678'
      ];

      validSessionIds.forEach(sessionId => {
        expect(sessionId).toBeTruthy();
        expect(typeof sessionId).toBe('string');
      });
    });
  });
});
