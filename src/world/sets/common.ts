import * as THREE from 'three';
import type { LocationId, TimeOfDay, CharacterId } from '../../script/types';
import { toon, glow, box, mesh, roundedBox, cyl, occluder, dressing } from '../../engine/materials';
import { hallway, painting } from '../../engine/textures';
import type { SitPose } from '../actor';

export interface Mark {
  pos: THREE.Vector3;
  facing: number; // radians, 0 = facing the audience (+z)
  seat: number | null; // seat height if this is a seat
  node: string; // nav node used to reach this mark
  approach?: THREE.Vector3; // last point before stepping onto the mark
  hint: string; // description for the LLM
  pose?: SitPose; // how to sit here
  prop?: THREE.Object3D; // held in the lap by whoever sits here
  depth?: number; // a deep couch: how far forward of the mark its front edge is, so knees clear it
  back?: readonly number[]; // how far behind the mark the backrest is, at each of BACK_HEIGHTS (measured by the stage)
}

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  label?: string;
}

export type Ambience = 'bar' | 'apartment' | 'penthouse' | 'city' | 'office' | 'car' | 'none';
export type DoorSound = 'knock' | 'bell' | 'car' | 'elevator' | 'none';

export interface StageSet {
  id: LocationId;
  name: string;
  group: THREE.Group;
  marks: Record<string, Mark>;
  nodes: Record<string, THREE.Vector3>;
  edges: [string, string][];
  door: string;
  wides: Shot[];
  /** Closed sets (the cars): every generated angle keeps the camera inside this box, never outside the body. */
  cameraBounds?: THREE.Box3;
  /** Fixed windshield / cabin mounts. Vehicles use these for dialogue instead of orbiting the actors. */
  dialogueCameras?: THREE.Vector3[];
  /** The open side of a sitcom set, facing the cameras and the audience; positive is outside. Generated
   *  angles never look out through it. */
  openSide?: THREE.Plane;
  /** Keep generated two-shots near the actors; distant pairs get singles instead. */
  maxTwoShotDistance?: number;
  ambience: Ambience;
  background: { character: CharacterId; mark: string }[];
  /** What you hear when someone comes in (defaults to the doorbell). */
  doorSound?: DoorSound;
  /** Cars: there's no standing up. People slide between seats and get in and out through the door. */
  seated?: boolean;
  /** Marks nobody gets put on unless the script asks for them (the bartender's spot, the driver's seat). */
  reserved?: string[];
  /** Separate vehicle compartments use their own door. No route crosses a solid partition. */
  entrances?: Record<string, string>;
  /** Doors, by the door mark they lead in from: on hinges, opened by hand on the way in and out, or a lift's doors
   *  that slide apart by themselves. */
  doors?: Record<string, Door | SlidingDoor>;
  setTime(t: TimeOfDay): void;
  update?(dt: number, t: number): void;
  /** Floor height at a point, for sets with raised areas (defaults to 0). */
  floorAt?(x: number, z: number): number;
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function mark(x: number, z: number, facing: number, node: string, hint: string, opts: { seat?: number; approach?: [number, number]; pose?: SitPose; prop?: THREE.Object3D; depth?: number } = {}): Mark {
  return {
    pos: v3(x, 0, z),
    facing,
    seat: opts.seat ?? null,
    node,
    approach: opts.approach ? v3(opts.approach[0], 0, opts.approach[1]) : undefined,
    hint,
    pose: opts.pose,
    prop: opts.prop,
    depth: opts.depth,
  };
}

export function nodes(def: Record<string, [number, number]>) {
  const out: Record<string, THREE.Vector3> = {};
  for (const [k, [x, z]] of Object.entries(def)) out[k] = v3(x, 0, z);
  return out;
}

/** Floor, three walls and a ceiling. The fourth wall is the audience. */
export function room(g: THREE.Group, o: {
  w: number; d: number; h: number; floor: THREE.Material; back: THREE.Material; left?: THREE.Material; right?: THREE.Material; ceiling?: string;
}) {
  const { w, d, h } = o;
  // Carry the shell past the master camera, including the ceiling above it.
  const backZ = -d / 2, frontZ = 16, depth = frontZ - backZ, centerZ = (frontZ + backZ) / 2;
  const floor = mesh(new THREE.PlaneGeometry(w, depth), o.floor, 0, 0, centerZ);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  g.add(floor);
  const back = mesh(new THREE.PlaneGeometry(w, h), o.back, 0, h / 2, -d / 2);
  back.castShadow = false;
  g.add(back);
  const left = mesh(new THREE.PlaneGeometry(depth, h), o.left ?? o.back, -w / 2, h / 2, centerZ);
  left.rotation.y = Math.PI / 2;
  left.castShadow = false;
  g.add(left);
  const right = mesh(new THREE.PlaneGeometry(depth, h), o.right ?? o.back, w / 2, h / 2, centerZ);
  right.rotation.y = -Math.PI / 2;
  right.castShadow = false;
  g.add(right);
  const ceil = mesh(new THREE.PlaneGeometry(w, depth), toon(o.ceiling ?? '#2a221c'), 0, h, centerZ);
  ceil.rotation.x = Math.PI / 2;
  ceil.castShadow = false;
  g.add(ceil);
}

/** Lower wall band (wainscoting / baseboard) along a wall. */
export function band(g: THREE.Group, mat: THREE.Material, x: number, z: number, len: number, height: number, rotY = 0, depth = 0.06) {
  const m = mesh(box(len, height, depth), mat, x, height / 2, z);
  m.rotation.y = rotY;
  m.castShadow = false;
  g.add(m);
  return m;
}

export function frame(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, seed: number, rotY = 0, frameColor = '#2a1b10') {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = rotY;
  grp.add(mesh(box(w + 0.08, h + 0.08, 0.04), toon(frameColor), 0, 0, 0, false));
  grp.add(mesh(new THREE.PlaneGeometry(w, h), toon('#ffffff', { map: painting(seed) }), 0, 0, 0.022, false));
  g.add(grp);
  return grp;
}

export function pendant(g: THREE.Group, x: number, y: number, z: number, shade = '#2c4a34', light?: { color: string; intensity: number; distance?: number }) {
  g.add(mesh(cyl(0.008, 0.008, 3.4 - y, 4), toon('#111'), x, y + (3.4 - y) / 2, z, false));
  g.add(mesh(cyl(0.06, 0.24, 0.2, 8), toon(shade), x, y, z, false));
  g.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), glow('#ffd28a', 1.6), x, y - 0.1, z, false));
  if (light) {
    const l = new THREE.PointLight(light.color, light.intensity, light.distance ?? 7, 1.4);
    l.position.set(x, y - 0.2, z);
    g.add(l);
    return l;
  }
  return null;
}

export function window_(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, mat: THREE.Material, frameColor = '#e9e2d0', rotY = 0, mullions = 2) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  grp.rotation.y = rotY;
  const pane = mesh(new THREE.PlaneGeometry(w, h), mat, 0, 0, 0.01, false);
  grp.add(pane);
  const fm = toon(frameColor);
  grp.add(mesh(box(w + 0.12, 0.08, 0.1), fm, 0, h / 2, 0.03, false));
  grp.add(mesh(box(w + 0.2, 0.08, 0.2), fm, 0, -h / 2, 0.06, false));
  grp.add(mesh(box(0.08, h, 0.1), fm, -w / 2, 0, 0.03, false));
  grp.add(mesh(box(0.08, h, 0.1), fm, w / 2, 0, 0.03, false));
  for (let i = 1; i <= mullions; i++) grp.add(mesh(box(0.04, h, 0.05), fm, -w / 2 + (w * i) / (mullions + 1), 0, 0.03, false));
  grp.add(mesh(box(w, 0.04, 0.05), fm, 0, h * 0.1, 0.03, false));
  g.add(grp);
  return pane;
}

/** Half the width of a door leaf, and how far its knobs sit from the hinges. */
const LEAF = 0.525, KNOB = 0.905, KNOB_Y = 1.05;
/** The leaf turns on hinges at its room-side face. */
const HINGE_Z = 0.06;
let corridor: THREE.Material | null = null;

/**
 * A door that swings open into the room on its hinges, onto a dim corridor (or whatever `beyond` shows). In its
 * own space the wall is at z = 0 with the room toward +z and the doorway centered on x = 0; `hinge` is the side
 * the hinges are on (-1 is -x). Spots around it are measured from the hinges: `u` along the wall toward the
 * latch, `v` out into the room.
 */
export class Door extends THREE.Group {
  readonly leaf = new THREE.Group();
  readonly glass: THREE.Mesh | null = null;
  readonly beyond: THREE.Mesh;
  /** How far open, in radians into the room. */
  angle = 0;
  /** While someone holds it, the angle their hand puts it at, asked every frame. */
  private follow: (() => number) | null = null;
  private swinging: { from: number; to: number; t: number; dur: number; done: () => void } | null = null;

  constructor(readonly hinge: 1 | -1, color: string, opts: { glass?: THREE.Material; frameColor?: string; beyond?: THREE.Material }) {
    super();
    const fm = toon(opts.frameColor ?? '#e8dfcc');
    this.add(mesh(box(0.1, 2.35, 0.1), fm, -0.56, 1.17, 0.05, false));
    this.add(mesh(box(0.1, 2.35, 0.1), fm, 0.56, 1.17, 0.05, false));
    this.add(mesh(box(1.22, 0.1, 0.1), fm, 0, 2.33, 0.05, false));
    corridor ??= toon('#ffffff', { map: hallway(), emissive: '#ffffff', emissiveIntensity: 0.35 });
    // (inside the shut leaf, in front of any baseboard or rail along the wall; only there while it's open)
    this.beyond = mesh(new THREE.PlaneGeometry(1.02, 2.25), opts.beyond ?? corridor, 0, 1.125, 0.05, false);
    this.beyond.visible = false;
    this.add(this.beyond);
    // the leaf, built around its hinges
    const L = this.leaf, x = -hinge * LEAF, z = -HINGE_Z;
    L.position.set(hinge * LEAF, 0, HINGE_Z);
    L.add(mesh(box(1.05, 2.25, 0.06), toon(color), x, 1.12, z + 0.03, false));
    const brass = toon('#c9a227');
    for (const side of [1, -1]) L.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), brass, -hinge * KNOB, KNOB_Y, side > 0 ? 0.03 : z - 0.03, false));
    if (opts.glass) L.add((this as { glass: THREE.Mesh }).glass = mesh(new THREE.PlaneGeometry(0.6, 0.8), opts.glass, x, 1.6, z + 0.065, false));
    else {
      L.add(mesh(box(0.7, 0.8, 0.02), toon(new THREE.Color(color).multiplyScalar(0.8)), x, 1.6, z + 0.065, false));
      L.add(mesh(box(0.7, 0.7, 0.02), toon(new THREE.Color(color).multiplyScalar(0.8)), x, 0.6, z + 0.065, false));
    }
    this.add(L);
  }

  /** A spot on the floor, `u` along the wall from the hinges toward the latch and `v` out into the room. */
  spot(u: number, v: number) {
    this.updateWorldMatrix(true, false);
    return this.localToWorld(new THREE.Vector3(this.hinge * (LEAF - u), 0, v)).setY(0);
  }

  /** The same spot `r` from the hinges, `a` radians round from the wall toward the room. */
  around(r: number, a: number) {
    return this.spot(r * Math.cos(a), HINGE_Z + r * Math.sin(a));
  }

  /** How far round from the wall a point is, seen from the hinges (negative: out past the wall). */
  angleOf(p: THREE.Vector3) {
    this.updateWorldMatrix(true, false);
    const l = this.worldToLocal(p.clone());
    return Math.atan2(l.z - HINGE_Z, LEAF - this.hinge * l.x);
  }

  /** The knob on the room side, or the outside. */
  knob(side: 'room' | 'out') {
    this.leaf.updateWorldMatrix(true, false);
    return this.leaf.localToWorld(new THREE.Vector3(-this.hinge * KNOB, KNOB_Y, side === 'room' ? 0.03 : -HINGE_Z - 0.03));
  }

  /** Which way the door faces, into the room, as an actor's facing. */
  get facing() {
    this.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(this.matrixWorld);
    return Math.atan2(n.x, n.z);
  }

  /** Which way a face of the leaf faces now (the room side, or the outside), in world space. */
  face(side: 'room' | 'out') {
    this.leaf.updateWorldMatrix(true, false);
    return new THREE.Vector3(0, 0, side === 'room' ? 1 : -1).transformDirection(this.leaf.matrixWorld);
  }

  /** Held by someone, it goes where their hand puts it (asked every frame), until it's let go (null) or swung. */
  hold(at: (() => number) | null) {
    this.swinging?.done();
    this.swinging = null;
    this.follow = at;
  }

  /** Where to take hold of it from somewhere: the knob on the face toward them, or its edge when they're edge-on. */
  handle(from: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
    this.leaf.updateWorldMatrix(true, false);
    const room = this.face('room');
    const tip = this.leaf.localToWorld(new THREE.Vector3(-this.hinge * KNOB, KNOB_Y, -HINGE_Z / 2));
    const s = THREE.MathUtils.clamp(room.dot(from.clone().setY(tip.y).sub(tip)) / 0.3, -1, 1);
    const edge = 1 - Math.abs(s);
    const at = this.leaf.localToWorld(new THREE.Vector3(-this.hinge * (KNOB + 0.13 * edge), KNOB_Y, -HINGE_Z / 2 + 0.09 * s));
    const along = tip.clone().sub(this.leaf.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
    return [at, room.multiplyScalar(-s).addScaledVector(along, -edge).normalize()];
  }

  /** Swing to an angle over some seconds, easing in and out; resolves when it gets there (or is interrupted). */
  swing(to: number, seconds: number) {
    this.follow = null;
    this.swinging?.done();
    return new Promise<void>((done) => {
      this.swinging = { from: this.angle, to, t: 0, dur: Math.max(0.01, seconds), done };
    });
  }

  /** Shut, at once, with nobody holding it. */
  reset() {
    this.follow = null;
    this.swinging?.done();
    this.swinging = null;
    this.angle = 0;
    this.leaf.rotation.y = 0;
    this.beyond.visible = false;
  }

  update(dt: number) {
    const s = this.swinging;
    if (this.follow) this.angle += (THREE.MathUtils.clamp(this.follow(), 0, Math.PI / 2) - this.angle) * Math.min(1, dt * 14);
    else if (s) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      this.angle = s.from + (s.to - s.from) * k * k * (3 - 2 * k);
      if (k >= 1) {
        this.swinging = null;
        s.done();
      }
    }
    this.leaf.rotation.y = this.hinge * this.angle;
    this.beyond.visible = this.angle > 0.002;
  }
}

/**
 * A lift's doors: two leaves that slide apart from the middle into pockets behind the wall, onto whatever's built
 * beyond (a landing). In its own space the wall is at z = 0 with the room toward +z and the opening centered on
 * x = 0; the leaves run just behind the wall. Nobody touches them: they open, people step through, they close.
 */
export class SlidingDoor extends THREE.Group {
  readonly leaves: THREE.Group[] = [];
  /** How far open, from 0 (shut) to 1. */
  open = 0;
  private sliding: { from: number; to: number; t: number; dur: number; done: () => void } | null = null;

  constructor(readonly width: number, height: number, leaf: THREE.Material, edge: THREE.Material) {
    super();
    for (const s of [-1, 1]) {
      // (each leaf a touch wider than half the opening, out under the frame; the two meet in the middle)
      const L = new THREE.Group();
      L.add(mesh(box(width / 2 + 0.02, height, 0.03), leaf, s * (width / 4 + 0.01), height / 2, -0.02, false));
      L.add(mesh(box(0.012, height, 0.034), edge, s * 0.006, height / 2, -0.02, false));
      this.leaves.push(L);
      this.add(L);
    }
  }

  /** A spot on the floor, `x` across the opening from its middle and `v` out into the room (negative: beyond). */
  at(x: number, v: number) {
    this.updateWorldMatrix(true, false);
    return this.localToWorld(new THREE.Vector3(x, 0, v)).setY(0);
  }

  /** Which way the doors face, into the room, as an actor's facing. */
  get facing() {
    this.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(this.matrixWorld);
    return Math.atan2(n.x, n.z);
  }

  /** Where they're headed (or are, standing still), from 0 (shut) to 1 (open). */
  get target() {
    return this.sliding?.to ?? this.open;
  }

  /** Slide open (1) or shut (0), easing in and out, taking `seconds` for the whole way; resolves when they get there
   *  (or are sent the other way). */
  slide(to: number, seconds: number) {
    this.sliding?.done();
    return new Promise<void>((done) => {
      this.sliding = { from: this.open, to, t: 0, dur: Math.max(0.01, seconds * Math.abs(to - this.open)), done };
    });
  }

  /** Shut, at once. */
  reset() {
    this.sliding?.done();
    this.sliding = null;
    this.open = 0;
    this.update(0);
  }

  update(dt: number) {
    const s = this.sliding;
    if (s) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      this.open = s.from + (s.to - s.from) * k * k * (3 - 2 * k);
      if (k >= 1) {
        this.sliding = null;
        s.done();
      }
    }
    this.leaves.forEach((L, i) => { L.position.x = (i ? 1 : -1) * this.open * (this.width / 2 + 0.03); });
  }
}

export function door(g: THREE.Group, x: number, z: number, rotY: number, color: string, opts: { glass?: THREE.Material; frameColor?: string; hinge?: 1 | -1; beyond?: THREE.Material } = {}) {
  const d = new Door(opts.hinge ?? -1, color, opts);
  d.position.set(x, 0, z);
  d.rotation.y = rotY;
  g.add(d);
  return d;
}

/** Simple upholstered couch along x, facing +z. Returns its group. */
export function couch(g: THREE.Group, x: number, z: number, len: number, fabric: string, frame = '#3a2a1e', rotY = 0, seatH = 0.45) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rotY;
  const f = toon(fabric);
  const dark = toon(new THREE.Color(fabric).multiplyScalar(0.8));
  grp.add(occluder(mesh(roundedBox(len, seatH - 0.1, 0.9, 0.04), dark, 0, (seatH - 0.1) / 2 + 0.08, 0)));
  const cushions = Math.max(1, Math.round(len / 0.85));
  const cw = (len - 0.3) / cushions;
  for (let i = 0; i < cushions; i++)
    grp.add(mesh(roundedBox(cw - 0.03, 0.14, 0.7, 0.05), f, -len / 2 + 0.15 + cw * (i + 0.5), seatH - 0.05, 0.08));
  grp.add(occluder(mesh(roundedBox(len, 0.55, 0.22, 0.06), f, 0, seatH + 0.22, -0.36)));
  for (const s of [1, -1]) grp.add(occluder(mesh(roundedBox(0.2, 0.32, 0.9, 0.06), f, s * (len / 2 - 0.1), seatH + 0.08, 0)));
  for (const sx of [1, -1]) for (const sz of [1, -1]) grp.add(mesh(box(0.06, 0.08, 0.06), toon(frame), sx * (len / 2 - 0.08), 0.04, sz * 0.38));
  g.add(grp);
  return grp;
}

export function armchair(g: THREE.Group, x: number, z: number, rotY: number, fabric: string) {
  return couch(g, x, z, 1.05, fabric, '#2a1e14', rotY);
}

export function bottles(g: THREE.Group, x0: number, y: number, z: number, count: number, spacing: number, rotY = 0, seed = 1) {
  const cols = ['#3d6b2e', '#7a3b12', '#c9a227', '#2e4a6b', '#d9d0b8', '#5a1e1e', '#b8742a'];
  const grp = new THREE.Group();
  grp.position.set(x0, y, z);
  grp.rotation.y = rotY;
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const h = 0.22 + r * 0.14;
    const c = cols[Math.floor(r * 97) % cols.length];
    const m = toon(c, { emissive: c, emissiveIntensity: 0.25 });
    grp.add(mesh(cyl(0.04, 0.045, h, 6), m, i * spacing, h / 2, 0, false));
    grp.add(mesh(cyl(0.015, 0.02, 0.08, 4), m, i * spacing, h + 0.04, 0, false));
  }
  g.add(grp);
  return grp;
}

export function plant(g: THREE.Group, x: number, z: number, scale = 1) {
  g.add(dressing(mesh(cyl(0.16 * scale, 0.12 * scale, 0.3 * scale, 8), toon('#8a4a2a'), x, 0.15 * scale, z)));
  const leaf = toon('#3f7a3a');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const l = mesh(box(0.08 * scale, 0.5 * scale, 0.02), leaf, x + Math.cos(a) * 0.08 * scale, 0.5 * scale, z + Math.sin(a) * 0.08 * scale);
    l.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5);
    g.add(dressing(l));
  }
}

/** A soft fill from upstage with no shadows. A sitcom's lighting grid also lights faces turned away from the
 *  audience, so the reverse angles on them read as well as the forward ones. */
export function fillLight(g: THREE.Group, color: string, intensity: number, pos: [number, number, number], target: [number, number, number]) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  l.target.position.set(...target);
  g.add(l, l.target);
  return l;
}

export function keyLight(g: THREE.Group, color: string, intensity: number, pos: [number, number, number], target: [number, number, number]) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  l.target.position.set(...target);
  l.castShadow = true;
  l.shadow.mapSize.set(1024, 1024);
  const c = l.shadow.camera;
  c.left = -8; c.right = 8; c.top = 6; c.bottom = -6; c.near = 0.5; c.far = 30;
  l.shadow.bias = -0.0008;
  l.shadow.normalBias = 0.02;
  g.add(l, l.target);
  return l;
}
