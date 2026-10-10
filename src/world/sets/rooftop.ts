import * as THREE from 'three';
import { toon, glow, box, mesh, roundedBox, cyl, occluder } from '../../engine/materials';
import { brick, skyline, speckle, facade, tiles } from '../../engine/textures';
import { type StageSet, mark, nodes, door, fillLight, keyLight, v3 } from './common';

// The roof of the gang's building: tar and gravel inside a low brick parapet, Manhattan all around.
// The stairwell bulkhead with its steel door sits stage left, the water tower on its stilts stage right.
// In between, a few lawn chairs and a cooler around a little kettle grill, under a sagging string of
// bulbs. People sit on the parapet with their backs to the skyline, or lean on it looking out.
export function buildRooftop(): StageSet {
  const g = new THREE.Group();
  g.name = 'rooftop';
  const LEFT = -7, RIGHT = 7, BACK = -3.8, FRONT = 5;
  const PARA_H = 0.82, PARA_T = 0.3, CAP = PARA_H + 0.06;

  const brickMat = toon('#ffffff', { map: brick('#7a3a28', '#4a3a32', [7, 1]) });
  const capMat = toon('#9a948a');
  const metal = toon('#5a5e62');
  const metalDark = toon('#2e3034');
  const rust = toon('#7a4a2a');
  const wood = toon('#6a4a30');

  // ---- roof ------------------------------------------------------------------------------
  const floor = mesh(new THREE.PlaneGeometry(RIGHT - LEFT, FRONT - BACK + 1), toon('#ffffff', { map: speckle('#4a4846', [10, 7], 41, 0.3) }), 0, 0, (FRONT + BACK) / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  g.add(floor);
  // a walkway of concrete pavers from the door
  const pavers = mesh(new THREE.PlaneGeometry(4.6, 1.0), toon('#ffffff', { map: tiles('#8a8680', '#5a5650', [6, 1]) }), -1.7, 0.005, -2.0, false);
  pavers.rotation.x = -Math.PI / 2;
  pavers.receiveShadow = true;
  g.add(pavers);
  // flashing seams in the tar
  for (const z of [-1.4, 1.6]) g.add(mesh(box(RIGHT - LEFT, 0.01, 0.05), toon('#3a3836'), 0, 0.006, z, false));

  // ---- parapet: back and both sides --------------------------------------------------------
  const parapet = (x: number, z: number, len: number, rotY: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.rotation.y = rotY;
    p.add(mesh(box(len, PARA_H, PARA_T), brickMat, 0, PARA_H / 2, 0));
    p.add(mesh(box(len + 0.1, 0.06, PARA_T + 0.1), capMat, 0, PARA_H + 0.03, 0));
    g.add(p);
  };
  parapet(0, BACK - PARA_T / 2, RIGHT - LEFT + PARA_T * 2, 0);
  parapet(LEFT - PARA_T / 2, (BACK + FRONT) / 2, FRONT - BACK, Math.PI / 2);
  parapet(RIGHT + PARA_T / 2, (BACK + FRONT) / 2, FRONT - BACK, Math.PI / 2);

  // ---- the stairwell bulkhead, stage left -----------------------------------------------------
  const BX0 = -6.9, BX1 = -4.1, BZ0 = -3.7, BZ1 = -0.6, BH = 2.7;
  g.add(occluder(mesh(box(BX1 - BX0, BH, BZ1 - BZ0), toon('#ffffff', { map: brick('#6e3626', '#463630', [3, 3]) }), (BX0 + BX1) / 2, BH / 2, (BZ0 + BZ1) / 2)));
  g.add(mesh(box(BX1 - BX0 + 0.16, 0.1, BZ1 - BZ0 + 0.16), capMat, (BX0 + BX1) / 2, BH + 0.05, (BZ0 + BZ1) / 2));
  const DOOR_Z = -2.0;
  const front = door(g, BX1 + 0.01, DOOR_Z, Math.PI / 2, '#4a5458', { frameColor: '#2e3438', hinge: 1 });
  g.add(mesh(box(0.3, 0.12, 0.05), toon('#c8302a'), BX1 + 0.03, 2.46, DOOR_Z, false).rotateY(Math.PI / 2)); // a faded red "ROOF" plate
  // caged bulb over the door
  g.add(mesh(cyl(0.05, 0.05, 0.1, 6), metalDark, BX1 + 0.08, 2.6, DOOR_Z, false));
  const doorBulb = mesh(new THREE.SphereGeometry(0.06, 6, 4), glow('#ffe0a0', 1.5), BX1 + 0.14, 2.55, DOOR_Z, false);
  g.add(doorBulb);
  const doorLight = new THREE.PointLight('#ffd890', 3, 5, 1.5);
  doorLight.position.set(BX1 + 0.5, 2.4, DOOR_Z);
  g.add(doorLight);
  // a cinder block that props the door open, a coiled hose
  g.add(mesh(box(0.38, 0.2, 0.2), toon('#8a8682'), BX1 + 0.3, 0.1, DOOR_Z + 0.75));
  g.add(mesh(new THREE.TorusGeometry(0.22, 0.04, 4, 10).rotateX(Math.PI / 2), toon('#2a6a3a'), BX1 + 0.35, 0.05, BZ1 + 0.4, false));
  // vent stacks and a satellite dish on the bulkhead
  g.add(mesh(cyl(0.12, 0.12, 0.7, 8), metal, -6.3, BH + 0.35, -3.0, false));
  g.add(mesh(cyl(0.18, 0.18, 0.08, 8), metal, -6.3, BH + 0.72, -3.0, false));
  const dish = mesh(new THREE.SphereGeometry(0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI / 4), toon('#d8d8d4', { side: THREE.DoubleSide }), -5.0, BH + 0.4, -1.4, false);
  dish.rotation.set(-1.0, 0.6, 0);
  g.add(dish);
  g.add(mesh(cyl(0.02, 0.02, 0.4, 4), metal, -5.0, BH + 0.2, -1.4, false));

  // ---- the water tower, stage right ---------------------------------------------------------
  const WX = 5.0, WZ = -2.3, LEG_H = 2.6, TANK_R = 1.15, TANK_H = 2.0;
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) {
    g.add(occluder(mesh(box(0.12, LEG_H, 0.12), metalDark, WX + dx, LEG_H / 2, WZ + dz)));
    g.add(mesh(box(0.3, 0.12, 0.3), toon('#7a7672'), WX + dx, 0.06, WZ + dz, false));
  }
  // cross braces
  for (const [x0, z0, x1, z1] of [[-0.9, 0.9, 0.9, 0.9], [-0.9, -0.9, -0.9, 0.9], [0.9, -0.9, 0.9, 0.9]] as const) {
    const a = new THREE.Vector3(WX + x0, 0.3, WZ + z0), b = new THREE.Vector3(WX + x1, LEG_H - 0.2, WZ + z1);
    const brace = mesh(cyl(0.015, 0.015, a.distanceTo(b), 4), metalDark, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, false);
    brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(brace);
  }
  g.add(mesh(box(2.2, 0.1, 2.2), wood, WX, LEG_H + 0.05, WZ));
  const staves = toon('#ffffff', { map: speckle('#7a5a3e', [8, 1], 43, 0.12) });
  g.add(mesh(cyl(TANK_R, TANK_R, TANK_H, 14), staves, WX, LEG_H + 0.1 + TANK_H / 2, WZ));
  for (const y of [0.35, 1.0, 1.65]) g.add(mesh(new THREE.TorusGeometry(TANK_R + 0.01, 0.025, 3, 14).rotateX(Math.PI / 2), metalDark, WX, LEG_H + 0.1 + y, WZ, false));
  g.add(mesh(cyl(0.05, TANK_R + 0.12, 0.7, 14), toon('#3e3a36'), WX, LEG_H + 0.1 + TANK_H + 0.35, WZ));
  // ladder up the side
  for (const s of [-1, 1]) g.add(mesh(box(0.03, LEG_H + 1.6, 0.03), rust, WX - 1.0 + s * 0.16, (LEG_H + 1.6) / 2, WZ + 0.95, false));
  for (let y = 0.3; y < LEG_H + 1.5; y += 0.3) g.add(mesh(box(0.32, 0.02, 0.02), rust, WX - 1.0, y, WZ + 0.95, false));

  // ---- the hangout: lawn chairs, a cooler, the grill --------------------------------------------
  /** Aluminium folding lawn chair with webbing, facing local +z. */
  const lawnChair = (x: number, z: number, rotY: number, web: string) => {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = rotY;
    const al = toon('#c8ccd0');
    const w = toon(web);
    for (const sx of [-1, 1]) {
      c.add(mesh(box(0.025, 0.025, 0.55), al, sx * 0.26, 0.4, 0, false));
      c.add(mesh(box(0.025, 0.42, 0.025), al, sx * 0.26, 0.2, 0.25, false));
      c.add(mesh(box(0.025, 0.42, 0.025), al, sx * 0.26, 0.2, -0.25, false));
      c.add(mesh(box(0.025, 0.55, 0.025), al, sx * 0.26, 0.65, -0.3, false).rotateX(-0.2));
      c.add(mesh(box(0.04, 0.02, 0.4), al, sx * 0.27, 0.6, -0.05, false)); // arm rests
    }
    for (let i = 0; i < 4; i++) c.add(mesh(box(0.5, 0.012, 0.1), w, 0, 0.4, -0.2 + i * 0.13, false));
    for (let i = 0; i < 4; i++) c.add(mesh(box(0.5, 0.1, 0.012), w, 0, 0.5 + i * 0.12, -0.3 - (0.5 + i * 0.12 - 0.4) * 0.2, false).rotateX(-0.2));
    g.add(c);
  };
  const CHAIRS: [number, number, number, string][] = [[-1.5, -1.0, 0.35, '#2a6a8a'], [0.0, -1.35, 0, '#c8a02a'], [1.5, -1.0, -0.35, '#3a7a3a']];
  for (const [x, z, r, c] of CHAIRS) lawnChair(x, z, r, c);
  // the cooler: something to sit on
  const COOLER: [number, number] = [-2.4, 0.4];
  g.add(mesh(roundedBox(0.62, 0.36, 0.4, 0.03), toon('#c8302a'), COOLER[0], 0.18, COOLER[1]));
  g.add(mesh(roundedBox(0.64, 0.07, 0.42, 0.02), toon('#f0ece4'), COOLER[0], 0.39, COOLER[1]));
  // beer bottles standing around
  const bottle = toon('#7a4a12', { emissive: '#3a1e04', emissiveIntensity: 0.4 });
  for (const [x, z] of [[-0.75, -1.0], [0.62, -1.15], [-2.15, 0.45], [2.1, -0.75]] as const) {
    g.add(mesh(cyl(0.03, 0.03, 0.14, 6), bottle, x, 0.07, z, false));
    g.add(mesh(cyl(0.012, 0.02, 0.07, 5), bottle, x, 0.17, z, false));
  }
  // kettle grill
  const GR: [number, number] = [2.7, 0.3];
  g.add(mesh(new THREE.SphereGeometry(0.28, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#1a1a1c'), GR[0], 0.72, GR[1]));
  g.add(mesh(new THREE.SphereGeometry(0.28, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2.4), toon('#1a1a1c'), GR[0] + 0.05, 0.74, GR[1] - 0.05, false).rotateX(-0.3));
  for (const a of [0, 2.1, 4.2]) g.add(mesh(cyl(0.015, 0.015, 0.72, 4), metal, GR[0] + Math.sin(a) * 0.18, 0.36, GR[1] + Math.cos(a) * 0.18, false));
  // an AC unit humming downstage right, an old milk crate
  g.add(occluder(mesh(box(1.1, 0.8, 0.9), toon('#a8aca8'), 5.6, 0.4, 1.6)));
  g.add(mesh(cyl(0.34, 0.34, 0.02, 12), metalDark, 5.6, 0.81, 1.6, false));
  for (let i = 0; i < 6; i++) g.add(mesh(box(1.0, 0.02, 0.02), metal, 5.6, 0.2 + i * 0.1, 2.06, false));
  g.add(mesh(box(0.34, 0.28, 0.34), toon('#2a4a9a'), -3.4, 0.14, 2.2));

  // ---- string lights from the bulkhead to the water tower -----------------------------------------
  const bulbs: THREE.Mesh[] = [];
  const bulbOn = glow('#ffd890', 1.6);
  const bulbOff = toon('#d8d0b8');
  const a = new THREE.Vector3(BX1, 2.5, -1.2), b = new THREE.Vector3(WX - 0.9, LEG_H - 0.1, WZ + 0.9);
  const N_BULBS = 14;
  let prev = a.clone();
  for (let i = 1; i <= N_BULBS + 1; i++) {
    const u = i / (N_BULBS + 1);
    const p = a.clone().lerp(b, u);
    p.y -= Math.sin(u * Math.PI) * 0.6;
    p.z += Math.sin(u * Math.PI) * 0.5;
    const wire = mesh(cyl(0.006, 0.006, prev.distanceTo(p), 3), toon('#111'), (prev.x + p.x) / 2, (prev.y + p.y) / 2, (prev.z + p.z) / 2, false);
    wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(prev).normalize());
    g.add(wire);
    if (i <= N_BULBS) {
      const bulb = mesh(new THREE.SphereGeometry(0.045, 6, 4), bulbOn, p.x, p.y - 0.06, p.z, false);
      g.add(bulb);
      bulbs.push(bulb);
    }
    prev = p;
  }
  const stringLights: THREE.PointLight[] = [];
  for (const u of [0.25, 0.5, 0.75]) {
    const p = a.clone().lerp(b, u);
    const l = new THREE.PointLight('#ffcf80', 3, 5.5, 1.5);
    l.position.set(p.x, p.y - Math.sin(u * Math.PI) * 0.6 - 0.2, p.z + Math.sin(u * Math.PI) * 0.5);
    g.add(l);
    stringLights.push(l);
  }

  // ---- the city ---------------------------------------------------------------------------
  // neighbouring buildings in the middle distance, then the skyline painted on a far backdrop
  const towers: { mesh: THREE.Mesh; day: THREE.Material; night: THREE.Material }[] = [];
  const TOWERS: [number, number, number, number, number, string][] = [
    // x, z, width, depth, top, wall
    [-13, -11, 6, 5, 3.5, '#8a6a5a'], [-5, -13, 5, 5, 7, '#9a8a7a'], [1, -10, 4.5, 4, 1.2, '#7a5a4a'], [6.5, -12, 6, 5, 5.5, '#a89a8a'],
    [13, -10, 5, 6, 2.2, '#8a7a6a'], [-9, -20, 6, 6, 11, '#7a8090'], [3, -22, 7, 6, 14, '#8a8a9a'], [11, -19, 5, 5, 9, '#9a8070'],
  ];
  TOWERS.forEach(([x, z, w, d, top, wall], i) => {
    const h = top + 22;
    const day = toon('#ffffff', { map: facade(false, wall, 60 + i, Math.round(w * 1.4), Math.round(h * 0.9)) });
    const night = toon('#ffffff', { map: facade(true, wall, 60 + i, Math.round(w * 1.4), Math.round(h * 0.9)), emissive: '#ffffff', emissiveIntensity: 0.55 });
    const m = mesh(box(w, h, d), night, x, top - h / 2, z, false);
    g.add(m);
    towers.push({ mesh: m, day, night });
    // a little water tower or a parapet on top
    if (i % 3 === 0) g.add(mesh(cyl(0.6, 0.6, 1.0, 8), toon('#3a2e26'), x + w / 4, top + 1.3, z, false));
    g.add(mesh(box(w + 0.1, 0.4, d + 0.1), toon('#3a3634'), x, top + 0.2, z, false));
  });
  const nightSky = toon('#ffffff', { map: skyline(true, 91), emissive: '#ffffff', emissiveIntensity: 0.9 });
  const daySky = toon('#ffffff', { map: skyline(false, 91), emissive: '#ffffff', emissiveIntensity: 0.85 });
  const backdrop = mesh(new THREE.PlaneGeometry(90, 36), nightSky, 0, 4, -34, false);
  g.add(backdrop);
  const sides: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const m = mesh(new THREE.PlaneGeometry(60, 36), nightSky, s * 34, 4, -6, false);
    m.rotation.y = -s * Math.PI / 2;
    g.add(m);
    sides.push(m);
  }

  // ---- lighting ------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#8a9ac8', '#2a2420', 1.0);
  g.add(hemi);
  const key = keyLight(g, '#b8c8ff', 1.0, [-4, 9, 6], [0, 0, -1]);
  // the city behind the parapet lights anyone turned to look out over it
  const cityGlow = fillLight(g, '#a8b8e8', 0.9, [1, 4, -12], [0, 1, 2]);
  const fill = new THREE.PointLight('#ffd8b0', 2.5, 9, 1.3);
  fill.position.set(0.5, 2.6, 2.4);
  g.add(fill);

  const N = nodes({
    door: [-3.65, DOOR_Z], bulk: [-3.4, -0.2], bulk_front: [-3.4, 1.2], back_l: [-2.6, -3.15], back_c: [0.7, -2.6], back_r: [2.6, -3.15], tower: [3.4, -0.6],
    chairs: [0, -0.4], center: [0.3, 0.6], front: [0, 2.4], front_r: [3.6, 2.4], cooler: [-2.4, 1.1],
  });

  const chairMark = (i: number, hint: string) => {
    const [x, z, r] = CHAIRS[i];
    return mark(x + Math.sin(r) * 0.06, z + Math.cos(r) * 0.06, r, 'chairs', hint, { seat: 0.42, approach: [x + Math.sin(r) * 0.6, z + Math.cos(r) * 0.6] });
  };
  return {
    id: 'rooftop',
    name: 'The Roof',
    group: g,
    nodes: N,
    edges: [
      ['door', 'bulk'], ['door', 'back_l'], ['bulk', 'bulk_front'], ['bulk_front', 'cooler'], ['cooler', 'center'], ['cooler', 'front'], ['back_l', 'back_c'], ['back_c', 'back_r'],
      ['back_r', 'tower'], ['tower', 'center'], ['tower', 'front_r'], ['chairs', 'center'], ['center', 'front'], ['front', 'front_r'], ['bulk', 'back_l'],
    ],
    door: 'door',
    doors: { door: front },
    marks: {
      lawn_chair_left: chairMark(0, 'blue lawn chair, left of the circle'),
      lawn_chair_middle: chairMark(1, 'yellow lawn chair, middle, facing the audience'),
      lawn_chair_right: chairMark(2, 'green lawn chair, right of the circle'),
      cooler: mark(COOLER[0], COOLER[1] + 0.02, 0.4, 'cooler', 'sitting on the red cooler full of beer', { seat: 0.43, approach: [COOLER[0] + 0.3, COOLER[1] + 0.6] }),
      ledge_seat_left: mark(-2.6, BACK - 0.04, 0.15, 'back_l', 'sitting up on the parapet, back to the skyline, legs dangling over the roof', { seat: CAP, approach: [-2.6, BACK + 0.6] }),
      ledge_seat_right: mark(2.6, BACK - 0.04, -0.15, 'back_r', 'sitting up on the parapet, back to the skyline (right)', { seat: CAP, approach: [2.6, BACK + 0.6] }),
      ledge_lookout: mark(0.7, BACK + 0.35, Math.PI - 0.45, 'back_c', 'at the parapet, leaning on it and looking out over the city'),
      water_tower: mark(3.5, -0.9, -0.5, 'tower', 'under the water tower, by its ladder'),
      grill: mark(3.3, 1.15, -0.3, 'front_r', 'at the kettle grill, flipping burgers'),
      bulkhead: mark(-3.55, -0.25, 0.5, 'bulk', 'leaning on the brick stairwell bulkhead, next to the door'),
      center: mark(0.3, 0.7, 0, 'center', 'middle of the roof, in front of the lawn chairs'),
      downstage: mark(-0.6, 2.4, 0.1, 'front', 'downstage, at the front of the roof, facing out (dramatic speeches)'),
      door: mark(-3.75, DOOR_Z, Math.PI / 2, 'door', 'the steel door to the stairwell'),
    },
    wides: [
      { pos: v3(0.2, 2.1, 8.2), target: v3(0.2, 1.3, -2.0), fov: 48 },
      { pos: v3(-0.2, 1.5, 4.6), target: v3(0, 0.95, -1.2), fov: 44 },
      { pos: v3(1.8, 1.6, 3.4), target: v3(-2.8, 1.3, -2.4), fov: 46 },
      { pos: v3(-1.2, 1.6, 3.4), target: v3(3.0, 1.4, -2.4), fov: 46 },
    ],
    ambience: 'city',
    background: [],
    doorSound: 'none',
    setTime(t) {
      const night = t === 'night';
      for (const m of [backdrop, ...sides]) m.material = night ? nightSky : daySky;
      for (const tw of towers) tw.mesh.material = night ? tw.night : tw.day;
      hemi.color.set(night ? '#8a9ac8' : '#cfe4ff');
      hemi.intensity = night ? 1.35 : 2.4;
      key.color.set(night ? '#b8c8ff' : '#fff2dc');
      key.intensity = night ? 1.4 : 2.6;
      cityGlow.color.set(night ? '#a8b8e8' : '#fff2dc');
      cityGlow.intensity = night ? 0.9 : 1.0;
      for (const bb of bulbs) bb.material = night ? bulbOn : bulbOff;
      for (const l of stringLights) l.intensity = night ? 3 : 0;
      doorLight.intensity = night ? 3 : 0;
      doorBulb.material = night ? bulbOn : bulbOff;
      fill.intensity = night ? 2.5 : 1.2;
    },
  };
}
