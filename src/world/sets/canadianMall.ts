import * as THREE from 'three';
import { box, cyl, mesh, toon } from '../../engine/materials';
import { tiles } from '../../engine/textures';
import { fillLight, keyLight, mark, nodes, plant, type StageSet, v3 } from './common';
import { label } from './furnishings';
import { ceilingPanel, interior } from './interior';

/** A 1990 Canadian mall atrium, ready for a Robin Sparkles performance. */
export function buildCanadianMall(): StageSet {
  const g = new THREE.Group(); g.name = 'canadian_mall';
  const cream = toon('#e5d8bf'), pink = toon('#c993a1'), teal = toon('#6ea5a1');
  interior(g, 17, 11, 5.3, toon('#ffffff', { map: tiles('#dfd0b7', '#b2a598', [18, 18]) }), cream, '#ddd9c6');
  // Storefronts and inset displays use period pastel fascia, brass, and glass blocks.
  for (const [x, title, color, kind] of [
    [-5.6, 'MAPLE MUSIC', '#507f80', 'music'], [0, 'LA CHOCOLATIÈRE', '#a06378', 'chocolate'], [5.6, 'FOREVER DENIM', '#667c9e', 'clothes'],
  ] as const) {
    g.add(mesh(box(4.9, 2.83, 0.19), toon('#536065'), x, 1.42, -5.35));
    g.add(mesh(box(4.72, 2.65, 0.05), toon('#334b51'), x, 1.4, -5.23));
    g.add(mesh(box(5.05, 0.76, 0.35), toon(color), x, 3.1, -5.18));
    label(g, title, x, 3.14, -4.989, 4.5, 0.36, '#fff2d4', color, 'bold 45px Georgia');
    for (const dx of [-2.3, -0.7, 0.7, 2.3]) g.add(mesh(box(0.055, 2.6, 0.12), toon('#b9a776'), x + dx, 1.42, -5.12));
    g.add(mesh(box(4.9, 0.09, 0.3), toon('#c1b087'), x, 0.08, -5.13));
    if (kind === 'music') {
      for (let i = 0; i < 7; i++) {
        g.add(mesh(box(0.46, 0.46, 0.06), toon(['#c4987c', '#947493', '#87a785'][i % 3]), x - 1.9 + i * 0.62, 1.6, -5.16));
        g.add(mesh(new THREE.CircleGeometry(0.13, 12), toon('#243039'), x - 1.9 + i * 0.62, 1.6, -5.12));
      }
      label(g, 'CASSETTES  •  RECORDS', x, 0.85, -5.1, 3.4, 0.24, '#e9c89b', '#334b51');
    } else if (kind === 'chocolate') {
      g.add(mesh(box(3.9, 0.6, 0.12), toon('#785a45'), x, 0.66, -5.13));
      for (let i = 0; i < 9; i++) g.add(mesh(box(0.3, 0.22, 0.13), toon(i % 2 ? '#c7a268' : '#b67d82'), x - 1.7 + i * 0.42, 1.1, -5.12));
    } else {
      for (const dx of [-1.65, 1.65]) {
        g.add(mesh(box(0.42, 0.65, 0.08), toon('#83a5b7'), x + dx, 1.65, -5.13));
        for (const sx of [-1, 1]) g.add(mesh(box(0.15, 0.56, 0.08), toon('#74919e'), x + dx + sx * 0.13, 1.08, -5.13));
      }
      label(g, 'TOTALLY NEW!', x, 2.23, -5.09, 2.15, 0.25, '#f2d68a', '#334b51');
    }
  }
  // Raised clerestory, pink columns, and the big atrium banner.
  for (const x of [-8, -2.8, 2.8, 8]) {
    g.add(mesh(cyl(0.22, 0.22, 4.5, 10), pink, x, 2.25, -4.5));
    for (const y of [0.13, 4.38]) g.add(mesh(cyl(0.36, 0.36, 0.2, 10), cream, x, y, -4.5));
  }
  g.add(mesh(box(16.6, 0.15, 0.42), teal, 0, 3.68, -5.14));
  for (let i = 0; i < 16; i++) g.add(mesh(box(0.74, 0.92, 0.04), toon('#94b2b1', { emissive: '#8da9a0', emissiveIntensity: 0.2 }), -7.5 + i, 4.49, -5.38));
  label(g, 'MAPLE LEAF GALLERIA', 0, 4.53, -4.92, 6.8, 0.43, '#5a7370', '#e4d6bb', 'bold 43px Georgia');
  label(g, 'SUMMER 1990  /  LIVE AT THE MALL', 0, 3.99, -4.91, 5.4, 0.28, '#995b76', '#e4d6bb');
  // The opposite concourse appears in audience reactions and reverse shoulders.
  // Every piece is one-sided so the master can shoot through its back.
  for (const [x, title] of [[-5.5, 'FOOD COURT'], [0, 'ARCADE'], [5.5, 'PHOTO STUDIO']] as const) {
    const glass = mesh(new THREE.PlaneGeometry(4.8, 2.4), toon('#729793'), x, 1.35, 7.27, false).rotateY(Math.PI);
    glass.userData.cameraBackdrop = true; g.add(glass);
    const fascia = label(g, title, x, 2.94, 7.26, 4.9, 0.48, '#f5e6c9', '#a16c83', 'bold 48px Georgia').rotateY(Math.PI);
    fascia.userData.cameraBackdrop = true;
    for (const dx of [-1.5, 0, 1.5]) {
      const mullion = mesh(new THREE.PlaneGeometry(0.05, 2.4), toon('#c7b78c'), x + dx, 1.35, 7.25, false).rotateY(Math.PI);
      mullion.userData.cameraBackdrop = true; g.add(mullion);
    }
  }

  // Low performance dais, with a clear step-free route at the shallow height.
  g.add(mesh(cyl(1.8, 1.85, 0.18, 12), pink, 0, 0.09, -1.5));
  g.add(mesh(cyl(1.75, 1.75, 0.025, 12), toon('#d9b8bc'), 0, 0.193, -1.5));
  for (const x of [-2.5, 2.5]) {
    g.add(mesh(box(0.65, 1.05, 0.56), toon('#343749'), x, 0.525, -2.3));
    for (const y of [0.33, 0.78]) g.add(mesh(new THREE.CircleGeometry(0.2, 12), toon('#171f30'), x, y, -2.01));
  }
  label(g, 'ROBIN SPARKLES', 0, 0.105, 0.329, 2.5, 0.15, '#f7e8d3', '#a06183');
  // Canadian flag beside the stage; maple-leaf silhouette is original vector geometry.
  const flag = new THREE.Group(); flag.position.set(-4.0, 2.15, -3.8);
  flag.add(mesh(box(1.5, 0.86, 0.025), toon('#f1e6d3')));
  for (const x of [-0.57, 0.57]) flag.add(mesh(box(0.36, 0.86, 0.03), toon('#ba3e49'), x));
  const leaf = new THREE.Shape();
  const points = [[0, 0.33], [0.09, 0.15], [0.18, 0.2], [0.15, 0.03], [0.29, 0.08], [0.23, -0.05], [0.29, -0.1], [0.06, -0.2], [0.025, -0.2], [0.025, -0.31], [-0.025, -0.31], [-0.025, -0.2], [-0.06, -0.2], [-0.29, -0.1], [-0.23, -0.05], [-0.29, 0.08], [-0.15, 0.03], [-0.18, 0.2], [-0.09, 0.15]];
  points.forEach(([x, y], i) => i ? leaf.lineTo(x, y) : leaf.moveTo(x, y)); leaf.closePath();
  flag.add(mesh(new THREE.ShapeGeometry(leaf), toon('#ba3e49'), 0, 0, 0.018)); g.add(flag);
  // Planters, slatted benches, and a pastel mall directory.
  for (const x of [-6.5, 6.5]) {
    g.add(mesh(cyl(0.61, 0.48, 0.58, 10), cream, x, 0.29, -1.9)); plant(g, x, -1.9, 2.8);
    for (let i = 0; i < 5; i++) g.add(mesh(box(2.35, 0.09, 0.11), toon('#a17c59'), x, 0.47, 0.7 + i * 0.14));
    for (const dx of [-0.86, 0.86]) g.add(mesh(box(0.09, 0.44, 0.62), teal, x + dx, 0.22, 0.98));
  }
  g.add(mesh(box(0.85, 1.65, 0.24), teal, 4.5, 0.825, 1.8));
  label(g, 'YOU ARE HERE', 4.5, 1.4, 1.927, 0.76, 0.22, '#e6d8c0', '#547a79');
  label(g, 'FOOD COURT  →', 4.5, 0.99, 1.928, 0.76, 0.19, '#7b5770', '#e4d4b9');
  label(g, 'RECORDS  ←', 4.5, 0.67, 1.928, 0.76, 0.19, '#7b5770', '#e4d4b9');
  for (const x of [-5, 0, 5]) ceilingPanel(g, x, 5.23, 0, 2.5, 2);
  const hemi = new THREE.HemisphereLight('#f2e7d4', '#848177', 1.85); g.add(hemi);
  keyLight(g, '#ffe6cd', 2.5, [-4, 8, 5], [0, 0, -1]);
  fillLight(g, '#ffe6cd', 1.1, [1, 7, -8], [0, 1, 2]);
  return {
    id: 'canadian_mall', name: 'Canadian Mall · 1990', group: g,
    nodes: nodes({ door: [6, -3.7], back: [0, -3.8], back_left: [-3.8, -3.8], left: [-3.8, -1], right: [3.8, -1], stage: [0, -1.5], front: [0, 1.7], bench_left: [-5.9, 1.85], bench_right: [5.9, 1.85], directory: [3.4, 2.8], front_right: [5.9, 2.8] }),
    edges: [['door', 'back'], ['door', 'right'], ['back', 'back_left'], ['back_left', 'left'], ['left', 'front'], ['right', 'front'], ['front', 'stage'], ['front', 'bench_left'], ['front', 'directory'], ['directory', 'front_right'], ['front_right', 'bench_right']], door: 'door',
    floorAt(x, z) { return Math.hypot(x, z + 1.5) < 1.78 ? 0.205 : 0; },
    marks: {
      stage: mark(0, -1.45, 0, 'stage', 'Robin Sparkles performing on the low pink dais'),
      dancer_left: mark(-1.1, -1.4, 0.1, 'stage', 'left side of the performance dais'),
      dancer_right: mark(1.1, -1.4, -0.1, 'stage', 'right side of the performance dais'),
      audience: mark(-0.9, 1.65, Math.PI, 'front', 'watching Robin perform'),
      friend: mark(0.9, 1.65, Math.PI, 'front', 'beside the audience, facing the stage'),
      bench: mark(-6.35, 1.02, 0, 'bench_left', 'sitting on the mall bench', { seat: 0.52, approach: [-6.35, 1.85], depth: 0.3 }),
      directory: mark(3.4, 2.15, -0.5, 'directory', 'beside the mall directory'),
      door: mark(6, -3.7, 0, 'door', 'arriving from the mall concourse'),
    },
    maxTwoShotDistance: 6.5,
    wides: [
      { pos: v3(0, 2.4, 10.4), target: v3(0, 1.6, -2.2), fov: 49 },
      { pos: v3(0, 2.25, 5.1), target: v3(0, 1.3, -1.5), fov: 49 },
      { pos: v3(-2.3, 2.2, -1.4), target: v3(0, 1.3, 1.6), fov: 57 },
    ], ambience: 'city', background: [], doorSound: 'none',
    setTime(t) { hemi.intensity = t === 'day' ? 1.85 : 1.4; },
  };
}
