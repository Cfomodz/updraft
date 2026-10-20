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
  // Optional because posts stored by 0.1.0 predate them.
  promoted?: boolean; // LinkedIn labelled it "Promoted"/"Sponsored"
  advertiserFollowers?: number | null; // follower count shown under the advertiser's name
  sightings?: number; // separate visits (30+ min apart) on which the post reached the user
}

export interface VoiceProfile {
  about: string; // who you are and what you talk about
  samples: string; // a few of your own past comments or posts, separated by blank lines
  rules: string; // style rules, one per line
}

// What makes a sponsored post count as well funded. LinkedIn does not expose ad spend, so these
// are visible proxies; a post passes when it meets ANY of them.
export interface FundingThresholds {
  minFollowers: number; // advertiser page followers
  minEngagement: number; // reactions + comments + reposts on the ad
  minSightings: number; // separate visits on which the same ad reached you
}

export interface Settings {
  apiKey: string;
  yourName: string; // the name personalised ads use for you; blank = detected from LinkedIn
  model: string;
  effort: 'low' | 'medium' | 'high';
  weeklyGoal: number; // comments per week
  voice: VoiceProfile;
  funding: FundingThresholds;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  yourName: '',
  model: 'claude-opus-5-5',
  effort: 'medium',
  weeklyGoal: 5,
  voice: { about: '', samples: '', rules: '' },
  funding: { minFollowers: 10_000, minEngagement: 100, minSightings: 3 },
};

// Messages from content script / side panel to the background worker.
export type Request =
  | { type: 'capture'; posts: CaptureInput[] }
  | { type: 'draft'; key: string; angle?: string }
  | { type: 'mark-commented'; key: string; commented: boolean }
  | { type: 'dismiss'; key: string }
  | { type: 'viewer'; name: string };

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
  promoted: boolean;
  advertiserFollowers: number | null;
  observedAt: number;
}

export type DraftResult = { ok: true; drafts: string[] } | { ok: false; error: string };
