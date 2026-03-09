import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { config, activeModel } from '../../config.js';

const app = express();

// 模拟 health 路由
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: config.provider,
    model: activeModel(),
    baseUrl: config.provider === 'openai' ? config.openai.baseUrl : undefined,
  });
});

describe('Health API', () => {
  describe('GET /health', () => {
    it('should return 200 status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    it('should return status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.body.status).toBe('ok');
    });

    it('should return provider information', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toHaveProperty('provider');
      expect(['anthropic', 'openai']).toContain(response.body.provider);
    });

    it('should return model information', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toHaveProperty('model');
      expect(typeof response.body.model).toBe('string');
    });

    it('should return baseUrl for openai provider', async () => {
      const response = await request(app).get('/health');
      if (response.body.provider === 'openai') {
        expect(response.body).toHaveProperty('baseUrl');
        expect(typeof response.body.baseUrl).toBe('string');
      }
    });
  });
});
