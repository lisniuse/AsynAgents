import { afterEach, describe, expect, it } from 'vitest';
import {
  deleteConversationProcess,
  listConversationProcesses,
  startManagedProcess,
  stopConversationProcess,
} from '../src/process/ManagedProcessStorage.js';

const created: Array<{ conversationId: string; processId: string }> = [];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
  for (const item of created.splice(0, created.length)) {
    try {
      await stopConversationProcess(item.conversationId, item.processId);
    } catch {
      // ignore
    }

    try {
      await deleteConversationProcess(item.conversationId, item.processId);
    } catch {
      // ignore
    }
  }
});

describe('ManagedProcessStorage', () => {
  it('starts, lists, stops, and deletes a managed background process', async () => {
    const conversationId = `process-${Date.now()}`;
    const command = `"${process.execPath}" -e "const http=require('http');const server=http.createServer((req,res)=>res.end('ok'));server.listen(0,'127.0.0.1',()=>{const port=server.address().port;console.log('http://127.0.0.1:'+port);});setInterval(()=>{},1000);"`;

    const started = await startManagedProcess({
      conversationId,
      command,
      cwd: process.cwd(),
      name: 'Temp Dev Server',
    });
    created.push({ conversationId, processId: started.id });

    expect(started.status).toBe('running');
    expect(started.pid).toBeGreaterThan(0);

    await sleep(1200);

    const listed = await listConversationProcesses(conversationId);
    expect(listed).toHaveLength(1);
    expect(listed[0].status).toBe('running');
    expect(listed[0].urls[0]).toContain('http://127.0.0.1:');
    expect(listed[0].ports.length).toBeGreaterThan(0);

    const stopped = await stopConversationProcess(conversationId, started.id);
    expect(stopped.status).toBe('stopped');

    await deleteConversationProcess(conversationId, started.id);
    created.length = 0;

    const afterDelete = await listConversationProcesses(conversationId);
    expect(afterDelete).toHaveLength(0);
  }, 15000);
});
