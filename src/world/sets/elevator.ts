import * as THREE from 'three';
import { box, cyl, mesh, toon } from '../../engine/materials';
import { checker, paneling, tiles } from '../../engine/textures';
import { keyLight, mark, nodes, SlidingDoor, type StageSet, v3 } from './common';
import { label } from './furnishings';

/** Cabin size: a real passenger car, cheated a little bigger for the cameras. The doors are upstage. */
const W = 2.7, BACK = -1.2, FRONT = 1.2, H = 2.55;
const SIDE = W / 2, DEPTH = FRONT - BACK;
/** The doors, a touch left of center so the button panel fits beside them. */
const DX = -0.2, DW = 1.1, DH = 2.05;
/** The shell runs on past the open audience side, so nothing outside the cabin ever shows at a frame edge. */
const BEYOND = FRONT + 4;

/** A generic old wood-paneled passenger elevator: walnut, brass and steel doors that slide open onto a landing. */
export function buildElevator(): StageSet {
  const g = new THREE.Group(); g.name = 'elevator';
  const walnut = (len: number) => toon('#ffffff', { map: paneling('#654735', [Math.max(1, Math.round(len / 0.78)), 1]) });
  const brass = toon('#c9a352'), darkBrass = toon('#7d6233'), steel = toon('#a9afab'), trim = toon('#4a3020');

  // Shell: floor, three walnut walls and a low ceiling. The audience side is open; the reverse wall below is one-sided.
  const outside = BEYOND - BACK, mid = (BEYOND + BACK) / 2;
  g.add(mesh(new THREE.PlaneGeometry(W, outside), toon('#ffffff', { map: tiles('#8a7a62', '#5b4c3b', [6, Math.round(outside / 0.45)]) }), 0, 0, mid, false).rotateX(-Math.PI / 2));
  g.add(mesh(new THREE.PlaneGeometry(W, outside), toon('#d8ccb0'), 0, H, mid, false).rotateX(Math.PI / 2));
  // Lower and upper walnut panels on every wall, split by a chair rail at handrail height.
  const RAIL = 0.92;
  const wall = (len: number, x: number, z: number, rotY: number) => {
    g.add(mesh(new THREE.PlaneGeometry(len, RAIL), walnut(len), x, RAIL / 2, z, false).rotateY(rotY));
    g.add(mesh(new THREE.PlaneGeometry(len, H - RAIL), walnut(len), x, (H + RAIL) / 2, z, false).rotateY(rotY));
  };
  // (the back wall goes round the doorway: the doors slide away into it, onto the landing)
  const L0 = -SIDE, L1 = DX - DW / 2, R0 = DX + DW / 2, R1 = SIDE;
  wall(L1 - L0, (L0 + L1) / 2, BACK, 0);
  wall(R1 - R0, (R0 + R1) / 2, BACK, 0);
  g.add(mesh(new THREE.PlaneGeometry(DW, H - DH), walnut(DW), DX, (H + DH) / 2, BACK, false));
  wall(outside, -SIDE, mid, Math.PI / 2);
  wall(outside, SIDE, mid, -Math.PI / 2);
  // Kick plates, chair rails and a cornice along the two side walls, inside the cabin only.
  for (const s of [-1, 1]) {
    const x = s * (SIDE - 0.015);
    g.add(mesh(box(0.03, 0.12, DEPTH), trim, x, 0.06, 0, false));
    g.add(mesh(box(0.035, 0.05, DEPTH), trim, x, RAIL, 0, false));
    g.add(mesh(box(0.06, 0.09, DEPTH), trim, s * (SIDE - 0.03), H - 0.045, 0, false));
    // the brass handrail, standing off the wall on three brackets
    g.add(mesh(cyl(0.022, 0.022, DEPTH - 0.4, 8).rotateX(Math.PI / 2), brass, s * (SIDE - 0.075), RAIL + 0.03, 0, false));
    for (const z of [-0.85, 0, 0.85]) g.add(mesh(box(0.07, 0.025, 0.025), darkBrass, s * (SIDE - 0.04), RAIL + 0.03, z, false));
  }
  for (const [a, b] of [[L0, L1], [R0, R1]]) g.add(mesh(box(b - a, 0.12, 0.03), trim, (a + b) / 2, 0.06, BACK + 0.015, false));
  g.add(mesh(box(W, 0.09, 0.06), trim, 0, H - 0.045, BACK + 0.03, false));
  // One light panel in a wood coffer: an enclosed cabin, not a lobby.
  g.add(mesh(box(1.5, 0.04, 1.3), trim, 0, H - 0.02, -0.05, false));
  g.add(mesh(box(1.25, 0.03, 1.05), toon('#f3ead2', { emissive: '#f6eed8', emissiveIntensity: 0.7 }), 0, H - 0.045, -0.05, false));

  // Brushed-steel doors in a brass surround, on the back wall facing the audience. They slide apart into the wall.
  for (const sx of [-1, 1]) {
    g.add(mesh(box(0.09, DH + 0.1, 0.04), darkBrass, DX + sx * (DW / 2 + 0.045), (DH + 0.1) / 2, BACK + 0.02));
    g.add(mesh(box(0.03, DH + 0.04, 0.05), brass, DX + sx * (DW / 2 + 0.015), (DH + 0.04) / 2, BACK + 0.03));
  }
  g.add(mesh(box(DW + 0.18, 0.06, 0.04), darkBrass, DX, DH + 0.07, BACK + 0.02));
  g.add(mesh(box(DW + 0.06, 0.04, 0.05), brass, DX, DH + 0.02, BACK + 0.03));
  const doors = new SlidingDoor(DW, DH, steel, toon('#565c58'));
  doors.position.set(DX, 0, BACK);
  g.add(doors);
  // the brass sill, through the doorway
  g.add(mesh(box(DW + 0.06, 0.02, 0.16), brass, DX, 0.01, BACK + 0.03, false));
  landing(g);
  // Floor indicator over the doors: an old brass dial with its needle on the floor coming up.
  const DY = DH + 0.13;
  g.add(mesh(new THREE.CircleGeometry(0.2, 18, 0, Math.PI), darkBrass, DX, DY, BACK + 0.04, false));
  g.add(mesh(new THREE.CircleGeometry(0.17, 18, 0, Math.PI), toon('#efe2bd'), DX, DY + 0.005, BACK + 0.045, false));
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.1 + 0.8 * i / 8);
    g.add(mesh(box(0.01, 0.03, 0.005), toon('#3d3222'), DX + Math.cos(a) * 0.14, DY + Math.sin(a) * 0.14, BACK + 0.05, false).rotateZ(a - Math.PI / 2));
  }
  g.add(mesh(box(0.012, 0.15, 0.006), toon('#5a1f17'), DX - 0.03, DY + 0.07, BACK + 0.055, false).rotateZ(0.42));
  g.add(mesh(new THREE.CircleGeometry(0.02, 8), darkBrass, DX, DY + 0.006, BACK + 0.058, false));

  // The button panel beside the doors: two columns of ivory buttons, one lit, and the alarm.
  const PX = 1.06, PY = 1.3;
  g.add(mesh(box(0.25, 0.68, 0.025), brass, PX, PY, BACK + 0.0125));
  for (let row = 0; row < 5; row++) for (let col = 0; col < 2; col++) {
    const lit = row === 0 && col === 1;
    g.add(mesh(new THREE.CircleGeometry(0.032, 10), lit ? toon('#ffd27a', { emissive: '#ffb84a', emissiveIntensity: 0.9 }) : toon('#e8dfc6'),
      PX - 0.055 + col * 0.11, PY + 0.24 - row * 0.1, BACK + 0.027, false));
  }
  g.add(mesh(new THREE.CircleGeometry(0.036, 10), toon('#a2352a'), PX, PY - 0.26, BACK + 0.027, false));
  // A capacity plaque on the other side of the doors.
  label(g, 'CAPACITY 10 PERSONS', -1.1, 1.55, BACK + 0.012, 0.4, 0.1, '#3a2b16', '#c9a352', 'bold 34px Georgia');

  // The reverse wall, one-sided (seen from inside the cabin, see-through from the master camera beyond it).
  const backdrop = (m: THREE.Mesh) => { m.userData.cameraBackdrop = true; g.add(m); return m; };
  backdrop(mesh(new THREE.PlaneGeometry(W, RAIL), walnut(W), 0, RAIL / 2, FRONT, false).rotateY(Math.PI));
  backdrop(mesh(new THREE.PlaneGeometry(W, H - RAIL), walnut(W), 0, (H + RAIL) / 2, FRONT, false).rotateY(Math.PI));
  backdrop(mesh(new THREE.PlaneGeometry(W - 0.4, 0.045), brass, 0, RAIL + 0.03, FRONT - 0.07, false).rotateY(Math.PI));
  backdrop(mesh(new THREE.PlaneGeometry(W, 0.12), trim, 0, 0.06, FRONT - 0.01, false).rotateY(Math.PI));
  // a framed inspection certificate, up out of the way of the faces in front of it
  backdrop(mesh(new THREE.PlaneGeometry(0.36, 0.28), darkBrass, -0.8, 1.95, FRONT - 0.01, false).rotateY(Math.PI));
  backdrop(mesh(new THREE.PlaneGeometry(0.3, 0.22), toon('#e6dcc0'), -0.8, 1.95, FRONT - 0.012, false).rotateY(Math.PI));
  backdrop(label(g, 'CERTIFICATE OF INSPECTION', -0.8, 2.02, FRONT - 0.014, 0.26, 0.05, '#4a3a22', '#e6dcc0', 'bold 30px Georgia').rotateY(Math.PI));
  for (const y of [1.93, 1.89, 1.85]) backdrop(mesh(new THREE.PlaneGeometry(0.2, 0.008), toon('#9a8c70'), -0.8, y, FRONT - 0.014, false).rotateY(Math.PI));

  const hemi = new THREE.HemisphereLight('#efe3c6', '#5b4a38', 1.8); g.add(hemi);
  keyLight(g, '#f2e4c4', 1.9, [0.6, 4.2, 4], [0, 1, -0.6]);
  return {
    id: 'elevator', name: 'The Elevator', group: g,
    // Conversational distance: a front row of three, two more just inside the doors.
    nodes: nodes({ door: [DX, -0.82], back: [-0.62, -0.7], buttons: [0.62, -0.62], left: [-0.7, 0.18], right: [0.7, 0.18], center: [0, 0.32] }),
    edges: [['door', 'back'], ['door', 'buttons'], ['door', 'center'], ['back', 'left'], ['buttons', 'right'], ['left', 'center'], ['right', 'center']], door: 'door', doors: { door: doors },
    marks: {
      left: mark(-0.7, 0.18, 0.3, 'left', 'left side of the elevator'),
      right: mark(0.7, 0.18, -0.3, 'right', 'right side of the elevator'),
      center: mark(0, 0.32, 0, 'center', 'front center of the cabin'),
      back: mark(-0.62, -0.7, 0.2, 'back', 'just inside the elevator doors'),
      buttons: mark(0.62, -0.62, -0.25, 'buttons', 'at the floor buttons'),
      door: mark(DX, -0.82, 0, 'door', 'entering through the elevator doors'),
    },
    // A closed cabin: generated angles stay between the walls, out to where the missing fourth wall would be.
    cameraBounds: new THREE.Box3(v3(-SIDE + 0.1, 0.3, BACK + 0.1), v3(SIDE - 0.1, H - 0.1, FRONT + 1.3)),
    maxTwoShotDistance: 3.1,
    wides: [
      { pos: v3(0, 1.45, 2.3), target: v3(0, 1.15, -0.4), fov: 44, label: 'Master wide' },
      { pos: v3(-0.75, 1.55, 2.0), target: v3(0.35, 1.2, -0.55), fov: 46, label: 'Wide toward the buttons' },
      { pos: v3(0.75, 1.55, 2.0), target: v3(-0.35, 1.2, -0.55), fov: 46, label: 'Wide toward the back corner' },
    ], ambience: 'office', background: [], doorSound: 'elevator',
    setTime() { /* Enclosed cabin, constant practical lighting. */ },
  };
}

/** The landing outside, seen through the open doors: a dim old hall, sage plaster over a dark wainscot on a black and
 *  white tiled floor. It's a little wider than the cabin, so whoever steps out can walk
 *  off to the side out of sight. */
function landing(g: THREE.Group) {
  const D = 1.9, W2 = 3.2, HH = 2.6, x0 = DX, z0 = BACK - D / 2, far = BACK - D, RAIL = 0.92;
  const plaster = toon('#6e7465'), wainscot = toon('#3f362d'), trim = toon('#2a231d');
  g.add(mesh(new THREE.PlaneGeometry(W2, D), toon('#ffffff', { map: checker('#2b2926', '#8f897b', [8, 5]) }), x0, 0, z0, false).rotateX(-Math.PI / 2));
  g.add(mesh(new THREE.PlaneGeometry(W2, D), toon('#4a4a42'), x0, HH, z0, false).rotateX(Math.PI / 2));
  const wall = (len: number, x: number, z: number, rotY: number) => {
    g.add(mesh(new THREE.PlaneGeometry(len, RAIL), wainscot, x, RAIL / 2, z, false).rotateY(rotY));
    g.add(mesh(new THREE.PlaneGeometry(len, HH - RAIL), plaster, x, (HH + RAIL) / 2, z, false).rotateY(rotY));
  };
  wall(W2, x0, far, 0);
  for (const s of [-1, 1]) wall(D, x0 + s * W2 / 2, z0, -s * Math.PI / 2);
  // a baseboard and chair rail along the far wall (nothing up at head height to grow out of anyone's hair)
  g.add(mesh(box(W2, 0.12, 0.02), trim, x0, 0.06, far + 0.01, false));
  g.add(mesh(box(W2, 0.04, 0.03), trim, x0, RAIL, far + 0.015, false));
}
