# Joey Zero

An interactive personal microsite. A visitor sees a looping video of you at your desk. When they click the input box, a walk-up clip plays, then they can type a question which you answer via animated subtitles powered by the Claude API.

> **Also in this repo:** [South Beach Delivery](south-beach-delivery/README.md), a GTA 2 style delivery game that deploys to Netlify.

---

## Setup

```bash
npm install
cp .env.example .env
# edit .env and add your CLAUDE_API_KEY
npm start
# open http://localhost:3000
```

---

## Video Files to Record

Place these three files in `public/videos/`. All should be **MP4** (H.264), landscape orientation, and filmed from a fixed camera position so the cuts look seamless.

| Filename | What to record | Duration | Notes |
|---|---|---|---|
| `idle.mp4` | You at your desk, relaxed — maybe a slight natural shift or glance | 8–15 sec | **Loops continuously.** Keep movement subtle so the loop isn't distracting. |
| `walkup.mp4` | Start off-camera (or turned away), then walk/turn toward your desk and sit down, ending with you looking directly into the camera | 5–10 sec | **Plays once** when the visitor clicks the input box. The last frame should match the first frame of `answer.mp4` so the cut is seamless. |
| `answer.mp4` | You sitting attentively at your desk, looking at the camera — minimal movement (breathing, blinking) | 8–15 sec | **Loops** while your answer subtitle plays. |

### Tips
- Film all three clips in the same session so lighting and framing are consistent.
- Use a plain or blurred background to keep focus on you.
- Shoot at 1080p (1920×1080) or higher; the video fills the full browser viewport.
- The videos are **muted** by default (no audio needed).
- `.mp4` files are gitignored — commit them separately or host them on a CDN.

---

## How It Works

```
Page load    → idle.mp4 loops
Click input  → walkup.mp4 plays once
Walkup ends  → answer.mp4 loops, input unlocked
Submit question → Claude API answers → subtitles animate word-by-word
Subtitles end  → idle.mp4 loops again
```

---

## Configuration

| Env var | Description |
|---|---|
| `CLAUDE_API_KEY` | Your Anthropic API key |
| `PORT` | Port to run the server on (default: `3000`) |

The system prompt in `server.js` instructs Claude to respond as you — concisely and conversationally. Edit it to match your personality.
