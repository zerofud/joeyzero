/**
 * Joey Zero — Interactive webcam microsite
 *
 * State machine:
 *   IDLE  →  WALKUP  →  WAITING_INPUT  →  ANSWERING  →  IDLE
 */

const VIDEO_SRC = {
  idle:    'videos/idle.mp4',
  walkup:  'videos/walkup.mp4',
  answer:  'videos/answer.mp4',
};

const WORD_INTERVAL_MS   = 110;   // ms between each revealed word
const POST_ANSWER_DELAY  = 2800;  // ms before returning to idle after answer ends

// ── DOM refs ────────────────────────────────────────────────────────────────
const video     = document.getElementById('main-video');
const subtitles = document.getElementById('subtitle-overlay');
const form      = document.getElementById('question-form');
const input     = document.getElementById('question-input');
const submitBtn = document.getElementById('submit-btn');
const hint      = document.getElementById('click-hint');

// ── State ────────────────────────────────────────────────────────────────────
let state = 'IDLE';
let subtitleTimer = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadVideo(src, { loop = false, muted = true, autoplay = true } = {}) {
  video.loop    = loop;
  video.muted   = muted;
  video.src     = src;
  if (autoplay) video.play().catch(() => {});
}

function clearSubtitleTimer() {
  if (subtitleTimer) {
    clearTimeout(subtitleTimer);
    subtitleTimer = null;
  }
}

function hideSubtitles() {
  clearSubtitleTimer();
  subtitles.classList.remove('visible');
  subtitles.textContent = '';
}

/**
 * Reveal `text` word-by-word, then call `onDone` when finished.
 */
function showSubtitles(text, onDone) {
  hideSubtitles();

  const words = text.trim().split(/\s+/);
  let i = 0;
  let revealed = '';

  subtitles.classList.add('visible');

  function revealNext() {
    if (i >= words.length) {
      subtitleTimer = setTimeout(() => {
        hideSubtitles();
        if (onDone) onDone();
      }, POST_ANSWER_DELAY);
      return;
    }
    revealed += (i === 0 ? '' : ' ') + words[i++];
    subtitles.textContent = revealed;
    subtitleTimer = setTimeout(revealNext, WORD_INTERVAL_MS);
  }

  revealNext();
}

// ── State transitions ────────────────────────────────────────────────────────
function enterIdle() {
  state = 'IDLE';
  hideSubtitles();
  loadVideo(VIDEO_SRC.idle, { loop: true });

  // Re-enable click-to-start behaviour
  form.classList.add('idle-clickable');
  input.disabled  = true;
  input.value     = '';
  submitBtn.disabled = true;
  hint.classList.remove('hidden');
}

function enterWalkup() {
  state = 'WALKUP';
  form.classList.remove('idle-clickable');
  input.disabled = true;
  submitBtn.disabled = true;
  hint.classList.add('hidden');

  loadVideo(VIDEO_SRC.walkup, { loop: false });

  video.addEventListener('ended', onWalkupEnded, { once: true });
}

function onWalkupEnded() {
  enterWaitingInput();
}

function enterWaitingInput() {
  state = 'WAITING_INPUT';
  loadVideo(VIDEO_SRC.answer, { loop: true });

  input.disabled     = false;
  submitBtn.disabled = false;
  input.focus();
}

async function enterAnswering(question) {
  state = 'ANSWERING';
  input.disabled     = true;
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  // answer.mp4 should already be looping from WAITING_INPUT
  if (video.src !== location.origin + '/' + VIDEO_SRC.answer) {
    loadVideo(VIDEO_SRC.answer, { loop: true });
  }

  let answer;
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');
    answer = data.answer;
  } catch (err) {
    answer = "Sorry, something went wrong on my end. Try again in a moment.";
    console.error(err);
  }

  submitBtn.classList.remove('loading');
  showSubtitles(answer, () => enterIdle());
}

// ── Event listeners ──────────────────────────────────────────────────────────

// Clicking anywhere on the form while in IDLE triggers the walk-up sequence
form.addEventListener('click', (e) => {
  if (state !== 'IDLE') return;
  e.preventDefault();
  enterWalkup();
});

// Submitting the question
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (state !== 'WAITING_INPUT') return;
  const q = input.value.trim();
  if (!q) return;
  enterAnswering(q);
});

// ── Boot ─────────────────────────────────────────────────────────────────────
enterIdle();
