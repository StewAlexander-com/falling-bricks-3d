import './style.css';
import * as C from './config';
import { Sim } from './sim';
import { Renderer, type Quality } from './render';
import { Sound } from './audio';
import * as store from './storage';

type State = 'title' | 'playing' | 'paused' | 'dying' | 'over';
type ScreenName = 'title' | 'pause' | 'over' | 'scores' | 'settings';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const canvas = $<HTMLCanvasElement>('#game');
const hud = $('#hud');
const hudScore = $('#hud-score');
const hudLevel = $('#hud-level');
const hudBest = $('#hud-best');
const hudProgress = $('#hud-progress i');
const banner = $('#banner');
const flashEl = $('#flash');
const isTouch = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const settings = store.loadSettings();
const sim = new Sim();
const sound = new Sound();
sound.musicOn = settings.music;
sound.sfxOn = settings.sfx;

const autoQuality = (): Quality => (isTouch ? 'medium' : 'high');
const renderer = new Renderer(canvas, settings.graphics === 'auto' ? autoQuality() : settings.graphics);

let state: State = 'title';
let best = store.bestScore();
let closeCalls = 0;
let shownScore = -1;
let shownLevel = -1;
let lastEntryId: string | null = null;

sim.reset('demo');

// ── Screens ─────────────────────────────────────────────────────────────────

const screens: Record<ScreenName, HTMLElement> = {
  title: $('#screen-title'),
  pause: $('#screen-pause'),
  over: $('#screen-over'),
  scores: $('#screen-scores'),
  settings: $('#screen-settings'),
};
const screenStack: ScreenName[] = [];

function showScreen(name: ScreenName | null, push = false) {
  if (!push) screenStack.length = 0;
  if (name) screenStack.push(name);
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  if (name) {
    const focus = screens[name].querySelector<HTMLElement>('[data-autofocus]');
    if (!isTouch) focus?.focus({ preventScroll: true });
  }
}

function back() {
  screenStack.pop();
  const prev = screenStack.pop() ?? (state === 'paused' ? 'pause' : state === 'over' ? 'over' : 'title');
  showScreen(prev, true);
}

document.querySelectorAll<HTMLElement>('[data-open]').forEach((b) =>
  b.addEventListener('click', () => {
    sound.click();
    const target = b.dataset.open as ScreenName;
    if (target === 'scores') renderBoard($('#scores-board'), null);
    showScreen(target, true);
  }),
);
document.querySelectorAll<HTMLElement>('[data-back]').forEach((b) => b.addEventListener('click', () => { sound.click(); back(); }));

function renderBoard(list: HTMLElement, highlightId: string | null) {
  const scores = store.loadScores();
  list.replaceChildren();
  if (!scores.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No scores yet. Go set one!';
    list.append(li);
    return;
  }
  scores.forEach((e, i) => {
    const li = document.createElement('li');
    if (e.id === highlightId) li.className = 'me';
    const cells: [string, string][] = [['r', i === 0 ? '★' : `${i + 1}`], ['n', e.name], ['s', `${e.score}`], ['d', `Level ${e.level} · ${e.date}`]];
    for (const [cls, text] of cells) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      li.append(span);
    }
    list.append(li);
  });
}

// ── Game flow ───────────────────────────────────────────────────────────────

function startGame() {
  sound.unlock();
  sound.click();
  sim.reset('play');
  renderer.resetBall();
  sound.startMusic(true);
  closeCalls = 0;
  shownScore = shownLevel = -1;
  targetX = sim.ballX;
  hudBest.textContent = `${best}`;
  hud.classList.remove('is-hidden');
  showScreen(null);
  state = 'playing';
  canvas.focus();
  if (!store.flag('coached')) {
    coach.querySelector('b')!.textContent = isTouch ? 'Drag to move' : 'Mouse or arrow keys';
    coach.classList.remove('fade');
    coach.hidden = false;
    coachStartX = sim.ballX;
  }
}

const coach = $('#coach');
let coachStartX = 0;
function updateCoach() {
  if (coach.hidden || coach.classList.contains('fade')) return;
  const moved = Math.abs(sim.ballX - coachStartX) > 40;
  if (moved || state !== 'playing') {
    if (moved) store.setFlag('coached');
    coach.classList.add('fade');
    setTimeout(() => (coach.hidden = true), 400);
  }
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  sound.duck(true);
  showScreen('pause');
}

function resume() {
  if (state !== 'paused') return;
  sound.unlock();
  sound.duck(false);
  showScreen(null);
  state = 'playing';
  lastFrame = performance.now();
}

function toTitle() {
  sound.stopMusic();
  sim.reset('demo');
  renderer.resetBall();
  hud.classList.add('is-hidden');
  $('#title-best').textContent = `${best}`;
  state = 'title';
  showScreen('title');
}

function onDeath(x: number, y: number, color: [number, number, number]) {
  state = 'dying';
  renderer.death(x, y, color);
  sound.death();
  sound.stopMusic();
  if (settings.vibrate) navigator.vibrate?.([60, 40, 120]);
  flash('red');
  setTimeout(showGameOver, 1100);
}

function showGameOver() {
  const score = Math.floor(sim.score);
  const isBest = score > best;
  const top = store.qualifies(score);
  lastEntryId = null;
  if (top) lastEntryId = store.insertScore(score, sim.level, store.lastName()).id;
  if (isBest) best = score;

  $('#over-score').textContent = `${score}`;
  $('#over-level').textContent = `${sim.level}`;
  $('#over-close').textContent = `${closeCalls}`;
  $('#over-badge').hidden = !isBest;
  $('#over-name-row').hidden = !top;
  const nameInput = $<HTMLInputElement>('#over-name');
  nameInput.value = store.lastName();
  renderBoard($('#over-board'), lastEntryId);

  const again = $<HTMLButtonElement>('#btn-again');
  again.disabled = true;
  setTimeout(() => (again.disabled = false), 650);

  hud.classList.add('is-hidden');
  state = 'over';
  showScreen('over');
}

const nameInput = $<HTMLInputElement>('#over-name');
const commitName = () => {
  if (!lastEntryId) return;
  store.renameScore(lastEntryId, nameInput.value.trim() || 'Player');
  renderBoard($('#over-board'), lastEntryId);
};
nameInput.addEventListener('change', commitName);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    commitName();
    nameInput.blur();
  }
  e.stopPropagation();
});

$('#btn-play').addEventListener('click', startGame);
$('#btn-again').addEventListener('click', () => { commitName(); startGame(); });
$('#btn-menu').addEventListener('click', () => { commitName(); sound.click(); toTitle(); });
$('#btn-resume').addEventListener('click', () => { sound.click(); resume(); });
$('#btn-restart').addEventListener('click', startGame);
$('#btn-quit').addEventListener('click', () => { sound.click(); toTitle(); });
$('#btn-pause').addEventListener('click', (e) => { e.stopPropagation(); pause(); });

function flash(kind: 'gold' | 'red') {
  if (reducedMotion) return;
  flashEl.classList.remove('go', 'red');
  void flashEl.offsetWidth;
  flashEl.classList.add('go');
  if (kind === 'red') flashEl.classList.add('red');
}

let bannerTimer = 0;
function showBanner(title: string, sub = '') {
  banner.querySelector('strong')!.textContent = title;
  banner.querySelector('span')!.textContent = sub;
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => banner.classList.remove('show'), 2000);
}

// ── Settings ────────────────────────────────────────────────────────────────

const setMusic = $<HTMLInputElement>('#set-music');
const setSfx = $<HTMLInputElement>('#set-sfx');
const setVibrate = $<HTMLInputElement>('#set-vibrate');
setMusic.checked = settings.music;
setSfx.checked = settings.sfx;
setVibrate.checked = settings.vibrate;
if (!('vibrate' in navigator)) $('#vibrate-row').hidden = true;
document.querySelectorAll<HTMLInputElement>('input[name="gfx"]').forEach((r) => {
  r.checked = r.value === settings.graphics;
  r.addEventListener('change', () => {
    settings.graphics = r.value as store.Settings['graphics'];
    renderer.setQuality(settings.graphics === 'auto' ? autoQuality() : settings.graphics);
    store.saveSettings(settings);
  });
});
setMusic.addEventListener('change', () => {
  settings.music = setMusic.checked;
  sound.unlock();
  sound.setMusic(settings.music);
  store.saveSettings(settings);
});
setSfx.addEventListener('change', () => {
  settings.sfx = setSfx.checked;
  sound.unlock();
  sound.setSfx(settings.sfx);
  sound.click();
  store.saveSettings(settings);
});
setVibrate.addEventListener('change', () => {
  settings.vibrate = setVibrate.checked;
  if (settings.vibrate) navigator.vibrate?.(30);
  store.saveSettings(settings);
});

$('#controls-hint').textContent = isTouch
  ? 'Drag anywhere on screen to steer the ball'
  : 'Steer with the mouse or ← → / A D · Esc pauses';
$('#title-best').textContent = `${best}`;

// ── Input ───────────────────────────────────────────────────────────────────

let targetX = sim.ballX;
let dragId: number | null = null;
let dragLastX = 0;
const keys = { left: false, right: false };

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') return;
  if (e.pointerType === 'mouse') {
    targetX = renderer.screenToSimX(e.clientX);
    sim.setBallX(targetX);
    return;
  }
  dragId = e.pointerId;
  dragLastX = e.clientX;
  targetX = sim.ballX;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (state !== 'playing') return;
  if (e.pointerType === 'mouse') {
    targetX = renderer.screenToSimX(e.clientX);
    sim.setBallX(targetX);
    return;
  }
  if (e.pointerId !== dragId) return;
  // Relative drag: the thumb can sit anywhere, so it never hides the ball.
  const events = e.getCoalescedEvents?.() ?? [e];
  const x = events[events.length - 1].clientX;
  targetX += (x - dragLastX) * renderer.simUnitsPerPx * C.TOUCH_SENSITIVITY;
  targetX = Math.min(C.FIELD_W - C.BALL_RADIUS, Math.max(C.BALL_RADIUS, targetX));
  dragLastX = x;
  sim.setBallX(targetX);
});

const endDrag = (e: PointerEvent) => { if (e.pointerId === dragId) dragId = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
  else if (k === 'Escape' || k === 'p' || k === 'P') {
    if (state === 'playing') pause();
    else if (state === 'paused' && screenStack.length <= 1) resume();
    else if (screenStack.length > 1) back();
  } else if ((k === ' ' || k === 'Enter') && state === 'title' && document.activeElement === document.body) startGame();
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  sound.suspend(document.hidden);
});
window.addEventListener('blur', () => { pause(); keys.left = keys.right = false; });

// ── Layout ──────────────────────────────────────────────────────────────────

let layoutDirty = false;
function layout() {
  layoutDirty = true;
  const probe = getComputedStyle($('#safe-probe'));
  const safeBottom = parseFloat(probe.paddingBottom) || 0;
  renderer.setInsets(hud.getBoundingClientRect().bottom, safeBottom);
}
new ResizeObserver(layout).observe(document.documentElement);
window.addEventListener('orientationchange', () => setTimeout(layout, 300));
layout();

// ── Main loop ───────────────────────────────────────────────────────────────

let lastFrame = performance.now();
let perfFrames = 0;
let perfTime = 0;

function adaptQuality(dt: number) {
  if (settings.graphics !== 'auto' || state !== 'playing') return;
  perfFrames++;
  perfTime += dt;
  if (perfFrames < 150) return;
  const avg = perfTime / perfFrames;
  perfFrames = 0;
  perfTime = 0;
  if (avg > 1 / 45 && renderer.quality !== 'low') {
    renderer.setQuality(renderer.quality === 'high' ? 'medium' : 'low');
  }
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  if (state === 'paused') {
    if (layoutDirty) renderer.render();
    layoutDirty = false;
    return;
  }

  if (state === 'playing') {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) {
      targetX = sim.ballX + dir * C.KEY_SPEED * dt;
      sim.setBallX(targetX);
    }
    sim.update(dt);
  } else if (state === 'title') {
    sim.update(dt);
  } else {
    sim.update(dt * 0.18);
  }

  for (const ev of sim.events) {
    if (ev.type === 'death') onDeath(ev.x, ev.y, ev.color);
    else if (ev.type === 'level') {
      sound.levelUp();
      renderer.levelUp();
      flash('gold');
      showBanner(`Level ${ev.level}`, ev.tierUp ? 'Brick speeds now vary — hot colours fall faster' : '');
    } else if (ev.type === 'wave') {
      if (state === 'playing') sound.wave();
    } else if (ev.type === 'nearMiss') {
      closeCalls++;
      renderer.nearMiss(ev.x, ev.y);
      sound.nearMiss();
      if (settings.vibrate) navigator.vibrate?.(12);
    }
  }
  sim.events.length = 0;

  if (state === 'playing') {
    hudProgress.style.transform = `scaleX(${(sim.score % C.SCORE_PER_LEVEL) / C.SCORE_PER_LEVEL})`;
    const s = Math.floor(sim.score);
    if (s !== shownScore) {
      shownScore = s;
      hudScore.textContent = `${s}`;
      if (s > best && best > 0) hudBest.textContent = `${s}`;
    }
    if (sim.level !== shownLevel) {
      shownLevel = sim.level;
      hudLevel.textContent = `${sim.level}`;
      hudLevel.classList.remove('bump');
      void hudLevel.offsetWidth;
      hudLevel.classList.add('bump');
    }
  }

  updateCoach();
  adaptQuality(dt);
  renderer.update(sim, dt);
  renderer.render();
}

showScreen('title');
requestAnimationFrame(frame);

if (import.meta.env.DEV || location.search.includes('debug')) {
  Object.assign(window, { sim, renderer, store, sound, game: { get state() { return state; }, startGame, pause, resume } });
}
