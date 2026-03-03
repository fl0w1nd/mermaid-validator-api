import { describe, it, expect } from 'vitest';
import app from './app.js';

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: 'mermaid-validator-api' });
  });
});

describe('POST /validate', () => {
  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when code field is missing', async () => {
    const res = await post('/validate', {});
    expect(res.status).toBe(400);
  });

  it('validates a correct flowchart', async () => {
    const res = await post('/validate', { code: 'graph TD; A-->B' });
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.error).toBeNull();
  });

  it('validates a correct sequence diagram', async () => {
    const res = await post('/validate', {
      code: 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi',
    });
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it('validates a correct class diagram', async () => {
    const res = await post('/validate', {
      code: 'classDiagram\n  class Animal {\n    +String name\n  }',
    });
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it('validates a correct state diagram', async () => {
    const res = await post('/validate', {
      code: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running',
    });
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it('validates a correct pie chart', async () => {
    const res = await post('/validate', {
      code: 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85',
    });
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it('rejects completely invalid text', async () => {
    const res = await post('/validate', { code: 'hello world not mermaid' });
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it('rejects diagram type with typo', async () => {
    const res = await post('/validate', { code: 'flowchar TD\n  A --> B' });
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('rejects unclosed bracket', async () => {
    const res = await post('/validate', { code: 'graph TD\n  A[Start --> B' });
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it('rejects pie chart with missing colon', async () => {
    const res = await post('/validate', {
      code: 'pie title Pets\n  "Dogs" 386',
    });
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('extracts code from mermaid code block', async () => {
    const res = await post('/validate', {
      code: '```mermaid\ngraph LR\n  A-->B-->C\n```',
    });
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it('preserves id in response', async () => {
    const res = await post('/validate', { id: 'test-1', code: 'graph TD; A-->B' });
    const data = await res.json();
    expect(data.id).toBe('test-1');
  });
});

describe('POST /validate/batch', () => {
  it('returns 400 for empty items', async () => {
    const res = await post('/validate/batch', { items: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when items exceeds 200', async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({ id: String(i), code: 'graph TD; A-->B' }));
    const res = await post('/validate/batch', { items });
    expect(res.status).toBe(400);
  });

  it('validates a batch of mixed valid and invalid diagrams', async () => {
    const res = await post('/validate/batch', {
      items: [
        { id: '1', code: 'graph TD; A-->B' },
        { id: '2', code: 'not mermaid at all' },
        { id: '3', code: 'sequenceDiagram\n  A->>B: Hi' },
      ],
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.count).toBe(3);
    expect(data.invalidCount).toBe(1);
    expect(data.results[0].valid).toBe(true);
    expect(data.results[1].valid).toBe(false);
    expect(data.results[2].valid).toBe(true);
  });

  it('handles empty code in batch item', async () => {
    const res = await post('/validate/batch', {
      items: [{ id: '1', code: '' }],
    });
    const data = await res.json();
    expect(data.results[0].valid).toBe(false);
    expect(data.results[0].error).toBe('Empty mermaid code');
  });
});
