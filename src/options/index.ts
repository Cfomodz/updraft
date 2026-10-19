import { loadSettings, saveSettings } from '../background/storage';
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
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const goal = Math.round(Number(field('weeklyGoal').value));
  const settings: Settings = {
    apiKey: field('apiKey').value.trim(),
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
