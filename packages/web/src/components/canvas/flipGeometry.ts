import { type MeshGeometry } from 'pixi.js';

/**
 * Update a MeshGeometry's vertex positions and UVs for a perspective card flip.
 * @param geo   geometry to mutate in-place
 * @param cx    centre-X of the card in canvas pixels
 * @param cy    centre-Y of the card in canvas pixels
 * @param W     card width in pixels
 * @param H     card height in pixels
 * @param angle flip angle in radians (0 = face-on, π/2 = edge-on, π = flipped)
 * @param focal focal-length for perspective foreshortening (default 600)
 */
export function updateFlipVertices(
  geo: MeshGeometry,
  cx: number, cy: number,
  W: number, H: number,
  angle: number,
  focal = 600,
): void {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const half = W / 2;
  const lx = cx + (-half * cosA) * focal / (focal - half * sinA);
  const rx = cx + (half * cosA) * focal / (focal + half * sinA);
  const topY = cy - H / 2;
  const botY = cy + H / 2;
  // Mirror U coordinate when past the half-turn (back face becomes visible)
  const u0 = cosA >= 0 ? 0 : 1;
  const u1 = cosA >= 0 ? 1 : 0;
  geo.positions = new Float32Array([lx, topY, rx, topY, rx, botY, lx, botY]);
  geo.uvs = new Float32Array([u0, 0, u1, 0, u1, 1, u0, 1]);
}
