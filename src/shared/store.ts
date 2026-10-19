import type { CaptureInput, CapturedPost, Snapshot } from './types';

export const LIMITS = {
  snapshotsPerPost: 8,
  minSnapshotGapMs: 5 * 60_000,
  maxPosts: 600,
  keepUnseenMs: 3 * 86_400_000,
  keepCommentedMs: 14 * 86_400_000,
};

export type PostMap = Record<string, CapturedPost>;

// Folds one batch of observations into the stored posts. Pure, so it is testable without chrome.*.
export function mergeCapture(posts: PostMap, inputs: CaptureInput[], now = Date.now()): PostMap {
  const next: PostMap = { ...posts };
  for (const input of inputs) {
    const prev = next[input.key];
    const snap: Snapshot = { at: input.observedAt, reactions: input.reactions, comments: input.comments, reposts: input.reposts };
    if (!prev) {
      next[input.key] = {
        key: input.key,
        activityId: input.activityId,
        url: input.url,
        author: input.author,
        authorHeadline: input.authorHeadline,
        text: input.text,
        postedAt: input.postedAt,
        postedAtSource: input.postedAtSource,
        snapshots: [snap],
        firstSeenAt: input.observedAt,
        lastSeenAt: input.observedAt,
      };
      continue;
    }
    const post: CapturedPost = { ...prev, lastSeenAt: Math.max(prev.lastSeenAt, input.observedAt) };
    // Prefer richer values: text expands after "see more", ids appear once the permalink renders.
    if (input.text.length > post.text.length) post.text = input.text;
    if (!post.author && input.author) post.author = input.author;
    if (!post.authorHeadline && input.authorHeadline) post.authorHeadline = input.authorHeadline;
    if (!post.activityId && input.activityId) {
      post.activityId = input.activityId;
      post.url = input.url;
    }
    // A URN-derived time is exact; relative text ("3h") is only accurate to its unit.
    if (input.postedAt != null && (post.postedAt == null || (post.postedAtSource !== 'urn' && input.postedAtSource === 'urn'))) {
      post.postedAt = input.postedAt;
      post.postedAtSource = input.postedAtSource;
    }
    post.snapshots = addSnapshot(prev.snapshots, snap);
    next[input.key] = post;
  }
  return prune(next, now);
}

function addSnapshot(list: Snapshot[], snap: Snapshot): Snapshot[] {
  const last = list[list.length - 1];
  // Counts never legitimately drop to zero; a zero usually means the counts row had not rendered.
  const blank = snap.reactions + snap.comments + snap.reposts === 0;
  if (blank && last) return list;
  if (last && snap.at - last.at < LIMITS.minSnapshotGapMs) {
    // Too soon for a new rate sample: refresh the latest counts in place.
    return [...list.slice(0, -1), { ...snap, at: last.at }];
  }
  return [...list, snap].slice(-LIMITS.snapshotsPerPost);
}

export function prune(posts: PostMap, now = Date.now()): PostMap {
  const kept = Object.values(posts).filter((p) =>
    p.commentedAt ? now - p.commentedAt < LIMITS.keepCommentedMs : now - p.lastSeenAt < LIMITS.keepUnseenMs,
  );
  kept.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return Object.fromEntries(kept.slice(0, LIMITS.maxPosts).map((p) => [p.key, p]));
}
