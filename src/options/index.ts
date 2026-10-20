import { loadDetectedName, loadSettings, saveSettings } from '../background/storage';
import type { Settings } from '../shared/types';

const form = document.getElementById('form') as HTMLFormElement;
const status = document.getElementById('status')!;
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

async function init(): Promise<void> {
  const s = await loadSettings();
  field('apiKey').value = s.apiKey;
  field('model').value = s.model;
  field('effort').value = s.effort;
  field('weeklyGoal').value = String(s.weeklyGoal);
  field('about').value = s.voice.about;
  field('samples').value = s.voice.samples;
  field('rules').value = s.voice.rules;
  field('yourName').value = s.yourName;
  field('minFollowers').value = String(s.funding.minFollowers);
  field('minEngagement').value = String(s.funding.minEngagement);
  field('minSightings').value = String(s.funding.minSightings);
  const detected = await loadDetectedName();
  if (detected) document.getElementById('detected')!.textContent = `detected: ${detected}`;
}

function count(name: string, fallback: number, min = 0): number {
  const n = Math.round(Number(field(name).value));
  return Number.isFinite(n) && n >= min ? n : fallback;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const goal = Math.round(Number(field('weeklyGoal').value));
  const defaults = (await loadSettings()).funding;
  const settings: Settings = {
    apiKey: field('apiKey').value.trim(),
    yourName: field('yourName').value.trim(),
    funding: {
      minFollowers: count('minFollowers', defaults.minFollowers),
      minEngagement: count('minEngagement', defaults.minEngagement),
      minSightings: count('minSightings', defaults.minSightings, 1),
    },
    model: field('model').value.trim() || 'claude-opus-5-5',
    effort: field('effort').value as Settings['effort'],
    weeklyGoal: Number.isFinite(goal) && goal > 0 ? goal : 5,
    voice: { about: field('about').value, samples: field('samples').value, rules: field('rules').value },
  };
  await saveSettings(settings);
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 2000);
});

init();
