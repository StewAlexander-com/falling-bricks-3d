export interface ScoreEntry {
  id: string;
  score: number;
  level: number;
  name: string;
  date: string;
}

export interface Settings {
  music: boolean;
  sfx: boolean;
  vibrate: boolean;
  graphics: 'auto' | 'high' | 'medium' | 'low';
}

const SCORES_KEY = 'fb3d.scores';
const SETTINGS_KEY = 'fb3d.settings';
const NAME_KEY = 'fb3d.name';
const TOP_N = 5;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota: play on without persistence */
  }
}

export function loadSettings(): Settings {
  return read<Settings>(SETTINGS_KEY, { music: true, sfx: true, vibrate: true, graphics: 'auto' });
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}

export function loadScores(): ScoreEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(SCORES_KEY) ?? '[]');
    return Array.isArray(list) ? list.slice(0, TOP_N) : [];
  } catch {
    return [];
  }
}

export function bestScore() {
  return loadScores()[0]?.score ?? 0;
}

export function qualifies(score: number) {
  const list = loadScores();
  return score > 0 && (list.length < TOP_N || score > list[list.length - 1].score);
}

export function insertScore(score: number, level: number, name: string): ScoreEntry {
  const entry: ScoreEntry = {
    id: Math.random().toString(36).slice(2),
    score,
    level,
    name,
    date: new Date().toLocaleDateString('en-CA'),
  };
  const list = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, TOP_N);
  write(SCORES_KEY, list);
  return entry;
}

export function renameScore(id: string, name: string) {
  const list = loadScores();
  const e = list.find((x) => x.id === id);
  if (!e) return;
  e.name = name;
  write(SCORES_KEY, list);
  write(NAME_KEY, name);
}

export function flag(name: string) {
  try {
    return localStorage.getItem(`fb3d.flag.${name}`) === '1';
  } catch {
    return false;
  }
}

export function setFlag(name: string) {
  try {
    localStorage.setItem(`fb3d.flag.${name}`, '1');
  } catch {
    /* ignore */
  }
}

export function lastName() {
  try {
    return localStorage.getItem(NAME_KEY)?.replace(/^"|"$/g, '') || 'Player';
  } catch {
    return 'Player';
  }
}
