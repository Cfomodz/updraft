import { effectiveName, loadCommentLog, loadPosts, loadSettings } from '../background/storage';
import { h } from '../shared/dom';
import { momentum, rank, type Momentum } from '../shared/momentum';
import { sponsoredView, type SponsoredFilters } from '../shared/sponsored';
import { progress } from '../shared/streak';
import type { CapturedPost, DraftResult, Request } from '../shared/types';

type Tab = 'rising' | 'all' | 'sponsored' | 'commented';
type DraftState = { status: 'idle' } | { status: 'loading' } | { status: 'done'; result: DraftResult };

let tab: Tab = 'rising';
const drafts = new Map<string, DraftState>();
const angles = new Map<string, string>();
const list = document.getElementById('list')!;
const filtersBar = document.getElementById('filters')!;
const fundedBox = document.getElementById('f-funded') as HTMLInputElement;
const namesBox = document.getElementById('f-names') as HTMLInputElement;

// Remember the sponsored toggles per browser; storage can be unavailable, so never depend on it.
const FILTER_KEY = 'updraft.sponsoredFilters';
function loadFilters(): SponsoredFilters {
  try {
    const f = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}');
    return { wellFundedOnly: f.wellFundedOnly ?? true, namesMeOnly: f.namesMeOnly ?? false };
  } catch {
    return { wellFundedOnly: true, namesMeOnly: false };
  }
}
let filters = loadFilters();
fundedBox.checked = filters.wellFundedOnly;
namesBox.checked = filters.namesMeOnly;
for (const box of [fundedBox, namesBox]) {
  box.addEventListener('change', () => {
    filters = { wellFundedOnly: fundedBox.checked, namesMeOnly: namesBox.checked };
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      // Not persisted; the toggles still apply for this session.
    }
    render();
  });
}

function send(msg: Request): Promise<any> {
  return chrome.runtime.sendMessage(msg);
}

function ago(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(min, 1)}m`;
  const hr = Math.round(min / 60);
  return hr < 48 ? `${hr}h` : `${Math.round(hr / 24)}d`;
}

function fmt(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));
}

async function render(): Promise<void> {
  const [posts, log, settings, yourName] = await Promise.all([loadPosts(), loadCommentLog(), loadSettings(), effectiveName()]);
  const p = progress(log, settings.weeklyGoal);
  const progressEl = document.getElementById('progress')!;
  progressEl.replaceChildren(
    h('strong', {}, `${p.thisWeek}/${p.goal}`),
    ' comments this week',
    p.streakWeeks ? ` · ${p.streakWeeks}-week streak` : '',
  );

  const all = Object.values(posts);
  const now = Date.now();
  let rows: Array<{ post: CapturedPost; m: Momentum | null; namesYou?: boolean; wellFunded?: boolean }>;
  filtersBar.hidden = tab !== 'sponsored';
  if (tab === 'sponsored') {
    const sponsored = sponsoredView(all, filters, settings.funding, yourName);
    document.getElementById('f-count')!.textContent = `${sponsored.length} shown`;
    namesBox.disabled = !yourName;
    namesBox.parentElement!.title = yourName ? `Copy that mentions "${yourName}"` : 'Set your name in Settings, or open LinkedIn once so it can be detected';
    rows = sponsored.map((r) => ({ ...r, m: momentum(r.post, now) }));
  } else if (tab === 'rising') {
    rows = rank(all.filter((x) => !x.commentedAt), now).slice(0, 40);
  } else if (tab === 'commented') {
    rows = all.filter((x) => x.commentedAt).sort((a, b) => b.commentedAt! - a.commentedAt!).map((post) => ({ post, m: momentum(post, now) }));
  } else {
    rows = all.filter((x) => !x.dismissed).sort((a, b) => b.lastSeenAt - a.lastSeenAt).map((post) => ({ post, m: momentum(post, now) }));
  }

  if (!rows.length) {
    list.replaceChildren(
      h('p', { class: 'empty' },
        tab === 'commented'
          ? 'Posts you mark as commented show up here.'
          : tab === 'sponsored'
          ? 'No sponsored posts match. Scroll your feed to collect ads, or loosen the filters above.'
          : 'Nothing yet. Open your LinkedIn feed and scroll. Posts you scroll past are scored here as they gain engagement.'),
    );
    return;
  }
  list.replaceChildren(...rows.map(({ post, m, namesYou, wellFunded }) => card(post, m, now, { namesYou, wellFunded })));
}

function card(post: CapturedPost, m: Momentum | null, now: number, ad: { namesYou?: boolean; wellFunded?: boolean } = {}): HTMLElement {
  const latest = post.snapshots[post.snapshots.length - 1];
  const age = post.postedAt != null
    ? ago(now - post.postedAt) + (post.postedAtSource === 'relative-text' ? '~' : '')
    : `seen ${ago(now - post.firstSeenAt)} ago`;
  const state = drafts.get(post.key) ?? { status: 'idle' };

  const draftArea = h('div', { class: 'drafts' });
  if (state.status === 'loading') draftArea.append(h('div', { class: 'meta' }, 'Drafting…'));
  if (state.status === 'done') {
    if (state.result.ok) {
      for (const d of state.result.drafts) {
        const copy = h('button', { class: 'btn', onclick: async () => {
          await navigator.clipboard.writeText(d);
          copy.textContent = 'Copied';
          setTimeout(() => (copy.textContent = 'Copy'), 1500);
        } }, 'Copy');
        draftArea.append(h('div', { class: 'draft' }, d, h('div', { class: 'actions' }, copy)));
      }
    } else {
      draftArea.append(h('div', { class: 'error' }, state.result.error));
    }
  }

  const angle = h('input', { class: 'angle', placeholder: 'Optional angle, e.g. "disagree politely" or "share our numbers"' }) as HTMLInputElement;
  angle.value = angles.get(post.key) ?? '';
  angle.addEventListener('input', () => angles.set(post.key, angle.value));

  return h('article', { class: `card${m?.hot ? ' hot' : ''}` },
    h('div', { class: 'row' },
      h('span', { class: 'author' }, post.author || 'Unknown author'),
      h('span', { class: 'meta' }, age),
      post.promoted && h('span', { class: 'badge ad' }, 'Promoted'),
      ad.namesYou && h('span', { class: 'badge hot' }, 'Names you'),
      m && !post.promoted && h('span', { class: `badge${m.hot ? ' hot' : ''}` }, m.hot ? `Hot · ${m.stage}` : m.stage),
    ),
    post.promoted && h('div', { class: 'meta' },
      [
        post.advertiserFollowers != null ? `${fmt(post.advertiserFollowers)} followers` : null,
        `reached you on ${post.sightings ?? 1} visit${(post.sightings ?? 1) === 1 ? '' : 's'}`,
        ad.wellFunded === false ? 'below funding thresholds' : null,
      ].filter(Boolean).join(' · '),
    ),
    post.authorHeadline && h('div', { class: 'meta' }, post.authorHeadline),
    post.text && h('div', { class: 'text' }, post.text),
    latest && h('div', { class: 'stats' },
      h('span', {}, `${fmt(latest.reactions)} reactions`),
      h('span', {}, `${fmt(latest.comments)} comments`),
      latest.reposts ? h('span', {}, `${fmt(latest.reposts)} reposts`) : null,
      m && h('span', { title: 'Weighted engagement per hour' }, `${fmt(m.recentRate ?? m.lifetimeRate)}/h`),
    ),
    h('div', { class: 'actions' },
      post.url && h('a', { class: 'btn', href: post.url, target: '_blank', rel: 'noopener' }, 'Open'),
      h('button', { class: 'btn primary', onclick: () => draft(post.key) }, state.status === 'done' ? 'Redraft' : 'Draft comment'),
      h('button', { class: 'btn', onclick: () => send({ type: 'mark-commented', key: post.key, commented: !post.commentedAt }) },
        post.commentedAt ? 'Unmark' : 'I commented'),
      !post.commentedAt && h('button', { class: 'btn', onclick: () => send({ type: 'dismiss', key: post.key }) }, 'Hide'),
    ),
    state.status !== 'idle' || tab === 'rising' || tab === 'sponsored' ? angle : null,
    draftArea,
  );
}

async function draft(key: string): Promise<void> {
  drafts.set(key, { status: 'loading' });
  render();
  const result: DraftResult = await send({ type: 'draft', key, angle: angles.get(key) });
  drafts.set(key, { status: 'done', result });
  render();
}

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'))) {
  btn.addEventListener('click', () => {
    tab = btn.dataset.tab as Tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });
}
document.getElementById('settings')!.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Re-render when captures land, but not while the user is typing an angle (it would steal focus).
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== 'local') return;
  if (document.activeElement instanceof HTMLInputElement) return;
  render();
});
setInterval(() => {
  if (!(document.activeElement instanceof HTMLInputElement)) render();
}, 60_000);
render();
