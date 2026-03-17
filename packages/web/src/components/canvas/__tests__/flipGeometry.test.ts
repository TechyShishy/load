import { describe, it, expect } from 'vitest';
import { updateFlipVertices } from '../flipGeometry.js';
import type { MeshGeometry } from 'pixi.js';

/** Minimal stand-in for MeshGeometry — only the writable properties the function touches. */
function fakeGeo(): MeshGeometry {
  return { positions: new Float32Array(8), uvs: new Float32Array(8) } as unknown as MeshGeometry;
}

describe('updateFlipVertices', () => {
  it('face-on (angle = 0): vertices span full width symmetrically, UVs are unmirrored', () => {
    const geo = fakeGeo();
    // cx=100, cy=100, W=90, H=120, angle=0
    // half=45; focal default 600
    // lx = 100 + (-45 * 1) * 600 / 600 = 55
    // rx = 100 + (45 * 1) * 600 / 600 = 145
    updateFlipVertices(geo, 100, 100, 90, 120, 0);
    const pos = Array.from(geo.positions);
    expect(pos[0]).toBeCloseTo(55);   // lx
    expect(pos[2]).toBeCloseTo(145);  // rx
    expect(pos[1]).toBeCloseTo(40);   // topY
    expect(pos[7]).toBeCloseTo(160);  // botY
    // UVs not mirrored at angle=0 (cosA=1 >= 0)
    expect(geo.uvs[0]).toBe(0);
    expect(geo.uvs[2]).toBe(1);
  });

  it('edge-on (angle = π/2): lx and rx both collapse to cx', () => {
    const geo = fakeGeo();
    updateFlipVertices(geo, 100, 100, 90, 120, Math.PI / 2);
    // cosA ≈ 0, sinA = 1 → lx = cx, rx = cx
    expect(geo.positions[0]).toBeCloseTo(100); // lx ≈ cx
    expect(geo.positions[2]).toBeCloseTo(100); // rx ≈ cx
  });

  it('fully flipped (angle = π): lx and rx swap, UVs are mirrored', () => {
    const geo = fakeGeo();
    updateFlipVertices(geo, 100, 100, 90, 120, Math.PI);
    const pos = Array.from(geo.positions);
    // cosA=-1, sinA≈0: lx = cx + half = 145, rx = cx - half = 55 (swapped vs angle=0)
    expect(pos[0]).toBeCloseTo(145); // lx
    expect(pos[2]).toBeCloseTo(55);  // rx
    expect(pos[1]).toBeCloseTo(40);  // topY unchanged
    expect(pos[7]).toBeCloseTo(160); // botY unchanged
    // UVs mirrored (cosA = -1 < 0)
    expect(geo.uvs[0]).toBe(1);
    expect(geo.uvs[2]).toBe(0);
  });

  it('custom focal length changes perspective compression', () => {
    const geoDefault = fakeGeo();
    const geoNarrow = fakeGeo();
    const angle = Math.PI / 4;
    updateFlipVertices(geoDefault, 0, 0, 90, 120, angle);         // focal=600 default
    updateFlipVertices(geoNarrow, 0, 0, 90, 120, angle, 100);    // focal=100, stronger distortion
    // Narrower focal = more perspective = wider spread on one side, narrower on the other
    // Just assert the two produce different results
    expect(geoNarrow.positions[0]).not.toBeCloseTo(geoDefault.positions[0]!);
  });
});
