import { JSDOM } from 'jsdom';
import type mermaidType from 'mermaid';

let mermaidInstance: typeof mermaidType | null = null;

async function getMermaid(): Promise<typeof mermaidType> {
  if (mermaidInstance) return mermaidInstance;

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const g = globalThis as Record<string, unknown>;

  // Some properties on globalThis are read-only getters in newer Node versions,
  // so use Object.defineProperty to overwrite them.
  const props: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    DOMParser: dom.window.DOMParser,
    XMLSerializer: dom.window.XMLSerializer,
    HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window['SVGElement' as keyof typeof dom.window],
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
