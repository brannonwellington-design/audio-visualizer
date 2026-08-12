# Speech Dot Grid

Mic-driven speech energy visualizer styled as a product recorder card. Speak into the microphone and watch a live dot-grid waveform; pause to freeze a frame, then copy or export it.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL Vite prints, then allow microphone access when the browser asks.

**Build / preview**

```bash
npm run build
npm run preview
```

## How to use

1. Click **Record** and grant mic permission.
2. Speak — energy in the voice band (~80 Hz–3.4 kHz) drives the grid.
3. **Pause** freezes the frame (mic stays open); **Resume** continues.
4. Export the current frame with **Copy SVG**, **Export SVG**, or **Export PNG**.

On viewports ≤768px, settings move into a bottom sheet opened from the gear button. The canvas width follows the card slot (up to the **Max width** control), so on-screen dots and exports stay aligned.

## Visualizer modes

| Mode | Idea |
|------|------|
| Chronological | History scrolls left; new energy enters on the right |
| Center-out | Energy expands from the center |
| Seismograph | Sweeping trace |
| Spectrum | Soft multi-band spectrum |
| Static | Ripple diffusion from center |
| String | Vibrating string |
| Radial | Spokes from center |

**Dot style:** Binary (on/off) or Sub-states (partial growth by threshold).

## Settings

The side panel (desktop) / drawer (mobile) covers:

- **Mode** — view type and mode-specific pace/taper/ripple controls
- **Grid** — max width, height, columns, rows, dot size
- **Color** — active / inactive dots
- **Feel** — attack, release, noise gate, sensitivity

## Stack

React 19 · TypeScript · Vite · Canvas 2D · Web Audio (`getUserMedia` + `AnalyserNode`)

No backend. Audio never leaves the browser.

## Accessibility notes

- Recorder timer announces state via a polite live region
- Errors use `role="alert"`
- Settings drawer is a dialog (Escape closes; focus returns to the opener)
- UI motion respects `prefers-reduced-motion` (button/drawer transitions)
- Canvas is labeled as an image for assistive tech

The live waveform still updates while recording — that motion is the product.
