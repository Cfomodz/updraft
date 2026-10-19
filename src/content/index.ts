import type { CaptureInput, Request } from '../shared/types';
import { extractPost, findPosts } from './extract';

// Watches the feed and reports posts the user actually scrolled past. Read-only: this script never
// clicks, types, or calls LinkedIn's APIs; it reads what LinkedIn already rendered for the user.

const pending = new Map<string, CaptureInput>();
const observed = new WeakSet<Element>();
let flushTimer: number | undefined;

const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const input = extractPost(entry.target);
      if (input) pending.set(input.key, input);
    }
    scheduleFlush();
  },
  { threshold: 0.5 },
);

function scan(): void {
  if (!location.pathname.startsWith('/feed')) return;
  for (const el of findPosts(document)) {
    if (observed.has(el)) continue;
    observed.add(el);
    visibility.observe(el);
  }
}

function scheduleFlush(): void {
  if (flushTimer != null || pending.size === 0) return;
  flushTimer = window.setTimeout(flush, 2000);
}

function flush(): void {
  flushTimer = undefined;
  if (pending.size === 0) return;
  const posts = Array.from(pending.values());
  pending.clear();
  const msg: Request = { type: 'capture', posts };
  chrome.runtime.sendMessage(msg).catch(() => {
    // The worker restarts or the extension was reloaded; drop this batch, the next scroll resends.
  });
}

let scanQueued = false;
new MutationObserver(() => {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scan();
  });
}).observe(document.body, { childList: true, subtree: true });

scan();
