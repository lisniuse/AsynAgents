import { Router } from 'express';
import type { Request, Response } from 'express';
import { messageQueue } from '../queue/MessageQueue.js';

const router = Router();

router.get('/events/:conversationId', (req: Request, res: Response) => {
  const conversationId = req.params['conversationId'] as string;
  const fromIndex = Math.max(0, parseInt((req.query['from'] as string) ?? '0', 10) || 0);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: unknown): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: 'connected', threadId: '', data: { conversationId }, timestamp: Date.now() });

  const unsubscribe = messageQueue.subscribe(
    conversationId,
    (event, index) => {
      send({ ...event, index });
    },
    fromIndex
  );

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
});

export default router;
