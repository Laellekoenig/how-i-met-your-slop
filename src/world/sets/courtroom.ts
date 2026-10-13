import * as THREE from 'three';
import { box, cyl, mesh, toon } from '../../engine/materials';
import { checker, paneling } from '../../engine/textures';
import { fillLight, keyLight, mark, nodes, type StageSet, v3 } from './common';
import { chair, label } from './furnishings';
import { interior, table } from './interior';
import { sconce, venuePattern } from './venueDetails';

/** Twelve Horny Women: paneled New York courtroom, diamond windows, two counsel tables. */
export function buildCourtroom(): StageSet {
  const g = new THREE.Group();
  g.name = 'courtroom';
  const wood = toon('#503727');
  const trim = toon('#76533b');
  const panels = toon('#ffffff', { map: paneling('#5c402f', [10, 2]) });
  interior(g, 16, 12, 4.8, toon('#ffffff', { map: checker('#9a7e62', '#76594a', [18, 18]) }), toon('#c8b99a'), '#968871');
  const paneledWall = (x: number, z: number, w: number, rot: number) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    group.add(mesh(new THREE.PlaneGeometry(w, 2.55), panels, 0, 1.275, 0));
    for (const y of [0.16, 1.28, 2.53]) group.add(mesh(box(w, 0.09, 0.07), trim, 0, y, 0.04));
    for (let dx = -w / 2 + 0.1; dx < w / 2; dx += 1.18) group.add(mesh(box(0.07, 2.5, 0.06), trim, dx, 1.25, 0.04));
    if (rot === Math.PI)
      group.traverse((o) => {
        o.userData.cameraBackdrop = true;
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.BoxGeometry) {
          const { width, height } = o.geometry.parameters;
          o.geometry.dispose();
          o.geometry = new THREE.PlaneGeometry(width, height);
          o.castShadow = false;
        }
      });
    g.add(group);
  };
  paneledWall(0, -5.96, 16, 0);
  paneledWall(-7.96, 0.8, 13.5, Math.PI / 2);
  paneledWall(7.96, 0.8, 13.5, -Math.PI / 2);
  paneledWall(0, 7.76, 16, Math.PI);
  // Tall frosted windows and deep fluted wood pilasters on the judge's wall.
  const glass = toon('#ffffff', { map: venuePattern('lattice', [1, 2]), emissive: '#b5bcaa', emissiveIntensity: 0.14 });
  for (const x of [-5.5, -3.4, 3.4, 5.5]) {
    g.add(mesh(box(1.52, 2.8, 0.1), wood, x, 3.0, -5.84));
    g.add(mesh(new THREE.PlaneGeometry(1.29, 2.58), glass, x, 3.0, -5.78));
    g.add(mesh(box(1.4, 0.07, 0.07), trim, x, 2.65, -5.7));
  }
  for (const x of [-7.4, -2.2, 2.2, 7.4]) {
    g.add(mesh(box(0.32, 4.4, 0.19), wood, x, 2.2, -5.72));
    for (const dx of [-0.1, 0, 0.1]) g.add(mesh(box(0.025, 3.85, 0.045), trim, x + dx, 2.18, -5.61));
    for (const y of [0.2, 4.25]) g.add(mesh(box(0.47, 0.19, 0.3), trim, x, y, -5.64));
    sconce(g, x, 2.85, -5.52);
  }
  // Bench, witness box, and New York / US flags.
  g.add(mesh(box(4.25, 0.26, 2.0), wood, 0, 0.13, -4.95));
  g.add(mesh(box(4.05, 1.03, 0.57), panels, 0, 0.775, -4.2));
  g.add(mesh(box(4.3, 0.1, 0.8), trim, 0, 1.33, -4.2));
  chair(g, 0, -5.15, 0, '#262828', 0.26).scale.y = 1.3;
  for (const x of [-1.45, 1.45])
    for (let i = 0; i < 4; i++) g.add(mesh(box(0.1, 0.27, 0.2), toon(i % 2 ? '#4b3427' : '#626147'), x + i * 0.11, 1.51, -4.22));
  const seal = mesh(cyl(0.48, 0.48, 0.055, 24), toon('#a48545'), 0, 3.55, -5.8).rotateX(Math.PI / 2);
  g.add(seal);
  label(g, 'NEW YORK', 0, 3.54, -5.75, 0.75, 0.2, '#e3c998', '#725a32');
  label(g, 'STATE COURT', 0, 0.88, -3.903, 1.6, 0.2, '#c6ae78', '#4c3426');
  for (const [x, color] of [
    [-2.65, '#283e64'],
    [2.65, '#b7afa0'],
  ] as const) {
    g.add(mesh(cyl(0.02, 0.02, 3.7, 8), toon('#b29a61'), x, 1.85, -5.3));
    g.add(mesh(box(0.62, 1.6, 0.035), toon(color), x + 0.3, 2.6, -5.3));
    if (x > 0) {
      for (let i = 0; i < 7; i++) g.add(mesh(box(0.62, 0.075, 0.04), toon('#9e4c4b'), x + 0.3, 1.85 + i * 0.225, -5.27));
      g.add(mesh(box(0.3, 0.68, 0.05), toon('#364669'), x + 0.14, 3.02, -5.24));
    } else label(g, 'EXCELSIOR', x + 0.3, 2.65, -5.27, 0.56, 0.18, '#c6ac64', color);
  }
  chair(g, -5, -4.65, 0, '#413632');
  g.add(mesh(box(0.1, 0.9, 1.15), wood, -5.68, 0.45, -4.5));
  g.add(mesh(box(1.45, 0.1, 0.14), trim, -5, 0.9, -3.96));
  for (let i = 0; i < 8; i++) g.add(mesh(cyl(0.025, 0.045, 0.8, 8), wood, -5.6 + i * 0.17, 0.4, -3.96));
  // Separate counsel tables leave a real central aisle for Marshall's argument.
  for (const x of [-2.9, 2.9]) {
    table(g, x, -0.95, 2.9, 1.35, 0.78, '#563b2c');
    for (const dx of [-0.58, 0.58]) {
      chair(g, x + dx, -2.05, 0, '#303230');
      g.add(mesh(box(0.38, 0.012, 0.28), toon('#d7d2bb'), x + dx, 0.825, -1.1).rotateY(0.13));
    }
    g.add(mesh(cyl(0.075, 0.09, 0.23, 12), toon('#b3b4ab'), x + 0.95, 0.94, -0.85));
    g.add(mesh(cyl(0.035, 0.035, 0.11, 8), toon('#c0c5b4'), x + 0.73, 0.89, -0.75));
    g.add(mesh(box(0.46, 0.065, 0.28), toon('#372f28'), x - 0.9, 0.85, -0.8));
  }
  // Jury box to camera right, not behind the judge.
  g.add(mesh(box(0.12, 0.65, 3.25), panels, 5.48, 0.325, -2.8));
  g.add(mesh(box(0.22, 0.09, 3.4), trim, 5.48, 0.69, -2.8));
  for (const z of [-3.85, -2.7, -1.55]) chair(g, 6.5, z, -Math.PI / 2, '#685043');
  // Gallery and a central gate. Reverse angles see paneling, timber doors and spectators.
  for (const sx of [-1, 1]) {
    g.add(mesh(box(6.2, 0.12, 0.18), trim, sx * 4.45, 0.91, 3.65));
    for (let i = 0; i < 15; i++) g.add(mesh(cyl(0.035, 0.055, 0.83, 8), wood, sx * (1.6 + i * 0.4), 0.43, 3.65));
    for (const z of [4.5, 5.8]) for (let i = 0; i < 4; i++) chair(g, sx * (2 + i * 1.2), z, Math.PI, '#66503d');
    const door = mesh(new THREE.PlaneGeometry(1.0, 2.55), wood, sx * 0.53, 1.275, 7.72).rotateY(Math.PI);
    door.userData.cameraBackdrop = true;
    g.add(door);
  }
  // Circular bronze ceiling fixtures from the courtroom stills.
  for (const x of [-3.5, 3.5]) {
    g.add(mesh(cyl(0.016, 0.016, 1, 6), toon('#514738'), x, 4.3, 0));
    g.add(mesh(cyl(0.65, 0.55, 0.12, 24), toon('#b8a17c'), x, 3.81, 0));
    g.add(mesh(cyl(0.52, 0.52, 0.025, 24), toon('#e3d7b2', { emissive: '#ddcaa0', emissiveIntensity: 0.5 }), x, 3.74, 0));
  }
  g.add(new THREE.HemisphereLight('#e6d9bd', '#665343', 1.7));
  keyLight(g, '#fff0d3', 2.7, [-5, 8, 4], [0, 1, -2]);
  fillLight(g, '#fff0d3', 1.2, [1, 8, -8], [0, 1, 2]);
  return {
    id: 'courtroom',
    name: 'New York Courtroom',
    group: g,
    nodes: nodes({
      door: [0, 6.5],
      gallery: [0, 4.6],
      front: [0, 2],
      center: [0, -0.9],
      back: [0, -2.95],
      left: [-3.4, -2.95],
      witness: [-4, -3.3],
      bench_side: [-3.3, -5.15],
      judge: [-1, -5.15],
      right: [4.9, -2.95],
      jury_front: [4.9, -0.5],
      jury: [6.55, -0.5],
    }),
    edges: [
      ['door', 'gallery'],
      ['gallery', 'front'],
      ['front', 'center'],
      ['center', 'back'],
      ['back', 'left'],
      ['left', 'witness'],
      ['left', 'bench_side'],
      ['bench_side', 'judge'],
      ['back', 'right'],
      ['right', 'jury_front'],
      ['jury_front', 'jury'],
    ],
    door: 'door',
    floorAt(x, z) {
      return Math.abs(x) < 2.125 && z < -3.95 && z > -5.96 ? 0.26 : 0;
    },
    marks: {
      counsel: mark(-3.48, -2.05, 0, 'left', 'Marshall at the counsel table', { seat: 0.49, approach: [-3.48, -2.95] }),
      client: mark(-2.32, -2.05, 0, 'back', 'next to Marshall', { seat: 0.49, approach: [-2.32, -2.95] }),
      opposing_counsel: mark(2.32, -2.05, 0, 'back', 'Brad at the opposite table', { seat: 0.49, approach: [2.32, -2.95] }),
      opposing_client: mark(3.48, -2.05, 0, 'right', 'opposing client', { seat: 0.49, approach: [3.48, -2.95] }),
      argument: mark(0, -1.4, Math.PI, 'center', 'addressing the judge in the clear center aisle'),
      witness: mark(-5, -4.65, 0, 'witness', 'the witness chair', { seat: 0.49, approach: [-4, -4.65] }),
      judge: mark(0, -5.15, 0, 'judge', 'behind the raised judge’s bench', { seat: 0.64, approach: [-1, -5.15] }),
      jury: mark(6.5, -1.55, -Math.PI / 2, 'jury', 'front jury seat', { seat: 0.49, approach: [6.5, -0.5] }),
      gallery_left: mark(-2, 4.5, Math.PI, 'gallery', 'watching Marshall from the gallery', { seat: 0.49, approach: [-1.2, 4.5] }),
      gallery_right: mark(2, 4.5, Math.PI, 'gallery', 'gallery, other side of the aisle', { seat: 0.49, approach: [1.2, 4.5] }),
      door: mark(0, 6.5, Math.PI, 'door', 'entering through the rear courtroom doors'),
    },
    wides: [
      { pos: v3(0, 3.2, 9.5), target: v3(0, 1.65, -1.9), fov: 59 },
      { pos: v3(0, 2.8, 3.05), target: v3(0, 1.45, -3.6), fov: 65 },
      { pos: v3(0, 2.5, -3.3), target: v3(0, 1.15, 3.2), fov: 62 },
    ],
    ambience: 'office',
    background: [],
    reserved: ['judge', 'jury'],
    maxTwoShotDistance: 6,
    doorSound: 'none',
    setTime() {},
  };
}
