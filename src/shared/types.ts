export interface Snapshot {
  at: number; // ms since epoch, when we observed the counts
  reactions: number;
  comments: number;
  reposts: number;
}

// One feed post as captured from the page. Counts are whatever LinkedIn rendered; absent counts are 0.
export interface CapturedPost {
  key: string; // stable storage key: the activity id when known, otherwise a DOM-derived key
  activityId: string | null;
  url: string | null;
  author: string;
  authorHeadline: string;
  text: string;
  postedAt: number | null; // ms since epoch; null when neither the id nor the page told us
  postedAtSource: 'urn' | 'relative-text' | null;
  snapshots: Snapshot[]; // oldest first, bounded
  firstSeenAt: number;
  lastSeenAt: number;
  commentedAt?: number; // set when the user marks the post as commented
  dismissed?: boolean;
}

export interface VoiceProfile {
  about: string; // who you are and what you talk about
  samples: string; // a few of your own past comments or posts, separated by blank lines
  rules: string; // style rules, one per line
}

export interface Settings {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  weeklyGoal: number; // comments per week
  voice: VoiceProfile;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'medium',
  weeklyGoal: 5,
  voice: { about: '', samples: '', rules: '' },
};

// Messages from content script / side panel to the background worker.
export type Request =
  | { type: 'capture'; posts: CaptureInput[] }
  | { type: 'draft'; key: string; angle?: string }
  | { type: 'mark-commented'; key: string; commented: boolean }
  | { type: 'dismiss'; key: string };

// What the content script extracts from one post element at one moment.
export interface CaptureInput {
  key: string;
  activityId: string | null;
  url: string | null;
  author: string;
  authorHeadline: string;
  text: string;
  postedAt: number | null;
  postedAtSource: CapturedPost['postedAtSource'];
  reactions: number;
  comments: number;
  reposts: number;
  observedAt: number;
}

export type DraftResult = { ok: true; drafts: string[] } | { ok: false; error: string };
