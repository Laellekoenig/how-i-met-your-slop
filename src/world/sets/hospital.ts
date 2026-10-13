import * as THREE from 'three';
import { box, mesh, toon } from '../../engine/materials';
import { clockFace, tiles } from '../../engine/textures';
import { door, fillLight, keyLight, mark, nodes, plant, type StageSet, v3 } from './common';
import { chair, label, mug } from './furnishings';
import { ceilingPanel, interior, table } from './interior';

export function buildHospital(): StageSet {
  const g = new THREE.Group(); g.name = 'hospital';
  const cream = toon('#dedfca'), teal = toon('#668a87');
  interior(g, 12, 8, 3.5, toon('#ffffff', { map: tiles('#b8c2b7', '#929f98', [12, 12]) }), cream, '#e1e4d9');
  g.add(mesh(box(12, 0.88, 0.06), teal, 0, 0.44, -3.96));
  g.add(mesh(box(12, 0.065, 0.09), toon('#b8c6b6'), 0, 0.99, -3.94));
  label(g, 'ST. MARK\'S HOSPITAL', -2.7, 2.9, -3.91, 4.4, 0.38, '#395955', '#dedfca', 'bold 40px Helvetica');
  label(g, 'FAMILY WAITING ROOM', -2.7, 2.41, -3.9, 3.9, 0.27, '#476e69', '#dedfca', 'bold 38px Helvetica');
  const front = door(g, 1.2, -3.93, 0, '#658b85', { glass: toon('#b6cfc5'), frameColor: '#c2c8b8' });
  label(g, 'WARD  3  →', 1.2, 2.64, -3.8, 1.46, 0.25);
  g.add(mesh(new THREE.PlaneGeometry(0.55, 0.55), toon('#ffffff', { map: clockFace() }), 4.3, 2.9, -3.89));
  for (const x of [-4.8, -3.65, -2.5, -1.35]) {
    chair(g, x, -2.52, 0, '#4d7476');
    for (const dx of [-0.3, 0.3]) g.add(mesh(box(0.035, 0.035, 0.53), toon('#899592'), x + dx, 0.64, -2.49));
  }
  // A second bank faces across the room, supplying a useful reverse conversation angle.
  for (const z of [0, 1.25]) chair(g, -4.8, z, Math.PI / 2, '#4d7476');
  table(g, -2.8, -0.8, 1.5, 0.66, 0.46, '#a99168');
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(0.3, 0.018, 0.38), toon(['#ad6b56', '#71908b', '#d0bd86'][i]), -3.28 + i * 0.42, 0.51, -0.8));
  }
  // Reception alcove on the right; both sides have reachable marks.
  g.add(mesh(box(2.4, 1.04, 0.8), toon('#b2a487'), 3.82, 0.52, -2.45));
  g.add(mesh(box(2.5, 0.075, 0.88), teal, 3.82, 1.08, -2.45));
  label(g, 'RECEPTION', 3.82, 0.7, -2.04, 1.75, 0.25);
  g.add(mesh(box(0.48, 0.35, 0.08), toon('#414d50'), 4.45, 1.31, -2.65));
  mug(g, 3.05, 1.12, -2.47, '#e0d8c4');
  // Coffee machine and paper cups, with a restrained clinical palette.
  g.add(mesh(box(1.2, 1.95, 0.65), toon('#526266'), 5.0, 0.975, 0.85));
  label(g, 'COFFEE', 5, 1.63, 1.185, 0.96, 0.23, '#eee4c6', '#354548');
  g.add(mesh(box(0.65, 0.6, 0.02), toon('#26383b'), 4.87, 1.0, 1.187));
  for (let i = 0; i < 3; i++) g.add(mesh(box(0.09, 0.08, 0.03), toon('#c9b987'), 5.41, 1.2 - i * 0.18, 1.2));
  plant(g, 5.13, -3.37, 1.55);
  label(g, 'PLEASE KEEP VOICES LOW', -5.93, 2.1, 0.5, 2.1, 0.27, '#486661', '#dedfca').rotateY(Math.PI / 2);
  for (const x of [-3.5, 0, 3.5]) ceilingPanel(g, x, 3.43, -0.7);
  const hemi = new THREE.HemisphereLight('#eaf0df', '#657367', 1.7); g.add(hemi);
  keyLight(g, '#e9f2dc', 2.1, [-2, 6, 5], [0, 0, -1]);
  fillLight(g, '#e9f2dc', 1.2, [1, 6, -7], [0, 1, 2]);
  return {
    id: 'hospital', name: 'Hospital Waiting Room', group: g,
    nodes: nodes({ door: [1.2, -3.3], center: [0, -0.4], seats: [-2.8, -1.7], left: [-4, -1.6], side: [-4, 0.5], front: [-2.8, 0.5], reception: [3.6, -1.1], clerk: [3.8, -3.3], coffee: [3.9, 1.3] }),
    edges: [['door', 'center'], ['center', 'seats'], ['seats', 'left'], ['left', 'side'], ['side', 'front'], ['front', 'center'], ['center', 'reception'], ['reception', 'coffee'], ['door', 'clerk']], door: 'door', doors: { door: front }, reserved: ['receptionist'],
    marks: {
      seat_left: mark(-3.65, -2.48, 0, 'seats', 'waiting-room chair, left', { seat: 0.49, approach: [-3.65, -1.7] }),
      seat_right: mark(-2.5, -2.48, 0, 'seats', 'waiting-room chair, right', { seat: 0.49, approach: [-2.5, -1.7] }),
      side_seat: mark(-4.76, 0, Math.PI / 2, 'front', 'side chair facing the waiting room', { seat: 0.49, approach: [-4, 0] }),
      center: mark(0, -0.2, 0, 'center', 'pacing the waiting-room floor'),
      reception: mark(3.6, -1.35, Math.PI, 'reception', 'asking at reception'),
      receptionist: mark(3.8, -3.25, 0, 'clerk', 'staff behind the reception desk'),
      coffee: mark(3.9, 1.05, 0.5, 'coffee', 'beside the coffee machine'),
      door: mark(1.2, -3.35, 0, 'door', 'door to the hospital ward'),
    },
    maxTwoShotDistance: 6.5,
    wides: [
      { pos: v3(0, 1.85, 6.7), target: v3(0, 1.35, -1.7), fov: 54 },
      { pos: v3(-2.6, 1.8, 2.6), target: v3(-3.15, 1.15, -2.45), fov: 48 },
      { pos: v3(1, 2.0, 1.5), target: v3(3.8, 1.4, -2.4), fov: 49 },
    ], ambience: 'office', background: [], doorSound: 'none',
    setTime(t) { hemi.intensity = t === 'day' ? 1.7 : 1.35; },
  };
}
