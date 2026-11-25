// Tactical Supply Credit coin glyph (money icon everywhere the UI shows credits). No imports:
// ui/styles.ts uses it in its own stylesheet.
/** Tactical gold supply credit medallion with 5-point star (32 × 32) */
export const COIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>`
  + `<circle cx='16' cy='16' r='15.4' fill='#7a5308'/><circle cx='16' cy='16' r='13.9' fill='#f0a500'/>`
  + `<circle cx='16' cy='16' r='11.4' fill='none' stroke='#b87700' stroke-width='1.4'/>`
  + `<path d='${"M16 7.5L18.4 12.6L24 13.4L19.9 17.3L20.9 22.9L16 20.2L11.1 22.9L12.1 17.3L8 13.4L13.6 12.6Z"}' fill='#2a1d04'/>`
  + `<path d='M7.6 11.2A9.6 9.6 0 0 1 14.6 6.5' stroke='#ffe59e' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>`;
export const COIN_URL = `url("data:image/svg+xml,${encodeURIComponent(COIN_SVG)}")`;
/** Tactical star emblem path in the coin's 32-unit frame */
export const BANANA_PATH = "M16 7.5L18.4 12.6L24 13.4L19.9 17.3L20.9 22.9L16 20.2L11.1 22.9L12.1 17.3L8 13.4L13.6 12.6Z";

/** the credit coin on a 2D canvas (map markers), centred on (x, y), radius r */
export function drawCoin(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const k = r / 16;
  g.save(); g.translate(x - 16 * k, y - 16 * k); g.scale(k, k);
  g.fillStyle = "#7a5308"; g.beginPath(); g.arc(16, 16, 15.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#f0a500"; g.beginPath(); g.arc(16, 16, 13.9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#b87700"; g.lineWidth = 1.4; g.beginPath(); g.arc(16, 16, 11.4, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#2a1d04"; g.fill(new Path2D(BANANA_PATH));
  g.restore();
}
