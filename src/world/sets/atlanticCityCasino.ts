import * as THREE from 'three';
import { box, cyl, glow, mesh, roundedBox, toon } from '../../engine/materials';
import { speckle } from '../../engine/textures';
import { fillLight, keyLight, mark, nodes, type StageSet, v3 } from './common';
import { label } from './furnishings';
import { interior } from './interior';
import { roundSeat, sconce, venuePattern } from './venueDetails';

/** Atlantic City / The Bro Mitzvah: ornate casino and Barney's elaborate Chinese game. */
export function buildAtlanticCityCasino(): StageSet {
  const g = new THREE.Group();
  g.name = 'atlantic_city_casino';
  const gold = toon('#b38d4d');
  const dark = toon('#25222a');
  const wallpaper = toon('#ffffff', { map: venuePattern('casino', [17, 5]) });
  interior(g, 15, 11, 4.4, toon('#ffffff', { map: speckle('#603443', [8, 8], 88, 0.35) }), wallpaper, '#443126');
  for (const x of [-6.7, -3.5, 0, 3.5, 6.7]) {
    g.add(mesh(box(0.28, 3.9, 0.2), gold, x, 1.95, -5.3));
    for (const dx of [-0.08, 0, 0.08]) g.add(mesh(box(0.018, 3.5, 0.03), toon('#e1c082'), x + dx, 1.95, -5.18));
    for (const y of [0.2, 3.85]) g.add(mesh(box(0.5, 0.18, 0.3), gold, x, y, -5.27));
  }
  // Marquee frames and the little incandescent bulbs seen around the slot banks.
  for (const x of [-4.9, 0, 4.9]) {
    for (const dx of [-1.3, 1.3]) g.add(mesh(box(0.055, 2.3, 0.08), gold, x + dx, 2.3, -5.24));
    for (const y of [1.15, 3.45]) {
      g.add(mesh(box(2.65, 0.055, 0.08), gold, x, y, -5.24));
      for (let i = 0; i < 14; i++)
        g.add(mesh(new THREE.SphereGeometry(0.028, 5, 4), glow('#ffe0a0'), x - 1.22 + i * 0.188, y, -5.17, false));
    }
    sconce(g, x, 3.85, -5.18);
  }
  const slots: THREE.Mesh[] = [];
  for (const [index, x] of [-5.75, -4.55, -1.2, 0, 1.2, 4.55, 5.75].entries()) {
    g.add(mesh(box(0.92, 1.23, 0.64), dark, x, 0.615, -4.75));
    g.add(mesh(box(0.96, 0.93, 0.49), gold, x, 1.65, -4.85));
    g.add(mesh(box(0.85, 0.81, 0.045), dark, x, 1.65, -4.58));
    const color = ['#894769', '#376c75', '#566d37'][index % 3];
    const screen = label(g, '7  ♦  7', x, 1.66, -4.545, 0.72, 0.34, '#e7cf85', color, 'bold 50px Georgia');
    slots.push(screen);
    label(g, index % 2 ? 'JACKPOTS' : '$5,000', x, 2.07, -4.56, 0.85, 0.22, '#ffe794', color);
    g.add(mesh(box(0.94, 0.12, 0.84), dark, x, 1.1, -4.54));
    for (const dx of [-0.24, 0, 0.24]) g.add(mesh(cyl(0.042, 0.042, 0.02, 8), glow(dx ? '#e0b057' : '#d96975'), x + dx, 1.18, -4.26));
    roundSeat(g, x, -3.64, Math.PI, 0.64, true, false, 0.12);
  }
  // More slots along the side wall, facing into the gaming floor.
  for (const side of [-1, 1])
    for (const z of [-1.9, -0.5, 1.0]) {
      const bank = new THREE.Group();
      bank.position.set(side * 6.8, 0, z);
      bank.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      bank.add(mesh(box(0.95, 2.1, 0.6), dark, 0, 1.05, 0));
      bank.add(mesh(box(0.88, 0.98, 0.08), gold, 0, 1.5, 0.33));
      label(bank, '7  7  7', 0, 1.57, 0.38, 0.73, 0.38, '#e8daaa', '#4c526e', 'bold 45px Georgia');
      label(bank, 'JACKPOT', 0, 2.03, 0.38, 0.9, 0.2, '#ecca82', '#713954');
      bank.add(mesh(box(0.96, 0.1, 0.84), dark, 0, 0.98, 0.15));
      g.add(bank);
    }
  for (const z of [-2.5, 2.0]) {
    g.add(mesh(box(14.8, 0.17, 0.28), gold, 0, 4.05, z));
    for (const x of [-4, 0, 4]) {
      g.add(mesh(cyl(0.035, 0.035, 0.6, 6), gold, x, 3.9, z));
      g.add(mesh(cyl(0.43, 0.6, 0.23, 16), gold, x, 3.55, z));
      g.add(mesh(cyl(0.5, 0.5, 0.04, 16), glow('#f8d5a0', 0.8), x, 3.42, z));
    }
  }
  label(g, 'ATLANTIC CITY', 0, 4.03, -5.17, 4.7, 0.34, '#eed9a4', '#49303a', 'bold 48px Georgia');
  // Not a generic roulette table: tiles, chip towers, dealer rack and money box.
  g.add(mesh(box(3.65, 0.81, 1.2), toon('#4c2e2b'), 0, 0.405, -0.5));
  g.add(mesh(roundedBox(4.8, 0.18, 2.15, 0.08), dark, 0, 0.88, -0.5));
  g.add(mesh(box(4.46, 0.025, 1.83), toon('#357f74'), 0, 0.984, -0.5));
  for (const x of [-1.65, -0.83, 0, 0.83, 1.65]) {
    g.add(mesh(new THREE.TorusGeometry(0.23, 0.009, 4, 20), gold, x, 1.002, 0.02).rotateX(-Math.PI / 2));
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 3 + k; j++)
        g.add(
          mesh(
            cyl(0.043, 0.043, 0.018, 10),
            toon(['#d2b765', '#8f3e4a', '#48619b', '#d4cfb5'][k]),
            x - 0.2 + k * 0.13,
            1.01 + j * 0.018,
            -0.26,
          ),
        );
    }
    for (let k = 0; k < 3; k++) {
      g.add(mesh(box(0.09, 0.07, 0.14), toon('#e0cea4'), x - 0.12 + k * 0.12, 1.03, 0.36));
      for (let j = 0; j < 2; j++) g.add(mesh(cyl(0.008, 0.008, 0.003, 6), toon('#733d33'), x - 0.12 + k * 0.12, 1.068, 0.33 + j * 0.06));
    }
  }
  g.add(mesh(box(1.2, 0.05, 0.36), dark, 0, 1.02, -1.04));
  for (let k = 0; k < 8; k++)
    for (let j = 0; j < 4; j++)
      g.add(mesh(cyl(0.035, 0.035, 0.018, 8), toon(k % 2 ? '#bbbdac' : '#bf765e'), -0.48 + k * 0.13, 1.06 + j * 0.019, -1.04));
  for (const x of [-1.75, 1.75]) {
    g.add(mesh(cyl(0.15, 0.2, 0.035, 8), gold, x, 1.02, -1.12));
    for (let j = 0; j < 4; j++) g.add(mesh(cyl(0.08, 0.11, 0.09, 8), toon(j % 2 ? '#b78d42' : '#9d343b'), x, 1.08 + j * 0.09, -1.12));
  }
  g.add(mesh(box(0.45, 0.3, 0.33), toon('#91a3a0'), 2.02, 1.16, -1.06));
  label(g, 'XING HAI SHI BU XING', 0, 0.7, 0.583, 2.5, 0.22, '#bba262', '#34282a');
  for (const x of [-1.25, 0, 1.25]) roundSeat(g, x, 1.12, Math.PI, 0.64, true, false, 0.12);
  // Reverse casino wall with the cashier and period neon, one-sided for the master.
  for (const x of [-4.8, 0, 4.8]) {
    const p = label(g, x === 0 ? 'CASHIER' : x < 0 ? 'SLOTS  •  $1' : 'TABLE GAMES', x, 2.1, 7.26, 3.0, 0.65, '#edc789', '#523240').rotateY(
      Math.PI,
    );
    p.userData.cameraBackdrop = true;
  }
  const reversePanel = (x: number, y: number, w: number, h: number, material: THREE.Material) => {
    const p = mesh(new THREE.PlaneGeometry(w, h), material, x, y, 7.24, false).rotateY(Math.PI);
    p.userData.cameraBackdrop = true;
    g.add(p);
  };
  for (const x of [-5.9, -4.7, -3.5, 3.5, 4.7, 5.9]) {
    reversePanel(x, 1.0, 0.97, 1.95, dark);
    reversePanel(x, 1.5, 0.88, 0.78, gold);
    const screen = label(g, '7  ♦  7', x, 1.5, 7.23, 0.74, 0.41, '#e3cf90', '#3d6472', 'bold 45px Georgia').rotateY(Math.PI);
    screen.userData.cameraBackdrop = true;
    reversePanel(x, 0.93, 1.02, 0.12, gold);
  }
  reversePanel(0, 1.22, 2.3, 1.65, dark);
  for (let x = -1; x <= 1; x += 0.2) reversePanel(x, 1.45, 0.025, 1.02, gold);
  reversePanel(0, 0.89, 2.35, 0.08, gold);
  g.add(new THREE.HemisphereLight('#e1bb99', '#503047', 1.5));
  keyLight(g, '#ffe1b7', 2.5, [-3, 7, 5], [0, 1, -1]);
  // the players face the dealer, away from the key: the reverse from behind the chip rack needs its own light
  fillLight(g, '#ffd9b4', 1.9, [1, 6, -7], [0, 1, 2]);
  const accent = new THREE.PointLight('#bc75ab', 3, 10);
  accent.position.set(4, 3, -3);
  g.add(accent);
  return {
    id: 'atlantic_city_casino',
    name: 'Atlantic City Casino',
    group: g,
    nodes: nodes({
      door: [5.7, 2.7],
      front: [0, 2.6],
      left: [-3.15, 1.6],
      left_back: [-3.15, -2.35],
      dealer: [0, -2.15],
      right_back: [3.15, -2.35],
      right: [3.15, 1.6],
      slots: [5.75, -2.6],
    }),
    edges: [
      ['door', 'front'],
      ['front', 'left'],
      ['left', 'left_back'],
      ['left_back', 'dealer'],
      ['dealer', 'right_back'],
      ['right_back', 'right'],
      ['right', 'door'],
      ['right_back', 'slots'],
    ],
    door: 'door',
    marks: {
      player_left: mark(-1.25, 1.12, Math.PI, 'front', 'left seat at the Chinese gaming table', { seat: 0.64, approach: [-1.25, 2.2] }),
      player_center: mark(0, 1.12, Math.PI, 'front', 'Barney’s place at Xing Hai Shi Bu Xing', { seat: 0.64, approach: [0, 2.2] }),
      player_right: mark(1.25, 1.12, Math.PI, 'front', 'right seat at the gaming table', { seat: 0.64, approach: [1.25, 2.2] }),
      dealer: mark(0, -2.15, 0, 'dealer', 'dealer behind the chip rack'),
      table_left: mark(-3.15, -0.4, Math.PI / 2, 'left', 'watching from the left end'),
      table_right: mark(3.15, -0.4, -Math.PI / 2, 'right', 'watching from the right end'),
      slots: mark(5.75, -3.64, Math.PI, 'slots', 'at an upright slot machine', { seat: 0.64, approach: [5.75, -2.6] }),
      onlooker: mark(2.4, 2.5, -2.5, 'front', 'a friend watching Barney bet'),
      door: mark(5.7, 2.7, -1.5, 'door', 'arriving from the casino floor'),
    },
    wides: [
      { pos: v3(0, 2.65, 9.5), target: v3(0, 1.3, -0.6), fov: 58 },
      { pos: v3(-4.5, 2.45, 4.5), target: v3(0, 1.2, -0.55), fov: 54 },
      { pos: v3(0, 2.2, -3.05), target: v3(0, 1.3, 1.25), fov: 61 },
    ],
    ambience: 'bar',
    background: [],
    reserved: ['dealer'],
    maxTwoShotDistance: 5.5,
    doorSound: 'none',
    setTime() {},
    update(_dt, t) {
      for (const [i, m] of slots.entries()) (m.material as THREE.MeshBasicMaterial).color.setScalar(0.86 + 0.14 * Math.sin(t * 1.3 + i));
    },
  };
}
