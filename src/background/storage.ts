import { DEFAULT_SETTINGS, type Settings } from '../shared/types';
import type { PostMap } from '../shared/store';

// All state is local to this browser profile. Settings (including the API key) go in
// chrome.storage.local rather than .sync so the key is never copied to Google's sync servers.

export async function loadPosts(): Promise<PostMap> {
  const { posts } = await chrome.storage.local.get('posts');
  return (posts as PostMap | undefined) ?? {};
}

export async function savePosts(posts: PostMap): Promise<void> {
  await chrome.storage.local.set({ posts });
}

export async function loadCommentLog(): Promise<number[]> {
  const { commentLog } = await chrome.storage.local.get('commentLog');
  return (commentLog as number[] | undefined) ?? [];
}

export async function saveCommentLog(log: number[]): Promise<void> {
  // A year of history is plenty for streaks.
  const cutoff = Date.now() - 366 * 86_400_000;
  await chrome.storage.local.set({ commentLog: log.filter((t) => t >= cutoff) });
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  const s = (settings ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    voice: { ...DEFAULT_SETTINGS.voice, ...s.voice },
    funding: { ...DEFAULT_SETTINGS.funding, ...s.funding },
  };
}

// The signed-in member's name as read from LinkedIn's nav; Settings.yourName overrides it.
export async function loadDetectedName(): Promise<string> {
  const { detectedName } = await chrome.storage.local.get('detectedName');
  return typeof detectedName === 'string' ? detectedName : '';
}

export async function saveDetectedName(name: string): Promise<void> {
  if ((await loadDetectedName()) !== name) await chrome.storage.local.set({ detectedName: name });
}

export async function effectiveName(): Promise<string> {
  const settings = await loadSettings();
  return settings.yourName.trim() || (await loadDetectedName());
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

// Every read-modify-write of posts goes through this queue so concurrent messages cannot
// overwrite each other's changes.
let queue: Promise<unknown> = Promise.resolve();
export function updatePosts(fn: (posts: PostMap) => PostMap | Promise<PostMap>): Promise<PostMap> {
  const run = queue.then(async () => {
    const next = await fn(await loadPosts());
    await savePosts(next);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

let logQueue: Promise<unknown> = Promise.resolve();
export function updateCommentLog(fn: (log: number[]) => number[]): Promise<void> {
  const run = logQueue.then(async () => saveCommentLog(fn(await loadCommentLog())));
  logQueue = run.catch(() => undefined);
  return run;
}
