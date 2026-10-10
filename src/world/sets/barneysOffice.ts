import * as THREE from 'three';
import { toon, glow, box, mesh, roundedBox, cyl, occluder, dressing } from '../../engine/materials';
import { skyline, speckle, poster, veneer, tufted, type PosterArt } from '../../engine/textures';
import { type StageSet, mark, nodes, door, bottles, keyLight, v3 } from './common';

// Barney's office at Goliath National Bank, laid out after the show's set. Honey-coloured wood
// paneling, and the back wall is a salon hang of his black-framed motivational posters: CHALLENGE,
// TEAMWORK, PERFECTION, CONFORMITY (the penguins), STRENGTH, COURAGE, OPPORTUNITY, LEAD WITH VISION,
// AWESOMENESS. Under them, a grey credenza with a white faceted lamp and trays of wheatgrass, and a
// chrome bar cart of decanters. The glass desk on chrome X legs sits in front with Barney's high-backed
// black chair, a silver laptop, white triangular organisers, an arc lamp and a blue glass ball; black
// tufted leather club chairs face it. Stage right, a tall palm, then the window with silver vertical
// blinds over a black leather sofa between two glowing cube lamps. Nobody knows what he does here. Please.
export function buildBarneysOffice(): StageSet {
  const g = new THREE.Group();
  g.name = 'barneys_office';
  const H = 3.0;
  const LEFT = -6, RIGHT = 6, BACK = -3.6, FRONT = 4.5;
  const WIN: [number, number] = [1.35, 5.7]; // the window in the back wall

  const wood = toon('#ffffff', { map: veneer('#96643a', [8, 1], 67) });
  const woodSide = toon('#ffffff', { map: veneer('#8e5e36', [6, 1], 68) });
  const woodDark = toon('#3a2214');
  const black = toon('#121214');
  const chrome = toon('#c8ccd2');
  const leather = toon('#1c1c20');
  const leatherHi = toon('#34343a');
  const greyCab = toon('#a8aaae');
  const glass = new THREE.MeshBasicMaterial({ color: '#b8d4dc', transparent: true, opacity: 0.32, depthWrite: false });

  // ---- shell ---------------------------------------------------------------------------------
  const floor = mesh(new THREE.PlaneGeometry(RIGHT - LEFT, FRONT - BACK), toon('#ffffff', { map: speckle('#a89070', [8, 6], 47, 0.12) }), 0, 0, (FRONT + BACK) / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  g.add(floor);
  const ceil = mesh(new THREE.PlaneGeometry(RIGHT - LEFT, FRONT - BACK), toon('#56504a'), 0, H, (FRONT + BACK) / 2, false);
  ceil.rotation.x = Math.PI / 2;
  g.add(ceil);
  // back wall around the window
  for (const [x0, x1] of [[LEFT, WIN[0]], [WIN[1], RIGHT]] as const) g.add(mesh(new THREE.PlaneGeometry(x1 - x0, H), wood, (x0 + x1) / 2, H / 2, BACK, false));
  g.add(mesh(new THREE.PlaneGeometry(WIN[1] - WIN[0], 0.25), wood, (WIN[0] + WIN[1]) / 2, H - 0.125, BACK, false));
  for (const [x, rot] of [[LEFT, Math.PI / 2], [RIGHT, -Math.PI / 2]] as const) {
    const w = mesh(new THREE.PlaneGeometry(FRONT - BACK, H), woodSide, x, H / 2, (FRONT + BACK) / 2, false);
    w.rotation.y = rot;
    g.add(w);
  }
  // dark reveals: a band along the top of the paneling, a pilaster where the poster wall meets the window
  g.add(mesh(box(RIGHT - LEFT, 0.06, 0.03), woodDark, 0, H - 0.25, BACK + 0.015, false));
  g.add(mesh(box(0.12, H, 0.08), woodDark, WIN[0] - 0.06, H / 2, BACK + 0.04, false));
  for (const x of [LEFT + 0.02, RIGHT - 0.02]) g.add(mesh(box(0.03, 0.06, FRONT - BACK), woodDark, x, H - 0.25, (FRONT + BACK) / 2, false));
  g.add(mesh(box(RIGHT - LEFT, 0.1, 0.02), woodDark, 0, 0.05, BACK + 0.01, false));

  // ---- the poster wall --------------------------------------------------------------------------
  // [title, picture, x, y, wide, title colour]
  // the bottom row skips the stretch behind Barney's chair; AWESOMENESS hangs right above his head
  const POSTERS: [string, PosterArt, number, number, boolean, string?][] = [
    ['COURAGE', 'flames', -5.4, 2.4, false],
    ['OPPORTUNITY', 'sunset', -4.35, 2.44, true, '#d83a2a'],
    ['PERFECTION', 'jets', -3.3, 2.4, false],
    ['AWESOMENESS', 'jet', -2.3, 2.4, false],
    ['LEAD WITH VISION', 'propeller', -1.15, 2.44, true],
    ['STRENGTH', 'column', 0.85, 2.0, false],
    ['CHALLENGE', 'climber', -5.4, 1.45, false],
    ['TEAMWORK', 'hands', -4.5, 1.45, false],
    ['SUCCESS', 'skydivers', -3.6, 1.45, false],
    ['CONFORMITY', 'penguins', -1.15, 1.5, true],
  ];
  for (const [title, art, x, y, wide, color] of POSTERS) {
    const w = wide ? 0.98 : 0.74, h = wide ? 0.78 : 0.92;
    const p = new THREE.Group();
    p.position.set(x, y, BACK + 0.03);
    p.add(mesh(box(w + 0.05, h + 0.05, 0.035), black, 0, 0, 0, false));
    p.add(mesh(new THREE.PlaneGeometry(w, h), toon('#ffffff', { map: poster(title, art, { wide, titleColor: color }), emissive: '#ffffff', emissiveIntensity: 0.12 }), 0, 0, 0.019, false));
    g.add(p);
  }
  // a pair of square black art boxes on the left wall
  for (const [z, y] of [[-2.0, 1.85], [-1.2, 1.4]] as const) {
    g.add(mesh(box(0.06, 0.42, 0.42), toon('#1e1c1a'), LEFT + 0.03, y, z, false));
    g.add(mesh(cyl(0.11, 0.11, 0.04, 10).rotateZ(Math.PI / 2), toon('#4a4642'), LEFT + 0.07, y, z, false));
  }

  // ---- the credenza under the posters ---------------------------------------------------------------
  const CR: [number, number] = [-5.85, -3.1];
  const crMid = (CR[0] + CR[1]) / 2, crLen = CR[1] - CR[0];
  g.add(occluder(mesh(roundedBox(crLen, 0.72, 0.5, 0.015), greyCab, crMid, 0.36, BACK + 0.27)));
  for (let i = 1; i < 4; i++) g.add(mesh(box(crLen - 0.04, 0.008, 0.01), toon('#7a7c80'), crMid, i * 0.18, BACK + 0.525, false));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) g.add(mesh(box(0.12, 0.012, 0.015), chrome, CR[0] + 0.45 + i * 0.9, 0.09 + j * 0.18, BACK + 0.53, false));
  const ct = 0.72;
  // the white faceted lamp, glowing
  const facet = mesh(new THREE.OctahedronGeometry(0.2, 0), toon('#ffffff', { emissive: '#fff4e0', emissiveIntensity: 0.9 }), CR[0] + 0.3, ct + 0.17, BACK + 0.3, false);
  facet.rotation.set(0.4, 0.5, 0.2);
  g.add(facet);
  // wheatgrass trays, a stack of CDs, a little digital clock
  for (const x of [-4.55, -4.2]) {
    g.add(mesh(box(0.26, 0.05, 0.2), toon('#e8e8e4'), x, ct + 0.025, BACK + 0.3, false));
    g.add(mesh(box(0.24, 0.1, 0.18), toon('#6ab83a'), x, ct + 0.1, BACK + 0.3, false));
  }
  for (let i = 0; i < 4; i++) g.add(mesh(box(0.14, 0.015, 0.14), toon(i % 2 ? '#c8ccd2' : '#e8e8ec'), -3.75, ct + 0.01 + i * 0.016, BACK + 0.3, false));
  g.add(mesh(box(0.22, 0.08, 0.06), black, -3.4, ct + 0.04, BACK + 0.32, false));
  g.add(mesh(box(0.18, 0.04, 0.005), glow('#ff5a3a', 1.1), -3.4, ct + 0.045, BACK + 0.353, false));

  // ---- the bar cart ---------------------------------------------------------------------------------
  const BC = -1.15, BCZ = BACK + 0.3;
  for (const y of [0.3, 0.82]) g.add(mesh(box(1.0, 0.025, 0.45), toon('#1a1a1e', { emissive: '#101014', emissiveIntensity: 0.3 }), BC, y, BCZ, false));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(cyl(0.012, 0.012, 0.82, 4), chrome, BC + sx * 0.48, 0.41, BCZ + sz * 0.2, false));
  bottles(g, BC - 0.38, 0.835, BCZ - 0.06, 5, 0.13, 0, 79);
  const crystal = toon('#c8dce8', { emissive: '#203040', emissiveIntensity: 0.35 });
  for (const [dx, dz] of [[0.3, 0.08], [0.42, -0.05]] as const) {
    g.add(mesh(cyl(0.06, 0.07, 0.18, 6), crystal, BC + dx, 0.93, BCZ + dz, false));
    g.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), crystal, BC + dx, 1.05, BCZ + dz, false));
  }
  for (const dx of [-0.2, -0.08, 0.05]) g.add(mesh(cyl(0.03, 0.028, 0.07, 6), crystal, BC + dx, 0.87, BCZ + 0.14, false));
  g.add(mesh(cyl(0.08, 0.07, 0.14, 8), chrome, BC + 0.1, 0.38, BCZ, false)); // ice bucket
  bottles(g, BC - 0.35, 0.315, BCZ, 3, 0.14, 0, 81);

  // ---- the palm --------------------------------------------------------------------------------------
  // (beside the bar cart, well clear of the window, so a single of someone at the window isn't shot through it)
  const PX = 0.05, PZ = BACK + 0.45;
  const palm = new THREE.Group();
  g.add(palm);
  palm.add(mesh(cyl(0.22, 0.17, 0.45, 8), toon('#2a2a2c'), PX, 0.225, PZ));
  const frond = toon('#3a7a3a');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const len = 0.7 + (i % 3) * 0.2;
    const f = mesh(box(0.1, len, 0.015), frond, PX + Math.cos(a) * 0.18, 1.2 + (i % 3) * 0.35, PZ + Math.sin(a) * 0.18, false);
    f.rotation.set(Math.sin(a) * 0.7, -a, -Math.cos(a) * 0.7);
    palm.add(f);
  }
  for (let i = 0; i < 3; i++) palm.add(mesh(cyl(0.02, 0.025, 1.4 + i * 0.3, 4), toon('#5a4a2a'), PX + (i - 1) * 0.05, 0.45 + (0.7 + i * 0.15), PZ, false));
  dressing(palm);

  // ---- the window: city beyond, silver vertical blinds ---------------------------------------------------
  const nightSky = toon('#ffffff', { map: skyline(true, 33), emissive: '#ffffff', emissiveIntensity: 0.9 });
  const daySky = toon('#ffffff', { map: skyline(false, 33), emissive: '#ffffff', emissiveIntensity: 0.85 });
  // Oblique guest-chair angles look beyond the edge of the window opening.
  const backdrop = mesh(new THREE.PlaneGeometry(32, 16), nightSky, (WIN[0] + WIN[1]) / 2, 1.0, BACK - 5, false);
  g.add(backdrop);
  // jambs and the blinds' headrail
  for (const x of [WIN[0], WIN[1]]) g.add(mesh(box(0.1, H, 0.25), wood, x, H / 2, BACK - 0.1, false));
  g.add(mesh(box(WIN[1] - WIN[0] + 0.1, 0.08, 0.1), chrome, (WIN[0] + WIN[1]) / 2, H - 0.28, BACK + 0.08, false));
  // mostly drawn, lit evenly so they read as silver; every few slats are turned open a crack onto the city
  const slatNight = [new THREE.MeshBasicMaterial({ color: '#7e828a' }), new THREE.MeshBasicMaterial({ color: '#6a6e76' })];
  const slatDay = [new THREE.MeshBasicMaterial({ color: '#d4d8de' }), new THREE.MeshBasicMaterial({ color: '#bcc0c8' })];
  const slats: THREE.Mesh[] = [];
  const nSlats = Math.round((WIN[1] - WIN[0]) / 0.1);
  for (let i = 0; i < nSlats; i++) {
    const s = mesh(box(0.1, H - 0.42, 0.008), slatNight[i % 2], WIN[0] + 0.05 + i * ((WIN[1] - WIN[0] - 0.1) / (nSlats - 1)), (H - 0.42) / 2 + 0.04, BACK + 0.06, false);
    s.rotation.y = i % 7 === 3 ? 1.1 : 0.12;
    g.add(s);
    slats.push(s);
  }

  // ---- the lounge under the window -------------------------------------------------------------------
  const SX = 3.55, SZ = BACK + 0.75, SL = 2.2;
  const sofa = new THREE.Group();
  sofa.position.set(SX, 0, SZ);
  sofa.add(occluder(mesh(roundedBox(SL, 0.28, 0.85, 0.03), leather, 0, 0.24, 0)));
  for (const dx of [-0.52, 0.52]) sofa.add(mesh(roundedBox(1.02, 0.13, 0.66, 0.05), leatherHi, dx, 0.44, 0.07));
  sofa.add(occluder(mesh(roundedBox(SL, 0.46, 0.18, 0.05), toon('#ffffff', { map: tufted('#18181a', [6, 2]) }), 0, 0.62, -0.34)));
  for (const s of [-1, 1]) sofa.add(mesh(roundedBox(0.16, 0.3, 0.85, 0.05), leather, s * (SL / 2 - 0.08), 0.54, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sofa.add(mesh(box(0.03, 0.1, 0.03), chrome, sx * (SL / 2 - 0.1), 0.05, sz * 0.36, false));
  g.add(sofa);
  // side tables with white cube lamps
  const cubeLamps: THREE.PointLight[] = [];
  for (const x of [SX - SL / 2 - 0.4, SX + SL / 2 + 0.4]) {
    g.add(mesh(box(0.5, 0.5, 0.5), toon('#d8d6d0'), x, 0.25, SZ));
    g.add(mesh(box(0.06, 0.06, 0.06), chrome, x, 0.53, SZ, false));
    g.add(mesh(box(0.36, 0.42, 0.36), toon('#fffaf0', { emissive: '#fff0d0', emissiveIntensity: 0.85 }), x, 0.77, SZ, false));
    const l = new THREE.PointLight('#ffe8c0', 2.2, 3.5, 1.4);
    l.position.set(x, 1.0, SZ + 0.3);
    g.add(l);
    cubeLamps.push(l);
  }
  /** Black tufted leather club chair with a chrome base, facing local +z. */
  const clubChair = (x: number, z: number, rotY: number) => {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = rotY;
    c.add(occluder(mesh(roundedBox(0.8, 0.3, 0.78, 0.04), leather, 0, 0.27, 0)));
    c.add(mesh(roundedBox(0.58, 0.12, 0.6, 0.05), leatherHi, 0, 0.45, 0.06));
    c.add(occluder(mesh(roundedBox(0.8, 0.5, 0.16, 0.05), toon('#ffffff', { map: tufted('#2a2a30', [3, 2]) }), 0, 0.66, -0.31)));
    for (const s of [-1, 1]) c.add(mesh(roundedBox(0.13, 0.34, 0.74, 0.04), leather, s * 0.33, 0.55, 0));
    c.add(mesh(box(0.7, 0.03, 0.66), chrome, 0, 0.1, 0, false));
    g.add(c);
  };

  // ---- the desk ---------------------------------------------------------------------------------------
  const DX = -2.3, DZ = -1.35, DL = 2.0, DD = 0.9, DH = 0.75;
  g.add(occluder(mesh(box(DL, 0.025, DD), glass, DX, DH, DZ)));
  g.add(mesh(box(DL, 0.03, 0.01), toon('#9ab8c0'), DX, DH, DZ + DD / 2, false));
  // chrome X legs at each end and a stretcher
  for (const s of [-1, 1]) {
    const x = DX + s * (DL / 2 - 0.15);
    for (const k of [-1, 1]) {
      const leg = mesh(box(0.035, 1.0, 0.035), chrome, x, DH / 2, DZ, false);
      leg.rotation.x = k * 0.82;
      g.add(leg);
    }
  }
  g.add(mesh(box(DL - 0.3, 0.03, 0.03), chrome, DX, DH / 2, DZ, false));
  const top = DH + 0.013;
  // silver laptop, its lid toward the room
  g.add(mesh(box(0.38, 0.02, 0.27), chrome, DX + 0.05, top + 0.01, DZ - 0.12, false));
  const lid = mesh(box(0.38, 0.27, 0.012), chrome, DX + 0.05, top + 0.14, DZ + 0.02, false);
  lid.rotation.x = -0.25;
  g.add(lid);
  g.add(mesh(cyl(0.03, 0.03, 0.002, 8).rotateX(Math.PI / 2), toon('#e8e8ec', { emissive: '#ffffff', emissiveIntensity: 0.4 }), DX + 0.05, top + 0.15, DZ + 0.06, false));
  // white triangular organisers
  for (const [dx, h] of [[-0.75, 0.24], [-0.55, 0.18]] as const) {
    const t = mesh(cyl(0.11, 0.11, 0.1, 3).rotateX(Math.PI / 2), toon('#f0f0ec'), DX + dx, top + h / 2, DZ + 0.05, false);
    t.scale.y = h / 0.19;
    g.add(t);
  }
  // the arc lamp, the blue glass ball, a phone, a stack of folders
  const LX = DX + 0.75, LZ = DZ - 0.25;
  g.add(mesh(cyl(0.09, 0.1, 0.03, 10), chrome, LX, top + 0.015, LZ, false));
  const arc = mesh(new THREE.TorusGeometry(0.28, 0.008, 4, 12, Math.PI * 0.8), chrome, LX - 0.15, top + 0.05, LZ + 0.05, false);
  arc.rotation.z = 0.2;
  g.add(arc);
  g.add(mesh(new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), chrome, LX - 0.42, top + 0.32, LZ + 0.05, false));
  g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), toon('#3a6ad8', { emissive: '#1a3a8a', emissiveIntensity: 0.5 }), DX + 0.5, top + 0.06, DZ + 0.2, false));
  g.add(mesh(roundedBox(0.22, 0.06, 0.18, 0.02), toon('#3a3a3e'), DX - 0.4, top + 0.03, DZ - 0.2, false));
  g.add(mesh(box(0.3, 0.04, 0.22), toon('#2a2a2e'), DX + 0.55, top + 0.02, DZ + 0.15, false).rotateY(0.2));
  // Barney's high-backed black leather chair
  const exec = new THREE.Group();
  exec.position.set(DX + 0.05, 0, DZ - 0.85);
  exec.add(mesh(roundedBox(0.6, 0.12, 0.56, 0.04), leather, 0, 0.48, 0));
  exec.add(occluder(mesh(roundedBox(0.62, 1.0, 0.14, 0.05), toon('#ffffff', { map: tufted('#18181a', [1, 5]) }), 0, 1.05, -0.26)));
  exec.add(mesh(roundedBox(0.52, 0.22, 0.12, 0.05), leatherHi, 0, 1.55, -0.24, false));
  for (const s of [-1, 1]) exec.add(mesh(roundedBox(0.07, 0.06, 0.4, 0.02), leatherHi, s * 0.33, 0.7, 0.02, false));
  exec.add(mesh(cyl(0.035, 0.035, 0.36, 6), chrome, 0, 0.26, 0, false));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    exec.add(mesh(box(0.04, 0.03, 0.3), chrome, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, false).rotateY(a));
  }
  g.add(exec);
  // club chairs facing each other across the front of the desk (cheated toward the audience), one out by the window
  const GL: [number, number, number] = [DX - DL / 2 - 0.35, DZ + 1.05, Math.PI / 2 - 0.35];
  const GR: [number, number, number] = [DX + DL / 2 + 0.35, DZ + 1.05, -Math.PI / 2 + 0.35];
  const AC: [number, number, number] = [1.55, 0.35, -0.95];
  for (const c of [GL, GR, AC]) clubChair(...c);

  // ---- the door, downstage on the right wall ------------------------------------------------------------
  const DOOR_Z = 0.6;
  const front = door(g, RIGHT - 0.02, DOOR_Z, -Math.PI / 2, '#5a3a22', { frameColor: '#3a2214' });

  // ---- lights -----------------------------------------------------------------------------------------
  for (const [x, z] of [[-2.3, -1.6], [3.5, -2.0], [0, 0.8], [-4.4, -2.4]] as const) g.add(mesh(cyl(0.12, 0.12, 0.02, 8), glow('#fff4e0', 1.3), x, H - 0.01, z, false));
  const hemi = new THREE.HemisphereLight('#ffe8d0', '#4a3424', 1.5);
  g.add(hemi);
  const key = keyLight(g, '#fff2e4', 1.7, [1.5, 7, 7], [-1.0, 0, -1.8]);
  const wall = new THREE.PointLight('#ffd8a8', 3.2, 6, 1.3);
  wall.position.set(-3.0, 2.4, BACK + 1.4);
  g.add(wall);
  const windowLight = new THREE.PointLight('#7a9aff', 1.5, 5, 1.3);
  windowLight.position.set(3.5, 1.8, BACK + 1.0);
  g.add(windowLight);
  const lampGlow = new THREE.PointLight('#fff0d8', 1.4, 2.5, 1.4);
  lampGlow.position.set(CR[0] + 0.3, 1.1, BACK + 0.7);
  g.add(lampGlow);

  const N = nodes({
    door: [RIGHT - 0.6, DOOR_Z], right: [4.0, -0.2], lounge_front: [3, 1.4], chair_front: [0.4, 1.4], sofa: [3.5, -1.95], win: [1.25, -3.0], sofa_turn: [1.4, -1.65], center: [0.4, 0.5], front: [-0.6, 2.2],
    desk_r: [-0.2, -0.85], guest_r: [-1.65, 0.4], guest_l: [-2.95, 0.4], desk_front: [-2.3, 0.4], behind: [-0.95, -2.55], desk_l: [-4.5, -0.9], front_l: [-4.5, 1.0], posters: [-4.6, -2.25],
  });
  return {
    id: 'barneys_office',
    name: "Barney's Office",
    group: g,
    nodes: N,
    edges: [
      ['door', 'right'], ['right', 'sofa'], ['right', 'lounge_front'], ['lounge_front', 'chair_front'], ['chair_front', 'center'], ['sofa', 'sofa_turn'], ['sofa_turn', 'win'], ['center', 'win'], ['center', 'front'], ['center', 'desk_r'], ['front', 'guest_r'], ['front', 'guest_l'], ['guest_l', 'desk_front'], ['guest_r', 'desk_front'],
      ['desk_r', 'behind'], ['front', 'front_l'], ['front_l', 'desk_l'], ['desk_l', 'posters'], ['center', 'front_l'],
    ],
    door: 'door',
    doors: { door: front },
    marks: {
      desk_chair: mark(DX + 0.05, DZ - 0.8, 0, 'behind', "Barney's high-backed black leather chair behind the glass desk (the boss seat)", { seat: 0.5, approach: [DX + 0.75, DZ - 0.95] }),
      guest_chair_left: mark(GL[0] + 0.05, GL[1], GL[2], 'guest_l', 'black leather club chair in front of the desk, left', { seat: 0.48, approach: [-2.95, 0.4], depth: 0.34 }),
      guest_chair_right: mark(GR[0] - 0.05, GR[1], GR[2], 'guest_r', 'black leather club chair in front of the desk, right', { seat: 0.48, approach: [-1.65, 0.4], depth: 0.34 }),
      armchair: mark(AC[0] - 0.05, AC[1] - 0.05, AC[2], 'center', 'black leather club chair out by the window, angled toward the desk', { seat: 0.48, approach: [0.8, 0.85], depth: 0.38 }),
      desk_edge: mark(DX - 0.35, DZ + DD / 2 + 0.05, 0, 'desk_front', 'perched on the front edge of the glass desk, facing the room', { seat: DH + 0.01, approach: [DX - 0.35, DZ + 1.0] }),
      couch_left: mark(SX - 0.52, SZ + 0.12, 0, 'sofa', 'the black leather sofa under the window, left cushion', { seat: 0.48, approach: [SX - 0.52, SZ + 0.8], depth: 0.31 }),
      couch_right: mark(SX + 0.52, SZ + 0.12, 0, 'sofa', 'the black leather sofa under the window, right cushion', { seat: 0.48, approach: [SX + 0.52, SZ + 0.8], depth: 0.31 }),
      posters: mark(-4.6, -2.25, Math.PI + 0.55, 'posters', 'admiring the wall of motivational posters (CONFORMITY, TEAMWORK, AWESOMENESS...)'),
      bar_cart: mark(BC, BACK + 1.0, Math.PI - 0.5, 'behind', 'at the chrome bar cart under the posters, pouring scotch'),
      window: mark(1.65, BACK + 0.5, Math.PI - 0.4, 'win', 'at the window, peeking through the vertical blinds'),
      center: mark(0.4, 0.5, -0.2, 'center', 'middle of the office'),
      door: mark(RIGHT - 0.4, DOOR_Z, -Math.PI / 2, 'door', 'the office door, downstage on the right wall'),
    },
    wides: [
      { pos: v3(-0.3, 1.75, 6.8), target: v3(-0.3, 1.35, -1.8), fov: 48 },
      { pos: v3(-2.1, 1.45, 2.8), target: v3(-2.3, 1.15, -2.0), fov: 46 },
      { pos: v3(1.2, 1.5, 3.0), target: v3(2.8, 1.0, -2.2), fov: 46 },
      { pos: v3(2.2, 1.55, 3.4), target: v3(-3.2, 1.35, -2.2), fov: 48 },
    ],
    ambience: 'office',
    background: [],
    doorSound: 'none',
    setTime(t) {
      const night = t === 'night';
      backdrop.material = night ? nightSky : daySky;
      slats.forEach((sl, i) => (sl.material = (night ? slatNight : slatDay)[i % 2]));
      hemi.intensity = night ? 1.55 : 1.9;
      key.intensity = night ? 1.65 : 2.0;
      windowLight.color.set(night ? '#7a9aff' : '#fff4e0');
      windowLight.intensity = night ? 1.5 : 4;
      for (const l of cubeLamps) l.intensity = night ? 2.2 : 1.2;
    },
  };
}
