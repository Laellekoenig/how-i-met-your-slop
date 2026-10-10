import * as THREE from 'three';
import { toon, glow, box, mesh, roundedBox, cyl, occluder } from '../../engine/materials';
import { ellipsoid } from '../../engine/shapes';
import { planks, skyline, painting, checker } from '../../engine/textures';
import { type StageSet, mark, nodes, frame, door, bottles, keyLight, v3 } from './common';

// Barney's apartment, laid out after the show's set: charcoal walls, dark wood floor, everything black,
// espresso and chrome. The dark leather couch faces the audience (the 300-inch TV is the fourth wall);
// behind it a glass console with the katana on its stand, then the floor-to-ceiling terrace doors
// with grey vertical blinds and the Manhattan skyline. The life-size Stormtrooper guards the corner
// upstage left; the front door is on the left wall. Upstage right, past the hallway to the bedroom
// (and the room full of suits), is the open kitchen: espresso cabinets, a black granite peninsula with
// chrome stools, a steel fridge and an oven made of cardboard. Barney's bar is on the right wall.
export function buildBarneys(): StageSet {
  const g = new THREE.Group();
  g.name = 'barneys';
  const H = 3.2;
  const LEFT = -6.4, RIGHT = 6.6, BACK = -4.2, FRONT = 4.5;
  const OPEN_H = 2.65; // top of the terrace doors

  const wallMat = toon('#33363c');
  const black = toon('#141416');
  const chrome = toon('#c4c8ce');
  const espresso = toon('#2a1d18');
  const granite = toon('#17171a');
  const steel = toon('#8e939a');
  const leather = toon('#3a302b');
  const leatherDark = toon('#2a2320');
  const white = toon('#eeeeec');

  // ---- shell -----------------------------------------------------------------------------
  const floor = mesh(new THREE.PlaneGeometry(RIGHT - LEFT, FRONT - BACK), toon('#ffffff', { map: planks('#34221c', [9, 7], 31) }), (LEFT + RIGHT) / 2, 0, (FRONT + BACK) / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  g.add(floor);
  const ceil = mesh(new THREE.PlaneGeometry(RIGHT - LEFT, FRONT - BACK), toon('#1b1c20'), (LEFT + RIGHT) / 2, H, (FRONT + BACK) / 2, false);
  ceil.rotation.x = Math.PI / 2;
  g.add(ceil);
  for (const [x, rot] of [[LEFT, Math.PI / 2], [RIGHT, -Math.PI / 2]] as const) {
    const w = mesh(new THREE.PlaneGeometry(FRONT - BACK, H), wallMat, x, H / 2, (FRONT + BACK) / 2, false);
    w.rotation.y = rot;
    g.add(w);
    g.add(mesh(box(0.04, 0.1, FRONT - BACK), black, x - Math.sign(x) * 0.02, 0.05, (FRONT + BACK) / 2, false));
  }

  // back wall, in pieces around the openings: fixed glass, terrace doors, sliding door, hallway
  const O1: [number, number] = [-6.05, -4.8]; // fixed glass behind the Stormtrooper
  const O2: [number, number] = [-4.65, -2.65]; // the French terrace doors
  const O3: [number, number] = [-2.5, -0.25]; // sliding door behind the couch, blinds drawn
  const HALL: [number, number] = [1.0, 2.0];
  const HALL_H = 2.4, HALL_D = 1.5;
  const T = 0.16;
  const wallPiece = (x0: number, x1: number, y0: number, y1: number) => {
    const m = mesh(box(x1 - x0, y1 - y0, T), wallMat, (x0 + x1) / 2, (y0 + y1) / 2, BACK - T / 2);
    m.castShadow = false;
    g.add(m);
  };
  wallPiece(LEFT, O1[0], 0, H);
  wallPiece(O1[1], O2[0], 0, H);
  wallPiece(O2[1], O3[0], 0, H);
  wallPiece(O3[1], HALL[0], 0, H);
  wallPiece(HALL[1], RIGHT, 0, H);
  wallPiece(O1[0], O3[1], OPEN_H, H);
  wallPiece(HALL[0], HALL[1], HALL_H, H);
  for (const [x0, x1] of [[LEFT, O1[0]], [O1[1], O2[0]], [O2[1], O3[0]], [O3[1], HALL[0]], [HALL[1], RIGHT]])
    g.add(mesh(box(x1 - x0, 0.1, 0.03), black, (x0 + x1) / 2, 0.05, BACK + 0.015, false));

  // ---- outside: the terrace and the skyline -------------------------------------------------
  const terrace = mesh(new THREE.PlaneGeometry(O3[1] - LEFT + 1, 1.8), toon('#5a5c60'), (LEFT + O3[1]) / 2, -0.02, BACK - 0.9, false);
  terrace.rotation.x = -Math.PI / 2;
  terrace.receiveShadow = true;
  g.add(terrace);
  const railZ = BACK - 1.65;
  g.add(mesh(box(O3[1] - LEFT + 1, 0.05, 0.08), chrome, (LEFT + O3[1]) / 2, 1.05, railZ, false));
  g.add(mesh(new THREE.PlaneGeometry(O3[1] - LEFT + 1, 1.0), new THREE.MeshBasicMaterial({ color: '#9ab8cc', transparent: true, opacity: 0.18, depthWrite: false }), (LEFT + O3[1]) / 2, 0.52, railZ, false));
  for (let x = LEFT; x <= O3[1] + 0.5; x += 1.1) g.add(mesh(box(0.05, 1.05, 0.05), chrome, x, 0.52, railZ, false));
  // a pair of terrace chairs and a little table
  for (const dx of [-0.45, 0.45]) {
    g.add(mesh(roundedBox(0.5, 0.08, 0.5, 0.02), toon('#d8d8d4'), -3.6 + dx, 0.42, BACK - 0.9, false));
    g.add(mesh(roundedBox(0.5, 0.4, 0.06, 0.02), toon('#d8d8d4'), -3.6 + dx, 0.65, BACK - 1.13, false));
    for (const sx of [1, -1]) g.add(mesh(box(0.03, 0.42, 0.45), chrome, -3.6 + dx + sx * 0.22, 0.21, BACK - 0.9, false));
  }
  g.add(mesh(cyl(0.22, 0.22, 0.03, 10), toon('#9ab8cc'), -3.6, 0.5, BACK - 0.75, false));
  g.add(mesh(cyl(0.02, 0.02, 0.5, 4), chrome, -3.6, 0.25, BACK - 0.75, false));

  const nightSky = toon('#ffffff', { map: skyline(true, 84), emissive: '#ffffff', emissiveIntensity: 0.85 });
  const daySky = toon('#ffffff', { map: skyline(false, 84), emissive: '#ffffff', emissiveIntensity: 0.8 });
  const backdrop = mesh(new THREE.PlaneGeometry(22, 9), nightSky, -1.5, 1.6, BACK - 7, false);
  g.add(backdrop);
  // The skyline wraps round to the left, for a glance out of the terrace doors along the room (a single at the window).
  const sideBackdrop = mesh(new THREE.PlaneGeometry(7.2, 9), nightSky, -12.5, 1.6, BACK - 3.5, false);
  sideBackdrop.rotation.y = Math.PI / 2;
  g.add(sideBackdrop);

  // ---- glazing: black frames, French doors with divided lites, vertical blinds ---------------
  const frameMat = black;
  const glass = new THREE.MeshBasicMaterial({ color: '#a8c4dc', transparent: true, opacity: 0.07, depthWrite: false });
  /** A rectangle of frame bars with `cols` x `rows` lites, in the plane z. */
  const lites = (x0: number, x1: number, y0: number, y1: number, z: number, cols: number, rows: number, bar = 0.035, edge = 0.07) => {
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    g.add(mesh(box(w, edge, 0.08), frameMat, cx, y1 - edge / 2, z, false));
    g.add(mesh(box(w, edge * 1.6, 0.08), frameMat, cx, y0 + edge * 0.8, z, false));
    for (const x of [x0 + edge / 2, x1 - edge / 2]) g.add(mesh(box(edge, h, 0.08), frameMat, x, cy, z, false));
    for (let i = 1; i < cols; i++) g.add(mesh(box(bar, h, 0.05), frameMat, x0 + (w * i) / cols, cy, z, false));
    for (let j = 1; j < rows; j++) g.add(mesh(box(w, bar, 0.05), frameMat, cx, y0 + (h * j) / rows, z, false));
    g.add(mesh(new THREE.PlaneGeometry(w, h), glass, cx, cy, z - 0.01, false));
  };
  const GZ = BACK - 0.06;
  lites(O1[0], O1[1], 0, OPEN_H, GZ, 1, 3);
  const midO2 = (O2[0] + O2[1]) / 2;
  lites(O2[0], midO2, 0, OPEN_H, GZ, 2, 4);
  lites(midO2, O2[1], 0, OPEN_H, GZ, 2, 4);
  for (const s of [-1, 1]) g.add(mesh(box(0.03, 0.18, 0.04), chrome, midO2 + s * 0.1, 1.05, GZ + 0.06, false));
  lites(O3[0], O3[1], 0, OPEN_H, GZ, 2, 1);

  /** Grey vertical blinds hung just inside an opening; `open` turns the slats (0 = shut). */
  const slatMat = toon('#5a5e64');
  const blinds = (x0: number, x1: number, open: number) => {
    const z = BACK + 0.12;
    g.add(mesh(box(x1 - x0 + 0.1, 0.07, 0.08), toon('#5a5e64'), (x0 + x1) / 2, OPEN_H - 0.02, z, false));
    const n = Math.round((x1 - x0) / 0.095);
    for (let i = 0; i < n; i++) {
      const s = mesh(box(0.09, OPEN_H - 0.12, 0.008), slatMat, x0 + 0.05 + i * ((x1 - x0 - 0.1) / (n - 1)), (OPEN_H - 0.08) / 2 + 0.02, z, false);
      s.rotation.y = open;
      g.add(s);
    }
  };
  blinds(O1[0], O1[1], 0.9);
  blinds(O3[0], O3[1], 0.35);
  // the French doors have their blinds stacked open at the side
  for (let i = 0; i < 7; i++) {
    const s = mesh(box(0.09, OPEN_H - 0.12, 0.008), slatMat, O2[1] - 0.06 - i * 0.025, (OPEN_H - 0.08) / 2 + 0.02, BACK + 0.12, false);
    s.rotation.y = Math.PI / 2 - 0.15;
    g.add(s);
  }
  g.add(mesh(box(O2[1] - O2[0] + 0.1, 0.07, 0.08), toon('#5a5e64'), midO2, OPEN_H - 0.02, BACK + 0.12, false));

  // ---- the Stormtrooper (formerly a Clone Trooper). It's not there to drive women away; it's just awesome.
  const trooper = new THREE.Group();
  {
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => trooper.add(mesh(geo, mat, x, y, z));
    const grey = toon('#6a6e74');
    for (const s of [1, -1]) {
      add(roundedBox(0.13, 0.12, 0.27, 0.04), white, s * 0.1, 0.06, 0.03);
      add(roundedBox(0.13, 0.38, 0.15, 0.04), white, s * 0.1, 0.32, 0);
      add(box(0.1, 0.06, 0.1), black, s * 0.1, 0.54, 0);
      add(roundedBox(0.15, 0.36, 0.17, 0.04), white, s * 0.1, 0.75, 0);
      // arms, hanging at attention
      add(roundedBox(0.16, 0.13, 0.18, 0.05), white, s * 0.27, 1.46, 0);
      add(roundedBox(0.1, 0.25, 0.11, 0.035), white, s * 0.28, 1.27, 0);
      add(box(0.08, 0.05, 0.08), black, s * 0.28, 1.12, 0);
      add(roundedBox(0.1, 0.25, 0.1, 0.035), white, s * 0.28, 0.96, 0.02);
      add(new THREE.SphereGeometry(0.055, 6, 5), black, s * 0.28, 0.8, 0.03);
      // helmet: black lenses, grey "ear" caps
      const lens = mesh(box(0.06, 0.04, 0.02), black, s * 0.05, 1.725, 0.125, false);
      lens.rotation.z = s * 0.35;
      trooper.add(lens);
      add(cyl(0.035, 0.035, 0.02, 8).rotateZ(Math.PI / 2), grey, s * 0.13, 1.69, 0.0);
    }
    add(roundedBox(0.34, 0.2, 0.2, 0.04), black, 0, 0.98, 0);
    add(roundedBox(0.38, 0.08, 0.23, 0.02), white, 0, 1.0, 0);
    for (const s of [1, -1]) add(box(0.06, 0.06, 0.04), grey, s * 0.09, 1.0, 0.11);
    add(roundedBox(0.28, 0.16, 0.18, 0.04), white, 0, 1.13, 0.01);
    add(roundedBox(0.4, 0.3, 0.23, 0.06), white, 0, 1.36, 0.0);
    for (let i = -1; i <= 1; i++) add(box(0.05, 0.03, 0.01), grey, i * 0.07, 1.3, 0.12);
    add(box(0.2, 0.025, 0.01), black, 0, 1.21, 0.1);
    add(cyl(0.06, 0.06, 0.08, 6), black, 0, 1.55, 0);
    add(ellipsoid(0.13, 0.15, 0.14, 10, 8), white, 0, 1.7, 0);
    add(roundedBox(0.16, 0.08, 0.06, 0.02), white, 0, 1.61, 0.11);
    for (let i = -2; i <= 2; i++) add(box(0.012, 0.05, 0.01), grey, i * 0.025, 1.61, 0.142);
    add(box(0.18, 0.02, 0.02), grey, 0, 1.775, 0.12);
  }
  trooper.position.set(-5.75, 0, -3.55);
  trooper.rotation.y = 0.45;
  trooper.traverse((o) => (o.userData.occluder = true));
  g.add(trooper);

  // ---- the living room ----------------------------------------------------------------------
  const CX = -2.3, CZ = -2.0;
  const rug = mesh(new THREE.PlaneGeometry(3.4, 2.5), toon('#7c8278'), CX, 0.012, CZ + 1.15, false);
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  g.add(rug);
  const rugEdge = mesh(new THREE.PlaneGeometry(3.5, 2.6), toon('#6e746a'), CX, 0.008, CZ + 1.15, false);
  rugEdge.rotation.x = -Math.PI / 2;
  rugEdge.receiveShadow = true;
  g.add(rugEdge);

  // the couch: low, square, dark leather, on chrome feet
  const couch = new THREE.Group();
  couch.position.set(CX, 0, CZ);
  {
    const L = 2.3;
    couch.add(occluder(mesh(roundedBox(L, 0.28, 0.92, 0.03), leatherDark, 0, 0.22, 0)));
    for (const dx of [-0.53, 0.53]) {
      couch.add(mesh(roundedBox(1.04, 0.14, 0.72, 0.05), leather, dx, 0.42, 0.08));
      couch.add(occluder(mesh(roundedBox(1.04, 0.42, 0.2, 0.06), leather, dx, 0.68, -0.3).rotateX(-0.12)));
    }
    couch.add(occluder(mesh(roundedBox(L, 0.62, 0.16, 0.03), leatherDark, 0, 0.53, -0.4)));
    for (const s of [1, -1]) couch.add(occluder(mesh(roundedBox(0.16, 0.56, 0.92, 0.03), leatherDark, s * (L / 2 - 0.08), 0.36, 0)));
    for (const sx of [1, -1]) for (const sz of [1, -1]) couch.add(mesh(box(0.05, 0.08, 0.05), chrome, sx * (L / 2 - 0.1), 0.04, sz * 0.38, false));
  }
  g.add(couch);
  // throw pillows
  for (const [dx, rz] of [[-0.95, 0.25], [0.95, -0.25]] as const) {
    const p = mesh(roundedBox(0.4, 0.36, 0.12, 0.05), toon('#6a6e74'), CX + dx, 0.66, CZ - 0.12, false);
    p.rotation.set(-0.25, 0, rz);
    g.add(p);
  }

  // glass console behind the couch, with the katana on its stand (and secret buttons in the hilt)
  const KZ = CZ - 0.72;
  g.add(occluder(mesh(box(1.9, 0.03, 0.38), toon('#9ab8c8', { emissive: '#203040', emissiveIntensity: 0.3 }), CX, 0.76, KZ)));
  for (const sx of [1, -1]) {
    g.add(mesh(box(0.03, 0.76, 0.03), chrome, CX + sx * 0.92, 0.38, KZ + 0.17, false));
    g.add(mesh(box(0.03, 0.76, 0.03), chrome, CX + sx * 0.92, 0.38, KZ - 0.17, false));
    g.add(mesh(box(0.03, 0.03, 0.34), chrome, CX + sx * 0.92, 0.1, KZ, false));
  }
  g.add(mesh(box(1.84, 0.02, 0.34), toon('#9ab8c8'), CX, 0.12, KZ, false));
  const katana = new THREE.Group();
  katana.position.set(CX + 0.1, 0.775, KZ);
  {
    katana.add(mesh(box(0.62, 0.025, 0.1), black, 0, 0.0125, 0, false));
    for (const s of [1, -1]) katana.add(mesh(box(0.035, 0.2, 0.07), black, s * 0.22, 0.11, 0, false));
    const sword = new THREE.Group();
    sword.position.set(0, 0.22, 0);
    sword.rotation.z = 0.04;
    sword.add(mesh(box(0.72, 0.032, 0.028), toon('#1a1414'), -0.05, 0, 0, false)); // saya
    sword.add(mesh(box(0.05, 0.034, 0.03), toon('#b08a3a'), -0.38, 0, 0, false)); // kojiri
    sword.add(mesh(cyl(0.045, 0.045, 0.012, 10).rotateZ(Math.PI / 2), toon('#b08a3a'), 0.32, 0, 0, false)); // tsuba
    sword.add(mesh(box(0.26, 0.03, 0.03), toon('#c8a050'), 0.46, 0.003, 0, false)); // tsuka
    for (let i = 0; i < 5; i++) sword.add(mesh(box(0.018, 0.033, 0.033), toon('#2a1a12'), 0.36 + i * 0.05, 0.003, 0, false));
    sword.add(mesh(box(0.02, 0.034, 0.034), black, 0.6, 0.003, 0, false));
    katana.add(sword);
  }
  g.add(katana);
  g.add(mesh(box(0.2, 0.06, 0.28), toon('#2a2a2e'), CX - 0.6, 0.805, KZ, false)); // a stack of books, none of them the Playbook
  g.add(mesh(cyl(0.05, 0.04, 0.2, 8), toon('#e8e8e6'), CX - 0.7, 0.88, KZ - 0.05, false));

  // glass-and-chrome side tables with the black lamps (one of them cost $1,200)
  const lampLights: THREE.PointLight[] = [];
  for (const sx of [-1, 1]) {
    const x = CX + sx * 1.5;
    g.add(occluder(mesh(box(0.5, 0.03, 0.5), toon('#9ab8c8', { emissive: '#203040', emissiveIntensity: 0.3 }), x, 0.55, CZ)));
    for (const ax of [1, -1]) for (const az of [1, -1]) g.add(mesh(box(0.025, 0.55, 0.025), chrome, x + ax * 0.23, 0.275, CZ + az * 0.23, false));
    g.add(mesh(box(0.46, 0.02, 0.46), toon('#9ab8c8'), x, 0.1, CZ, false));
    g.add(mesh(cyl(0.07, 0.1, 0.36, 8), black, x, 0.75, CZ - 0.05, false));
    g.add(mesh(cyl(0.2, 0.22, 0.26, 10), toon('#202024', { side: THREE.DoubleSide }), x, 1.06, CZ - 0.05, false));
    g.add(mesh(cyl(0.19, 0.19, 0.01, 10), glow('#ffe2b0', 1.2), x, 0.935, CZ - 0.05, false));
    const l = new THREE.PointLight('#ffd49a', 3, 4.5, 1.4);
    l.position.set(x, 0.85, CZ + 0.25);
    g.add(l);
    lampLights.push(l);
  }
  g.add(mesh(box(0.05, 0.02, 0.16), black, CX + 1.5, 0.575, CZ + 0.12, false)); // remote

  // coffee table: black top on a chrome sled base
  const TZ = CZ + 1.4;
  g.add(occluder(mesh(roundedBox(1.25, 0.06, 0.62, 0.01), toon('#18181a'), CX, 0.4, TZ)));
  for (const sx of [1, -1]) {
    g.add(mesh(box(0.03, 0.37, 0.03), chrome, CX + sx * 0.55, 0.185, TZ - 0.26, false));
    g.add(mesh(box(0.03, 0.37, 0.03), chrome, CX + sx * 0.55, 0.185, TZ + 0.26, false));
    g.add(mesh(box(0.03, 0.03, 0.55), chrome, CX + sx * 0.55, 0.015, TZ, false));
  }
  g.add(mesh(box(0.28, 0.02, 0.36), toon('#d8d4c8'), CX + 0.25, 0.44, TZ, false).rotateY(0.15)); // magazine
  g.add(mesh(cyl(0.05, 0.06, 0.18, 8), toon('#a8c4dc', { emissive: '#203040', emissiveIntensity: 0.3 }), CX - 0.35, 0.52, TZ - 0.1, false)); // decanter
  g.add(mesh(cyl(0.048, 0.055, 0.1, 8), toon('#b8742a', { emissive: '#3a1a04', emissiveIntensity: 0.3 }), CX - 0.35, 0.48, TZ - 0.1, false));
  g.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), toon('#a8c4dc'), CX - 0.35, 0.64, TZ - 0.1, false));
  for (const dx of [-0.15, -0.05]) g.add(mesh(cyl(0.03, 0.03, 0.07, 6), toon('#c8a050', { emissive: '#3a2004', emissiveIntensity: 0.3 }), CX + dx, 0.465, TZ + 0.12, false));

  /** Chrome-framed lounge chair with square leather cushions, facing +z. */
  const chromeChair = (x: number, z: number, rotY: number) => {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = rotY;
    for (const s of [1, -1]) {
      c.add(mesh(box(0.03, 0.03, 0.78), chrome, s * 0.4, 0.02, 0, false));
      c.add(mesh(box(0.03, 0.55, 0.03), chrome, s * 0.4, 0.29, 0.36, false));
      c.add(mesh(box(0.03, 0.03, 0.78), chrome, s * 0.4, 0.56, 0, false));
      c.add(mesh(box(0.03, 0.62, 0.03), chrome, s * 0.4, 0.3, -0.38, false).rotateX(0.18));
    }
    c.add(occluder(mesh(roundedBox(0.76, 0.14, 0.66, 0.05), leather, 0, 0.38, 0.05)));
    c.add(occluder(mesh(roundedBox(0.76, 0.5, 0.14, 0.05), leather, 0, 0.66, -0.3).rotateX(-0.2)));
    c.add(mesh(box(0.76, 0.03, 0.7), leatherDark, 0, 0.3, 0.02, false));
    g.add(c);
    return c;
  };
  chromeChair(-4.2, -0.75, 1.0);

  // ---- the left wall: front door, entry console, Barney's black leather lounger -----------------
  const DOOR_Z = -0.3;
  const front = door(g, LEFT + 0.02, DOOR_Z, Math.PI / 2, '#1c1b1c', { frameColor: '#101012', hinge: 1 });
  front.leaf.add(mesh(box(0.14, 0.03, 0.03), chrome, -0.885, 1.05, 0.04, false)); // lever handle, swinging with the door
  // the welcome mat (secretly a body-fat scale: the Heavy, Set, Go)
  g.add(mesh(box(0.62, 0.015, 0.92), toon('#2a2a2c'), LEFT + 0.42, 0.008, DOOR_Z, false));
  g.add(mesh(box(0.5, 0.017, 0.8), toon('#3c3c40'), LEFT + 0.42, 0.009, DOOR_Z, false));
  // black floating console with three white vessels, the big abstract canvas above
  const EZ = -1.75;
  g.add(occluder(mesh(box(0.4, 0.3, 1.1), black, LEFT + 0.2, 0.75, EZ)));
  for (const [dz, h, r] of [[-0.35, 0.22, 0.07], [0, 0.32, 0.09], [0.32, 0.16, 0.08]] as const)
    g.add(mesh(cyl(r * 0.8, r, h, 8), white, LEFT + 0.2, 0.9 + h / 2, EZ + dz, false));
  frame(g, LEFT + 0.03, 1.85, EZ, 1.0, 0.9, 62, Math.PI / 2, '#101012');
  // the black leather lounge chair and ottoman in the downstage corner, with an arc lamp
  const lounger = new THREE.Group();
  lounger.position.set(-5.45, 0, 1.55);
  lounger.rotation.y = 0.8;
  {
    lounger.add(mesh(cyl(0.04, 0.04, 0.3, 6), chrome, 0, 0.15, 0, false));
    for (let i = 0; i < 5; i++) lounger.add(mesh(box(0.04, 0.025, 0.36), black, 0, 0.02, 0.16, false).rotateY((i / 5) * Math.PI * 2));
    lounger.add(occluder(mesh(roundedBox(0.8, 0.16, 0.7, 0.06), black, 0, 0.35, 0.05)));
    lounger.add(occluder(mesh(roundedBox(0.8, 0.62, 0.18, 0.07), black, 0, 0.72, -0.32).rotateX(-0.3)));
    for (const s of [1, -1]) lounger.add(mesh(roundedBox(0.1, 0.08, 0.5, 0.03), black, s * 0.42, 0.55, 0.02, false));
    lounger.add(mesh(roundedBox(0.55, 0.14, 0.45, 0.05), black, 0, 0.32, 0.85));
    lounger.add(mesh(cyl(0.03, 0.03, 0.25, 6), chrome, 0, 0.125, 0.85, false));
  }
  g.add(lounger);
  const arc = new THREE.Group();
  arc.position.set(LEFT + 0.35, 0, 2.35);
  arc.rotation.y = 0.6;
  arc.add(mesh(box(0.3, 0.06, 0.2), toon('#e8e8e6'), 0, 0.03, 0, false));
  arc.add(mesh(cyl(0.015, 0.015, 1.7, 4), chrome, 0, 0.85, 0, false));
  arc.add(mesh(cyl(0.015, 0.015, 0.9, 4), chrome, 0.38, 1.85, 0, false).rotateZ(-1.1));
  arc.add(mesh(new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), chrome, 0.78, 1.95, 0, false));
  arc.add(mesh(cyl(0.12, 0.12, 0.01, 8), glow('#ffe2b0', 1.2), 0.78, 1.94, 0, false));
  g.add(arc);

  // ---- the wall between terrace and kitchen: speaker, vintage poster, hallway to the bedroom ------
  g.add(occluder(mesh(box(0.26, 1.12, 0.32), black, -0.02, 0.56, BACK + 0.2)));
  for (const [y, r] of [[0.95, 0.05], [0.72, 0.09], [0.42, 0.09]] as const) {
    const d = mesh(cyl(r, r, 0.02, 10), toon('#3a3a40'), -0.02, y, BACK + 0.365, false);
    d.rotation.x = Math.PI / 2;
    g.add(d);
  }
  const poster = mesh(new THREE.PlaneGeometry(0.5, 0.75), toon('#ffffff', { map: painting(63) }), 0.55, 1.7, BACK + 0.035, false);
  g.add(poster);
  g.add(mesh(box(0.58, 0.83, 0.03), black, 0.55, 1.7, BACK + 0.012, false));
  // hallway recess, with Barney's professionally lit display at the end of it
  const hx = (HALL[0] + HALL[1]) / 2, hz = BACK - HALL_D / 2;
  for (const x of HALL) {
    const w = mesh(new THREE.PlaneGeometry(HALL_D, HALL_H), wallMat, x, HALL_H / 2, hz, false);
    w.rotation.y = x === HALL[0] ? Math.PI / 2 : -Math.PI / 2;
    g.add(w);
  }
  const hallFloor = mesh(new THREE.PlaneGeometry(HALL[1] - HALL[0], HALL_D), toon('#ffffff', { map: planks('#34221c', [1, 2], 31) }), hx, 0, hz, false);
  hallFloor.rotation.x = -Math.PI / 2;
  g.add(hallFloor);
  const hallCeil = mesh(new THREE.PlaneGeometry(HALL[1] - HALL[0], HALL_D), toon('#1b1c20'), hx, HALL_H, hz, false);
  hallCeil.rotation.x = Math.PI / 2;
  g.add(hallCeil);
  g.add(mesh(new THREE.PlaneGeometry(HALL[1] - HALL[0], HALL_H), toon('#4a4e56'), hx, HALL_H / 2, BACK - HALL_D, false));
  frame(g, hx, 1.45, BACK - HALL_D + 0.03, 0.5, 0.65, 58, 0, '#c9a227');
  g.add(mesh(cyl(0.05, 0.05, 0.02, 8), glow('#fff2d6', 1.4), hx, HALL_H - 0.01, BACK - HALL_D + 0.35, false));
  for (const x of HALL) g.add(mesh(box(0.06, HALL_H + 0.03, 0.1), black, x, HALL_H / 2, BACK + 0.03, false));
  g.add(mesh(box(HALL[1] - HALL[0] + 0.06, 0.06, 0.1), black, hx, HALL_H, BACK + 0.03, false));
  const hallLight = new THREE.PointLight('#ffe8c8', 2.5, 3, 1.4);
  hallLight.position.set(hx, 2.0, BACK - HALL_D + 0.5);
  g.add(hallLight);

  // ---- the kitchen ----------------------------------------------------------------------
  const KX0 = 2.3, KX1 = 5.75, KD = 0.62;
  const kz = BACK + KD / 2;
  /** Espresso base cabinet run with a black granite top; door seams and bar handles on the `face` side. */
  const baseRun = (x: number, z: number, w: number, d: number, faces: ('front' | 'left')[]) => {
    g.add(occluder(mesh(box(w, 0.86, d), espresso, x, 0.47, z)));
    g.add(mesh(box(w, 0.08, d - 0.08), black, x, 0.04, z - 0.03, false)); // toe kick
    for (const f of faces) {
      const along = f === 'front' ? w : d;
      const n = Math.max(1, Math.round(along / 0.55));
      for (let i = 0; i < n; i++) {
        const t = -along / 2 + (along * (i + 0.5)) / n;
        if (f === 'front') {
          g.add(mesh(box(0.005, 0.74, 0.01), black, x + t - along / n / 2 + 0.003, 0.48, z + d / 2 + 0.003, false));
          g.add(mesh(box(0.2, 0.02, 0.03), chrome, x + t, 0.8, z + d / 2 + 0.02, false));
        } else {
          g.add(mesh(box(0.01, 0.74, 0.005), black, x - w / 2 - 0.003, 0.48, z + t - along / n / 2 + 0.003, false));
          g.add(mesh(box(0.03, 0.02, 0.2), chrome, x - w / 2 - 0.02, 0.8, z + t, false));
        }
      }
    }
  };
  baseRun((KX0 + KX1) / 2, kz, KX1 - KX0, KD, ['front']);
  g.add(mesh(box(KX1 - KX0 + 0.04, 0.04, KD + 0.03), granite, (KX0 + KX1) / 2, 0.92, kz + 0.015));
  // backsplash of little tan glass tiles, upper cabinets, the steel hood
  const splash = mesh(new THREE.PlaneGeometry(KX1 - KX0, 0.55), toon('#ffffff', { map: checker('#8e8468', '#a49a7a', [22, 4]) }), (KX0 + KX1) / 2, 1.215, BACK + 0.005, false);
  g.add(splash);
  const HOOD = 4.3;
  for (const [x0, x1] of [[KX0, HOOD - 0.42], [HOOD + 0.42, KX1]]) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    g.add(occluder(mesh(box(w, 0.86, 0.36), espresso, cx, 1.93, BACK + 0.18)));
    const n = Math.max(1, Math.round(w / 0.5));
    for (let i = 0; i < n; i++) {
      const x = x0 + (w * (i + 0.5)) / n;
      if (i) g.add(mesh(box(0.006, 0.82, 0.01), black, x0 + (w * i) / n, 1.93, BACK + 0.365, false));
      g.add(mesh(box(0.02, 0.18, 0.03), chrome, x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.06), 1.6, BACK + 0.38, false));
    }
  }
  g.add(mesh(box(KX1 - KX0, 0.02, 0.3), glow('#ffe0a8', 0.9), (KX0 + KX1) / 2, 1.49, BACK + 0.2, false)); // under-cabinet lights
  g.add(mesh(box(0.78, 0.1, 0.5), steel, HOOD, 1.68, BACK + 0.25, false));
  g.add(mesh(cyl(0.2, 0.39, 0.22, 4).rotateY(Math.PI / 4), steel, HOOD, 1.84, BACK + 0.22, false));
  g.add(mesh(box(0.3, H - 1.95, 0.24), steel, HOOD, (H + 1.95) / 2, BACK + 0.13, false));
  // cooktop and the oven below it. The oven is made of cardboard.
  g.add(mesh(box(0.66, 0.012, 0.5), toon('#0a0a0c'), HOOD, 0.945, kz, false));
  for (const dx of [-0.17, 0.17]) for (const dz of [-0.12, 0.12]) g.add(mesh(new THREE.TorusGeometry(0.07, 0.008, 3, 10).rotateX(Math.PI / 2), toon('#3a3a40'), HOOD + dx, 0.953, kz + dz, false));
  g.add(mesh(box(0.7, 0.62, 0.02), steel, HOOD, 0.46, kz + KD / 2 + 0.012, false));
  g.add(mesh(box(0.5, 0.3, 0.01), toon('#1a1a1e'), HOOD, 0.44, kz + KD / 2 + 0.024, false));
  g.add(mesh(box(0.56, 0.025, 0.04), chrome, HOOD, 0.71, kz + KD / 2 + 0.05, false));
  // the steel fridge in the corner
  const FX = (KX1 + RIGHT) / 2 + 0.02;
  g.add(occluder(mesh(roundedBox(RIGHT - KX1 - 0.06, 2.02, 0.74, 0.02), steel, FX, 1.01, BACK + 0.38)));
  g.add(mesh(box(0.005, 1.36, 0.01), toon('#5a5e64'), FX, 1.33, BACK + 0.755, false));
  g.add(mesh(box(RIGHT - KX1 - 0.1, 0.006, 0.01), toon('#5a5e64'), FX, 0.64, BACK + 0.755, false));
  for (const s of [1, -1]) g.add(mesh(box(0.025, 0.7, 0.04), chrome, FX + s * 0.06, 1.3, BACK + 0.78, false));
  g.add(mesh(box(0.4, 0.025, 0.04), chrome, FX, 0.55, BACK + 0.78, false));
  g.add(mesh(box(RIGHT - KX1, H - 2.02, 0.74), espresso, FX, (H + 2.02) / 2, BACK + 0.37, false));
  // countertop clutter: espresso machine, blender, diamond wine rack, canisters
  g.add(mesh(roundedBox(0.3, 0.36, 0.34, 0.03), steel, 2.75, 1.12, kz - 0.05, false));
  g.add(mesh(box(0.2, 0.06, 0.06), black, 2.75, 1.06, kz + 0.14, false));
  g.add(mesh(cyl(0.05, 0.07, 0.2, 8), toon('#c8ccd0'), 3.3, 1.04, kz - 0.05, false));
  g.add(mesh(cyl(0.07, 0.06, 0.22, 8), toon('#a8c4dc', { emissive: '#203040', emissiveIntensity: 0.3 }), 3.3, 1.25, kz - 0.05, false));
  const rack = new THREE.Group();
  rack.position.set(5.25, 0.94, kz - 0.06);
  for (const s of [1, -1]) rack.add(mesh(box(0.5, 0.025, 0.25), toon('#4a3a2e'), 0, 0.17, 0, false).rotateZ(s * Math.PI / 4));
  for (const [dx, dy] of [[0, 0.06], [-0.1, 0.17], [0.1, 0.17], [0, 0.28]] as const) rack.add(mesh(cyl(0.035, 0.035, 0.26, 6).rotateX(Math.PI / 2), toon('#3a1a1e'), dx, dy, 0, false));
  g.add(rack);
  for (const [dx, h] of [[0, 0.2], [0.13, 0.16]] as const) g.add(mesh(cyl(0.055, 0.055, h, 8), steel, 3.75 + dx, 0.94 + h / 2, kz - 0.12, false));

  // the black granite peninsula with the sink; chrome stools on the living-room side
  const PX0 = KX0, PX1 = 3.0, PZ1 = -1.2;
  const pz = (BACK + KD + PZ1) / 2, pd = PZ1 - BACK - KD;
  baseRun((PX0 + PX1) / 2, pz, PX1 - PX0, pd, []);
  g.add(occluder(mesh(box(PX1 - PX0 + 0.3, 0.04, pd + 0.05), granite, (PX0 + PX1) / 2 - 0.13, 0.92, pz + 0.02)));
  // the kitchen side of the peninsula has the doors
  for (let i = 0; i < 4; i++) {
    const z = BACK + KD + (pd * (i + 0.5)) / 4;
    g.add(mesh(box(0.01, 0.74, 0.005), black, PX1 + 0.003, 0.48, z - pd / 8, false));
    g.add(mesh(box(0.03, 0.02, 0.2), chrome, PX1 + 0.02, 0.8, z, false));
  }
  const SZ = -2.3;
  g.add(mesh(box(0.38, 0.012, 0.5), toon('#4a4e54'), 2.68, 0.945, SZ, false));
  g.add(mesh(cyl(0.015, 0.02, 0.3, 6), chrome, 2.88, 1.09, SZ, false));
  g.add(mesh(new THREE.TorusGeometry(0.08, 0.012, 4, 8, Math.PI).rotateY(Math.PI / 2), chrome, 2.88, 1.24, SZ - 0.08, false));
  g.add(mesh(cyl(0.12, 0.08, 0.08, 10), white, 2.55, 0.98, -1.55, false)); // fruit bowl
  for (const [dx, dz, c] of [[0, 0, '#c8382a'], [0.05, 0.04, '#d8a020'], [-0.04, 0.05, '#7ab03a']] as const) g.add(mesh(new THREE.SphereGeometry(0.045, 5, 4), toon(c), 2.55 + dx, 1.04, -1.55 + dz, false));
  const STOOL_X = 1.78, STOOLS = [-2.75, -1.95];
  for (const z of STOOLS) {
    const s = new THREE.Group();
    s.position.set(STOOL_X, 0, z);
    s.add(mesh(cyl(0.19, 0.17, 0.07, 10), black, 0, 0.74, 0));
    s.add(mesh(new THREE.TorusGeometry(0.17, 0.012, 4, 10).rotateX(Math.PI / 2), chrome, 0, 0.28, 0, false));
    for (const a of [0.785, 2.356, 3.927, 5.498]) {
      const leg = mesh(cyl(0.012, 0.012, 0.74, 4), chrome, Math.sin(a) * 0.15, 0.36, Math.cos(a) * 0.15, false);
      leg.rotation.set(Math.cos(a) * 0.08, 0, -Math.sin(a) * 0.08);
      s.add(leg);
    }
    s.add(mesh(box(0.025, 0.25, 0.025), chrome, -0.16, 0.88, -0.12, false));
    s.add(mesh(box(0.025, 0.25, 0.025), chrome, -0.16, 0.88, 0.12, false));
    s.add(mesh(roundedBox(0.04, 0.1, 0.3, 0.015), black, -0.17, 0.98, 0, false));
    g.add(s);
  }

  // ---- the right wall: Barney's bar ------------------------------------------------------------
  const BZ0 = -1.5, BZ1 = 0.6, BX = RIGHT - 0.28;
  const bz = (BZ0 + BZ1) / 2, bl = BZ1 - BZ0;
  g.add(occluder(mesh(box(0.52, 0.98, bl), toon('#121214'), BX, 0.49, bz)));
  g.add(mesh(box(0.56, 0.03, bl + 0.04), toon('#3a3e48', { emissive: '#101418', emissiveIntensity: 0.4 }), BX, 0.995, bz, false));
  for (let i = 1; i < 4; i++) g.add(mesh(box(0.005, 0.86, 0.01), black, BX - 0.263, 0.49, BZ0 + (bl * i) / 4, false));
  g.add(mesh(box(0.01, 0.02, bl - 0.1), glow('#a070ff', 1.2), BX - 0.27, 0.08, bz, false)); // a strip of purple under-glow
  bottles(g, BX + 0.08, 1.01, BZ0 + 0.25, 6, 0.17, -Math.PI / 2, 57);
  /** A martini glass. */
  const martini = (x: number, z: number) => {
    const gl = toon('#c8dce8', { emissive: '#203040', emissiveIntensity: 0.3 });
    g.add(mesh(cyl(0.04, 0.04, 0.005, 8), gl, x, 1.013, z, false));
    g.add(mesh(cyl(0.005, 0.005, 0.1, 4), gl, x, 1.06, z, false));
    g.add(mesh(new THREE.ConeGeometry(0.06, 0.07, 8).rotateX(Math.PI), gl, x, 1.14, z, false));
  };
  for (const [dx, dz] of [[-0.1, 0.15], [0.02, 0.2], [-0.05, 0.3]] as const) martini(BX + dx, bz + dz);
  g.add(mesh(cyl(0.04, 0.045, 0.2, 8), steel, BX - 0.08, 1.11, bz + 0.5, false)); // shaker
  g.add(mesh(cyl(0.025, 0.04, 0.06, 8), steel, BX - 0.08, 1.24, bz + 0.5, false));
  g.add(mesh(cyl(0.09, 0.08, 0.16, 10), steel, BX + 0.02, 1.09, bz + 0.72, false)); // ice bucket
  for (const [dz, c] of [[-0.1, '#b8742a'], [0.08, '#8a3a12']] as const) {
    g.add(mesh(cyl(0.06, 0.06, 0.2, 4).rotateY(Math.PI / 4), toon('#c8dce8', { emissive: '#203040', emissiveIntensity: 0.3 }), BX + 0.05, 1.11, bz + dz, false));
    g.add(mesh(cyl(0.055, 0.055, 0.12, 4).rotateY(Math.PI / 4), toon(c, { emissive: c, emissiveIntensity: 0.25 }), BX + 0.05, 1.07, bz + dz, false));
    g.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), toon('#c8dce8'), BX + 0.05, 1.25, bz + dz, false));
  }
  // smoked mirror and a glass shelf above the bar
  const mirror = mesh(new THREE.PlaneGeometry(bl - 0.2, 1.0), toon('#3a3e48', { emissive: '#14161c', emissiveIntensity: 0.6 }), RIGHT - 0.012, 1.85, bz, false);
  mirror.rotation.y = -Math.PI / 2;
  g.add(mirror);
  g.add(mesh(box(0.25, 0.02, bl - 0.3), toon('#9ab8c8'), RIGHT - 0.13, 1.6, bz, false));
  bottles(g, RIGHT - 0.13, 1.61, BZ0 + 0.35, 8, 0.19, -Math.PI / 2, 21);
  frame(g, RIGHT - 0.03, 1.75, 2.1, 0.8, 1.0, 64, -Math.PI / 2, '#101012');

  // ---- ceiling cans and lights ---------------------------------------------------------------
  const cans: [number, number][] = [[-4.4, -2.6], [-2.3, -0.9], [-0.2, -2.6], [-4.4, 0.8], [-0.2, 0.8], [3.4, -2.6], [4.9, -2.0], [5.4, 0.0]];
  for (const [x, z] of cans) {
    g.add(mesh(cyl(0.09, 0.09, 0.02, 8), glow('#fff2d6', 1.3), x, H - 0.01, z, false));
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.015, 3, 8).rotateX(Math.PI / 2), black, x, H - 0.012, z, false));
  }
  const hemi = new THREE.HemisphereLight('#b8c4e0', '#2a1e18', 1.1);
  g.add(hemi);
  const key = keyLight(g, '#eef0ff', 1.5, [1.5, 7, 7], [-0.5, 0, -2]);
  for (const [x, y, z, i] of [[-2.3, 2.9, -0.9, 3], [4.0, 2.9, -2.3, 4], [5.4, 2.9, 0.0, 3]] as const) {
    const l = new THREE.PointLight('#ffe6c0', i, 5.5, 1.4);
    l.position.set(x, y, z);
    g.add(l);
  }
  const counterLight = new THREE.PointLight('#ffd8a0', 3, 3.5, 1.4);
  counterLight.position.set(4.0, 1.35, BACK + 0.5);
  g.add(counterLight);
  const windowLight = new THREE.PointLight('#7a9aff', 2, 6, 1.4);
  windowLight.position.set(-3.2, 1.6, BACK + 1.4);
  g.add(windowLight);
  // the 300-inch TV is on the fourth wall; its glow plays across the couch
  const tvGlow = new THREE.PointLight('#6aaeff', 1.6, 7, 1.2);
  tvGlow.position.set(CX, 1.3, 2.6);
  g.add(tvGlow);

  const N = nodes({
    door: [-5.55, DOOR_Z], entry: [-4.85, 0.55], mid_l: [-3.3, 0.35], front_l: [-2.3, 0.6], armchair_front: [-3.3, -0.15], lounge_front: [-4.2, 1.0], couch_turn: [-0.15, -1.25], couch_l: [-3.35, -1.25], couch_r: [-1.15, -1.25], left: [-5.1, -1.9],
    trooper: [-4.85, -3.1], window: [-3.6, -3.6], back: [-2.3, -3.45], side_r: [-0.15, -2.0], back_r: [-0.3, -3.2],
    center: [-0.2, -0.3], right_front: [1.8, 0.5], hall: [1.5, -3.1], stools: [1.2, -2.35], kit_door: [3.5, -0.6], kitchen: [4.1, -2.4], bar: [5.2, -0.3],
  });

  return {
    id: 'barneys',
    name: "Barney's Apartment",
    group: g,
    nodes: N,
    edges: [
      ['door', 'entry'], ['door', 'left'], ['entry', 'mid_l'], ['mid_l', 'armchair_front'], ['mid_l', 'lounge_front'], ['mid_l', 'front_l'], ['mid_l', 'couch_l'], ['front_l', 'center'], ['couch_l', 'left'],
      ['left', 'trooper'], ['left', 'window'], ['trooper', 'window'], ['window', 'back'], ['back', 'back_r'], ['back_r', 'side_r'], ['side_r', 'couch_turn'], ['couch_turn', 'couch_r'],
      ['couch_r', 'center'], ['side_r', 'center'], ['center', 'right_front'], ['center', 'stools'], ['side_r', 'stools'], ['back_r', 'hall'],
      ['right_front', 'kit_door'], ['center', 'kit_door'], ['kit_door', 'kitchen'], ['kit_door', 'bar'], ['right_front', 'bar'], ['couch_l', 'couch_r'],
    ],
    door: 'door',
    doors: { door: front },
    marks: {
      couch_left: mark(CX - 0.65, CZ + 0.1, 0, 'couch_l', 'the dark leather couch, left cushion', { seat: 0.45, approach: [CX - 0.65, CZ + 0.75], depth: 0.36 }),
      couch_center: mark(CX, CZ + 0.1, 0, 'couch_l', 'the dark leather couch, middle', { seat: 0.45, approach: [CX, CZ + 0.75], depth: 0.36 }),
      couch_right: mark(CX + 0.65, CZ + 0.1, 0, 'couch_r', 'the dark leather couch, right cushion', { seat: 0.45, approach: [CX + 0.65, CZ + 0.75], depth: 0.36 }),
      armchair: mark(-4.2, -0.75, 1.0, 'armchair_front', 'the chrome-framed leather armchair beside the couch', { seat: 0.44, approach: [-3.3, -0.15], depth: 0.38 }),
      lounge_chair: mark(-5.45, 1.55, 0.8, 'lounge_front', "Barney's black leather lounge chair in the downstage corner", { seat: 0.42, approach: [-4.55, 1.1], depth: 0.4 }),
      katana: mark(CX, KZ - 0.55, 0, 'back', 'behind the couch at the glass console, by the katana on its stand'),
      window: mark(-3.7, -3.75, Math.PI - 0.35, 'window', 'at the glass terrace doors, looking out at the Manhattan skyline'),
      stormtrooper: mark(-5.0, -3.05, 0.35, 'trooper', 'next to the life-size Stormtrooper in the corner'),
      tv: mark(-1.0, 1.1, 0, 'front_l', 'downstage, standing right in front of the 300-inch TV (it is on the fourth wall)'),
      center: mark(-0.2, -0.3, -0.3, 'center', 'middle of the room, between the couch and the kitchen'),
      hallway: mark(1.5, -3.75, 0.15, 'hall', 'in the hallway doorway to the bedroom (and the room full of suits)'),
      kitchen_stool_1: mark(STOOL_X, STOOLS[0], Math.PI / 2, 'stools', 'chrome stool at the kitchen peninsula, upstage', { seat: 0.76, approach: [STOOL_X - 0.5, STOOLS[0]] }),
      kitchen_stool_2: mark(STOOL_X, STOOLS[1], Math.PI / 2, 'stools', 'chrome stool at the kitchen peninsula, downstage', { seat: 0.76, approach: [STOOL_X - 0.5, STOOLS[1]] }),
      kitchen: mark(3.45, SZ, -1.2, 'kitchen', 'in the kitchen behind the black granite peninsula, at the sink'),
      kitchen_stove: mark(HOOD, -3.0, 0.3, 'kitchen', 'in the kitchen by the stove (the oven is made of cardboard)'),
      bar_cart: mark(5.4, -0.3, 0.55, 'bar', "at Barney's bar on the right wall, pouring scotch"),
      door: mark(-5.7, DOOR_Z, Math.PI / 2, 'door', 'the front door (the welcome mat is secretly a scale)'),
    },
    wides: [
      { pos: v3(0.1, 1.7, 5.7), target: v3(0.1, 1.3, -2.2), fov: 50 },
      { pos: v3(-1.4, 1.45, 3.2), target: v3(-2.6, 1.0, -2.3), fov: 46 },
      { pos: v3(0.9, 1.6, 3.0), target: v3(3.9, 1.1, -2.3), fov: 46 },
      { pos: v3(3.2, 1.6, 1.6), target: v3(-3.6, 1.1, -2.6), fov: 46 },
    ],
    ambience: 'penthouse',
    background: [],
    setTime(t) {
      const night = t === 'night';
      backdrop.material = sideBackdrop.material = night ? nightSky : daySky;
      hemi.intensity = night ? 1.1 : 1.9;
      key.intensity = night ? 1.3 : 2.1;
      windowLight.color.set(night ? '#7a9aff' : '#fff2e0');
      windowLight.intensity = night ? 2 : 5;
      for (const l of lampLights) l.intensity = night ? 3 : 1.5;
    },
    update(_dt, t) {
      tvGlow.intensity = 1.6 + Math.sin(t * 7.3) * 0.25 + Math.sin(t * 13.1) * 0.15 + (Math.sin(t * 0.9) > 0.92 ? 0.6 : 0);
    },
  };
}
