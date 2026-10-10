import * as THREE from 'three';
import { box, mesh, occluder, toon } from '../../engine/materials';
import { blueprint, clockFace, lectureChalkboard, paneling, speckle } from '../../engine/textures';
import { door, fillLight, keyLight, mark, nodes, room, type Mark, type StageSet, v3 } from './common';
import { chair, label, mug } from './furnishings';

// "Definitions" / "Robin 101": long dark chalkboards, cream walls, wood paneling,
// a wooden lectern and banked seats. Original interpretation; references in README.
export function buildLectureHall(): StageSet {
  const g = new THREE.Group(); g.name = 'lecture_hall';
  const wood = toon('#ffffff', { map: paneling('#715139', [7, 1]) });
  const desk = toon('#b69362'), dark = toon('#333a3b'), wall = toon('#ded9c8');
  const carpet = toon('#ffffff', { map: speckle('#788079', [7, 6], 154, 0.1) });
  room(g, { w: 13, d: 9, h: 4.3, floor: carpet, back: wall, ceiling: '#d4d0c3' });
  g.add(mesh(box(13, 1.05, 0.07), wood, 0, 0.525, -4.45, false));
  for (const x of [-6.46, 6.46]) g.add(mesh(box(0.06, 1.05, 10.5), wood, x, 0.525, 0.7, false));
  // This wall faces the professor and only appears in the reverse camera.
  for (const [height, y, z, material] of [[4.3, 2.15, 5.4, wall], [1.05, 0.525, 5.39, wood]] as const) {
    const backdrop = mesh(new THREE.PlaneGeometry(13, height), material, 0, y, z, false).rotateY(Math.PI);
    // A one-sided fourth wall: reverse shots see it, the main camera shoots through its back.
    backdrop.userData.cameraBackdrop = true;
    g.add(backdrop);
  }
  g.add(mesh(box(8.5, 2.1, 0.08), toon('#8e958f'), -0.4, 2.22, -4.38, false));
  g.add(mesh(new THREE.PlaneGeometry(8.25, 1.9), toon('#ffffff', { map: lectureChalkboard() }), -0.4, 2.22, -4.325, false));
  g.add(mesh(box(8.5, 0.06, 0.18), toon('#9b9b8e'), -0.4, 1.15, -4.27, false));
  for (const x of [-1.6, -1.4, 1.7]) g.add(mesh(box(0.13, 0.025, 0.025), toon('#f5ecce'), x, 1.2, -4.22, false));
  const front = door(g, 5.35, -4.43, 0, '#796047', { frameColor: '#beb8a7', hinge: 1 });
  label(g, 'LECTURE HALL  /  301', 5.35, 2.62, -4.32, 1.55, 0.23, '#373e37', '#ddd7bf');
  g.add(mesh(new THREE.PlaneGeometry(0.48, 0.48), toon('#ffffff', { map: clockFace() }), 5.35, 3.42, -4.38, false));

  // Lectern and demonstration table, with blueprints and a small architectural model.
  g.add(occluder(mesh(box(0.83, 1.06, 0.62), wood, -1.45, 0.53, -2.92)));
  g.add(mesh(box(0.98, 0.075, 0.75), desk, -1.45, 1.1, -2.92, false).rotateX(0.12));
  g.add(mesh(box(0.42, 0.018, 0.3), toon('#f5edd6'), -1.45, 1.16, -2.92, false));
  label(g, 'ARCHITECTURE', -1.45, 0.78, -2.602, 0.69, 0.17, '#e8d4a3', '#715139', '24px Georgia');
  g.add(occluder(mesh(box(2.4, 0.07, 0.8), desk, 2.0, 0.78, -3.1)));
  for (const x of [0.95, 3.05]) g.add(mesh(box(0.06, 0.75, 0.6), dark, x, 0.375, -3.1, false));
  g.add(mesh(new THREE.PlaneGeometry(0.48, 0.6), toon('#ffffff', { map: blueprint() }), 1.35, 0.822, -3.1, false).rotateX(-Math.PI / 2));
  g.add(mesh(box(0.55, 0.035, 0.48), toon('#d0b68b'), 2.45, 0.835, -3.1, false));
  for (const [x, h] of [[2.27, 0.28], [2.46, 0.5], [2.64, 0.34]]) g.add(mesh(box(0.14, h, 0.2), toon('#eee6cf'), x, 0.85 + h / 2, -3.1, false));
  mug(g, 2.9, 0.82, -2.97, '#356b61');

  // Three tiers, with a clear center aisle and cross-aisles behind each row.
  const floorAt = (x: number, z: number) => Math.abs(x) < 5.8 && z >= 0.4 && z < 4.6
    ? 0.16 * (Math.min(2, Math.floor((z - 0.4) / 1.4)) + 1) : 0;
  const marks: Record<string, Mark> = {
    lectern: mark(-1.45, -3.5, 0, 'teaching', 'Ted teaching from behind the wooden lectern'),
    chalkboard: mark(-3.3, -3.65, 0.25, 'board', 'beside the chalkboard, addressing the class'),
    demonstration: mark(2, -3.85, 0, 'demo', 'behind the architecture model table'),
    center: mark(0, -1.45, 0, 'center', 'front of the class, clear of the lectern'),
    aisle: mark(0, 1.55, Math.PI, 'aisle_1', 'center aisle, facing the professor'),
    door: mark(5.35, -4.05, 0, 'door', 'lecture hall entrance'),
  };
  const N = nodes({ door: [5.35, -3.55], right: [4.1, -1.1], demo: [3.55, -3.75], teaching: [-1.45, -3.75], board: [-3.3, -3.6], left: [-3.5, -1.1], center: [0, -1.1] });
  const edges: [string, string][] = [['door', 'right'], ['door', 'demo'], ['demo', 'teaching'], ['teaching', 'board'], ['board', 'left'], ['left', 'center'], ['center', 'right']];
  for (let row = 0; row < 3; row++) {
    const start = 0.4 + row * 1.4, z = start + 0.63, y = (row + 1) * 0.16;
    g.add(mesh(box(11.6, y, 1.4), carpet, 0, y / 2, start + 0.7));
    g.add(mesh(box(11.6, 0.025, 0.035), toon('#c2bca4'), 0, y + 0.012, start + 0.018, false));
    const aisle = `aisle_${row + 1}`, left = `row_${row + 1}_left`, right = `row_${row + 1}_right`;
    N[aisle] = v3(0, y, z + 0.52); N[left] = v3(-3.25, y, z + 0.52); N[right] = v3(3.25, y, z + 0.52);
    edges.push([row ? `aisle_${row}` : 'center', aisle], [aisle, left], [aisle, right]);
    for (const [i, x] of [-4.6, -3.25, -1.9, 1.9, 3.25, 4.6].entries()) {
      chair(g, x, z, Math.PI, '#59605b', y);
      g.add(occluder(mesh(box(0.95, 0.05, 0.42), desk, x, y + 0.73, z - 0.43)));
      g.add(mesh(box(0.045, 0.7, 0.04), dark, x + 0.4, y + 0.35, z - 0.43, false));
      g.add(mesh(box(0.24, 0.018, 0.29), toon(i % 2 ? '#e7dfbf' : '#678c9d'), x, y + 0.77, z - 0.43, false));
      const name = `student_${row + 1}_${i + 1}`;
      marks[name] = mark(x, z - 0.04, Math.PI, x < 0 ? left : right, `student seat, row ${row + 1}, seat ${i + 1}, facing Ted and the chalkboard`, { seat: 0.47, approach: [x, z + 0.52] });
    }
  }
  for (const x of [-4.5, 0, 4.5]) for (const z of [-1.8, 2.4]) {
    g.add(mesh(box(1.5, 0.07, 0.7), toon('#fff5dc', { emissive: '#fff5dc', emissiveIntensity: 0.5 }), x, 4.23, z, false));
  }
  const hemi = new THREE.HemisphereLight('#f4eedb', '#596053', 1.85); g.add(hemi);
  keyLight(g, '#fff1d5', 2.15, [-2, 7, 5], [0, 0, -2]);
  // the students face the board, away from the key: light the reverse on them from the front of the room
  fillLight(g, '#fff1d5', 1.3, [1, 6, -7], [0, 1, 3]);
  return {
    id: 'lecture_hall', name: "Ted's Lecture Hall", group: g, nodes: N, edges, marks, floorAt, door: 'door', doors: { door: front },
    wides: [
      { pos: v3(0, 3.25, 9.6), target: v3(0, 1.45, -2.4), fov: 49 },
      { pos: v3(-0.7, 1.9, 0), target: v3(-0.6, 1.65, -3.6), fov: 58 },
      { pos: v3(-3.8, 2.6, -2.45), target: v3(0.5, 1.5, 2.6), fov: 64 },
    ],
    ambience: 'office', background: [], doorSound: 'none',
    setTime(t) { hemi.intensity = t === 'day' ? 1.85 : 1.5; },
  };
}
