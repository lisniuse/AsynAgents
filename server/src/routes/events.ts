import { Router } from 'express';
import type { Request, Response } from 'express';
import { messageQueue } from '../queue/MessageQueue.js';

const router = Router();

router.get('/events/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params['sessionId'] as string;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: unknown): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: 'connected', threadId: '', data: { sessionId }, timestamp: Date.now() });

  const unsubscribe = messageQueue.subscribe(sessionId, (event) => {
    send(event);
  });

  // Heartbeat to prevent connection timeout
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
});

export default router;
