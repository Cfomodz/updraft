import { mergeCapture } from '../shared/store';
import type { DraftResult, Request } from '../shared/types';
import { draftComments } from './draft';
import { effectiveName, loadPosts, loadSettings, saveDetectedName, updateCommentLog, updatePosts } from './storage';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep the channel open for the async response
});

async function handle(msg: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'capture': {
      // Only accept captures from our own content script on LinkedIn.
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith('https://www.linkedin.com/')) return { ok: false };
      await updatePosts((posts) => mergeCapture(posts, msg.posts));
      return { ok: true };
    }
    case 'draft': {
      const post = (await loadPosts())[msg.key];
      if (!post) return { ok: false, error: 'That post is no longer stored.' } satisfies DraftResult;
      return draftComments(post, await loadSettings(), msg.angle, undefined, await effectiveName());
    }
    case 'mark-commented': {
      const now = Date.now();
      let previous: number | undefined;
      await updatePosts((posts) => {
        const post = posts[msg.key];
        if (!post) return posts;
        previous = post.commentedAt;
        return { ...posts, [msg.key]: { ...post, commentedAt: msg.commented ? (post.commentedAt ?? now) : undefined } };
      });
      if (msg.commented && previous == null) await updateCommentLog((log) => [...log, now]);
      if (!msg.commented && previous != null) await updateCommentLog((log) => log.filter((t) => t !== previous));
      return { ok: true };
    }
    case 'viewer': {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith('https://www.linkedin.com/')) return { ok: false };
      await saveDetectedName(msg.name.slice(0, 80));
      return { ok: true };
    }
    case 'dismiss': {
      await updatePosts((posts) => (posts[msg.key] ? { ...posts, [msg.key]: { ...posts[msg.key], dismissed: true } } : posts));
      return { ok: true };
    }
  }
}
