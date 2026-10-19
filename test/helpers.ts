import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

export function idAt(ms: number): string {
  return (BigInt(ms) << 22n).toString();
}

export function loadFixture(name: string, ids: Record<string, string>): Document {
  let html = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  for (const [k, v] of Object.entries(ids)) html = html.replaceAll(k, v);
  return new JSDOM(html).window.document;
}
