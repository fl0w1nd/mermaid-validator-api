import { Window } from 'happy-dom';
import type mermaidType from 'mermaid';

let mermaidInstance: typeof mermaidType | null = null;

async function getMermaid(): Promise<typeof mermaidType> {
  if (mermaidInstance) return mermaidInstance;

  const window = new Window({ url: 'http://localhost' });
  const g = globalThis as Record<string, unknown>;

  const props: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    DOMParser: window.DOMParser,
    XMLSerializer: window.XMLSerializer,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
    cancelAnimationFrame: clearTimeout,
  };

  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(g, key, {
      value,
      writable: true,
      configurable: true,
    });
  }

  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false });
  mermaidInstance = mermaid;
  return mermaid;
}

export async function validateMermaidCode(
  code: string,
): Promise<{ valid: boolean; error: string | null }> {
  const mermaid = await getMermaid();
  try {
    await mermaid.parse(code);
    return { valid: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}
