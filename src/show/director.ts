import * as THREE from 'three';
import type { Stage } from './stage';
import type { Actor } from '../world/actor';
import type { EstablishingShot } from '../world/sets/establishing';
import type { CharacterId, ShotIntent } from '../script/types';
import { damp, mulberry32 } from '../util';

type ShotKind = 'wide' | 'closeup' | 'two' | 'ots' | 'establishing' | 'selfie';

/** Where the lens is, what it's aimed at, and how wide it sees. */
type Framing = { pos: THREE.Vector3; target: THREE.Vector3; fov: number };

interface ActiveShot extends Framing {
  kind: ShotKind;
  follow?: Actor;
  followOffset?: THREE.Vector3;
  push: number; // dolly speed toward target, m/s, for 4 s after the cut; 0 for a locked-off shot
  /** A push-in: the lens moves in along its line from `from` to `to` (m from what it's aimed at) over `seconds`,
   *  easing in and out; `t` is how far into the move it is. */
  dolly?: { from: number; to: number; seconds: number; t: number };
  subject?: CharacterId;
  drift?: EstablishingShot;
  subjects?: CharacterId[];
  /** Where the followed actor's body stood last frame; the camera tracks it, not the bobbing head. */
  followRoot?: THREE.Vector3;
  /** The aim is easing onto a new framing after a big head move, like sitting down. */
  reframing?: boolean;
  /** The lens has followed a walker (carried along, or panning): the framing it ends up on wasn't chosen, so it's
   *  checked on arrival. */
  carried?: boolean;
  /** When a carried lens last checked it wasn't being carried behind set dressing, and whether it was clear then. */
  tidyAt?: number;
  /** When a single last looked for a way round to the front of someone who had turned their back on it. */
  turnedAt?: number;
  tidy?: boolean;
  /** Where the shot was framed when we cut to it, before any jog, push or drift. */
  base?: Framing;
  /** A wide worked out for the people in it (see `Director.groupShot`), not one of the set's authored angles. */
  group?: boolean;
}

const look = (f: Framing) => f.target.clone().sub(f.pos).normalize();

/** Two framings a viewer can't tell apart: cutting from one to the other only reads as a jump. */
function sameFraming(a: Framing, b: Framing) {
  return a.pos.distanceTo(b.pos) < 0.25 && look(a).angleTo(look(b)) < 0.07 && Math.abs(a.fov - b.fov) < 4;
}

/** Two wides near enough alike (the same side, about the same size) that cutting from one to the other reads as a
 *  jump cut, not a new angle. */
export function nearFraming(a: Framing, b: Framing) {
  return a.pos.distanceTo(b.pos) < 0.9 && look(a).angleTo(look(b)) < 0.2 && Math.abs(a.fov - b.fov) < 0.25 * Math.max(a.fov, b.fov);
}

/** A group shot has to show its people at least this much bigger than the tightest authored wide holding them all,
 *  or that wide is the shot. */
const GROUP_GAIN = 1.3;
/** Two people get a group shot only when no authored wide shows them bigger than this (see `Director.size`). */
const GROUP_PAIR = 0.2;
/** Someone further than this (m) from everyone else in the group is off on their own across the set (at the door,
 *  in the kitchen, while the rest are on the couch): that's the master, not a group shot. */
const GROUP_STRAY = 3.2;
/** A group spread wider than this (m) from end to end is the whole room. */
const GROUP_SPREAD = 6.5;
/** Group shot lenses to try, vertical field of view in degrees. */
const GROUP_LENSES = [30, 36, 42, 50];
/** Where in the picture (from -1 at the bottom to 1 at the top) the tallest head in a group shot tops out, at most: a
 *  little headroom above it. */
const GROUP_HEADROOM = 0.78;
/** ... and where the lowest knees in it sit, at most: not up over a stretch of empty floor. */
const GROUP_FLOOR = -0.6;
/** How far out to each side of someone's head their shoulders reach (m), with a little room: a group shot keeps them
 *  in. */
const GROUP_SHOULDER = 0.3;
/** The closest (m) a group shot's lens comes to the nearest head in it: the wide camera stands back on the audience's
 *  side of the furniture, not in among the people. */
const GROUP_NEAREST = 2.2;
/** Someone turned further than this from the lens (cos of 75 degrees: hardly any face) is seen from behind. */
const GROUP_AWAY = Math.cos(THREE.MathUtils.degToRad(75));
/** Someone seen from behind in a group shot keeps to the outer quarter of the picture on either side: at least this far
 *  out from the middle, as a fraction of the half-width. */
const GROUP_SIDE = 0.5;
/** How near the lens (m) set dressing may stand in a group shot's picture: none at all in the foreground. */
const GROUP_DRESSING = 1.5;

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
/** Which way someone's body faces, flat. */
const forward = (a: Actor) => new THREE.Vector3(Math.sin(a.facing), 0, Math.cos(a.facing));
/** Which way someone's face is turned, flat: their body, and most of the way round to whoever they're looking at (as
 *  far as a neck goes; see the actor's look-at). */
function faceForward(a: Actor) {
  if (!a.lookAt) return forward(a);
  const p = a.position, toward = Math.atan2(a.lookAt.x - p.x, a.lookAt.z - p.z);
  const turn = Math.atan2(Math.sin(toward - a.facing), Math.cos(toward - a.facing));
  const yaw = a.facing + 0.8 * Math.max(-1.2, Math.min(1.2, turn));
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}
/** Seen from behind from here, body or face (the back of a head talking to someone further in reads as a back too),
 *  or about to be: turning round. */
function turnedAway(from: THREE.Vector3, a: Actor) {
  const lens = from.clone().sub(a.headWorld).setY(0).normalize();
  const turning = new THREE.Vector3(Math.sin(a.targetFacing), 0, Math.cos(a.targetFacing));
  return Math.min(lens.dot(forward(a)), lens.dot(faceForward(a)), lens.dot(turning)) < GROUP_AWAY;
}

/** The shortest a shot stays up on the show, in seconds: anything briefer reads as a glitch, not an edit. */
export const MIN_SHOT = 1.2;

/** The most of a single's picture (see `Director.clutter`) set dressing near the lens may block. */
export const MAX_CLUTTER = 0.1;

/** A push-in, the writer's move for a realization or a confession: a dolly from a medium shot in to a tight single,
 *  over the line it's on. */
const PUSH = {
  /** How far from the face it starts (m), furthest first (a closed cabin only has room for the nearer ones)... */
  from: [3.6, 3.1, 2.6, 2.2],
  /** ... and how close it ends, closest first, at most `tighten` of the way it started. */
  to: [1.1, 1.3, 1.5],
  tighten: 0.6,
  fov: 34,
  /** How long the move takes when the line's length isn't known, and the shortest and longest it may take (s). */
  seconds: 3,
  min: 1.4,
  max: 6,
};

/** Over-the-shoulder lenses to try: how far behind the listener's head (m), and the vertical field of view. */
const OTS_LENSES: [number, number][] = [[1.5, 30], [1.8, 28]];
/** A single with someone else's head in the foreground keeps it at least this far out (of the half-width) from the
 *  middle of the picture: the outer fifth of the frame. */
const DIRTY_EDGE = 0.6;
/** How far round from the front of the speaker's face an over-the-shoulder may look at them (cos of 50 degrees). */
const OTS_FACE = Math.cos(THREE.MathUtils.degToRad(50));

/** Multi-camera sitcom coverage: wides, singles, two-shots, over-the-shoulders. Shots are locked off
 *  unless the script asks for a move (a push-in, an establishing pan). */
export class Director {
  private shot: ActiveShot | null = null;
  /** A cut asked for before the shot on screen had its minimum: it goes in once that's up. */
  private pending: ActiveShot | null = null;
  /** The next cut is to a new place (another set, a scene staged afresh): no minimum on the shot before it. */
  private hard = false;
  /** How long a shot stays up before the next cut may replace it. The show holds to MIN_SHOT; at 0
   *  (set tours, tests) every angle asked for goes up at once. */
  minShot = 0;
  private lastCut = 0;
  /** When a walker last made us look for a wider angle; it may turn out to be the one we're on. */
  private lastReframe = 0;
  private time = 0;
  private ray = new THREE.Raycaster();
  private lens = new THREE.PerspectiveCamera();
  /** A single that found no angle is trying a two-shot instead (which mustn't come back for the single). */
  private fallback = false;
  private frustum = new THREE.Frustum();
  private sphere = new THREE.Sphere();
  onCut: (() => void) | null = null;
  /** A freeze frame: the camera holds dead still, even mid-dolly. */
  held = false;
  /** Coverage choices are seeded per beat, so a replayed beat is framed the way it was the first time. */
  private rng: () => number = Math.random;

  constructor(private camera: THREE.PerspectiveCamera, private stage: Stage) {}

  reseed(seed: number) {
    this.rng = mulberry32(seed);
  }

  /** The next coverage coin toss. */
  random() {
    return this.rng();
  }

  /** The lens as the current shot has it, to hold on to (a split-screen panel). */
  snapshot() {
    return this.camera.clone();
  }

  /** The screen's shape, width over height. */
  get aspect() {
    return this.camera.aspect;
  }

  /** A shot framed for a picture narrower than the screen (a split-screen panel, `aspect` wide), and its lens to hold
   *  on to. Every check that someone is in the picture is made against the panel, not the whole screen. */
  panel(aspect: number, frame: () => void) {
    const cam = this.camera, full = cam.aspect;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    try {
      frame();
      return this.snapshot();
    } finally {
      cam.aspect = full;
      cam.updateProjectionMatrix();
    }
  }

  /** Whatever was on screen before, the next cut goes in at once: a scene staged anew, a jump to another set. */
  fresh() {
    this.hard = true;
  }

  /** Seconds until the shot chosen has been up for its minimum: any held-back cut has gone in and played. */
  get settling() {
    return Math.max(0, this.minShot - (this.time - this.lastCut)) + (this.pending ? this.minShot : 0);
  }

  private cut(s: ActiveShot, hard = false) {
    s.followRoot = s.follow?.root.getWorldPosition(new THREE.Vector3());
    // Asked for the angle we're already on: stay on it. Re-cutting would restart a push or drift and
    // re-aim a single from scratch, a visible hitch between two copies of the same shot.
    const on = this.shot;
    if (on && on !== s && on.kind === s.kind && s.kind !== 'selfie' && on.follow === s.follow
      && (sameFraming(on, s) || (on.base && sameFraming(on.base, s)))) {
      on.subject = s.subject;
      on.subjects = s.subjects;
      on.followRoot = s.followRoot;
      this.pending = null;
      this.hard = false;
      return;
    }
    // Cutting away from a shot only just put up flashes it for a moment. Hold it until it has played,
    // and let the new line start over the end of it.
    if (!hard && !this.hard && on && this.time - this.lastCut < this.minShot) {
      this.pending = s;
      return;
    }
    this.commit(s);
  }

  private commit(s: ActiveShot) {
    s.base ??= { pos: s.pos.clone(), target: s.target.clone(), fov: s.fov };
    this.shot = s;
    this.pending = null;
    this.hard = false;
    this.lastCut = this.time;
    this.apply(0);
    this.onCut?.();
  }

  wide(index = 0, push = 0) {
    const w = this.stage.current.wides[index] ?? this.stage.current.wides[0];
    this.cut({ kind: 'wide', pos: w.pos.clone(), target: w.target.clone(), fov: w.fov, push, subjects: this.stage.castIds() });
  }

  /** A wide of these people, unless the one already up (or about to be) holds them all and is so nearly the same that
   *  cutting to it would only be a jump. (A group shot that has gone wrong since, someone turned their back on it in
   *  the middle of the picture, isn't held.) */
  private wideOn(shot: Framing, actors: Actor[], group = false) {
    const on = this.current;
    if (on?.kind === 'wide' && !on.push && !sameFraming(on, shot) && nearFraming(on.base ?? on, shot) && this.covers(on, actors)
      && !(on.group && actors.some((a) => this.backInMiddle(on, a)))) {
      on.subjects = actors.map((a) => a.def.id);
      return;
    }
    this.cut({ kind: 'wide', pos: shot.pos.clone(), target: shot.target.clone(), fov: shot.fov, push: 0, group, subjects: actors.map((a) => a.def.id) });
  }

  establish(s: EstablishingShot, moving = true) {
    this.cut({ kind: 'establishing', pos: s.pos.clone(), target: s.target.clone(), fov: s.fov, push: 0, drift: moving ? s : undefined }, true);
  }

  /** The wide for these people. A cluster of them sitting or standing together gets a group shot framed on them (see
   *  `groupShot`) when it's clean and shows them clearly bigger than any authored wide; otherwise it's the tightest
   *  authored angle with every one of them framed and unobstructed. `master` keeps to the authored wides: the first
   *  shot of a scene, or the writer asking for the whole room. */
  coverage(ids: CharacterId[], allowCloseup = true, master = false) {
    const actors = ids.filter((id) => this.stage.onStage(id)).map((id) => this.stage.actors[id]);
    if (!actors.length) return this.wide(0);
    const wides = this.stage.current.wides;
    const moving = actors.filter((a) => a.isWalking);
    let best = 0, score = -1, all = false;
    for (let i = wides.length - 1; i >= 0; i--) {
      const shot = wides[i];
      const visible = actors.filter((a) => this.covers(shot, [a]));
      if (visible.length === actors.length) { best = i; all = true; break; }
      const value = visible.length + visible.filter((a) => a.isWalking).length * (actors.length + 1);
      if (value >= score) { score = value; best = i; }
    }
    // (anyone on the move, coming, going or crossing the room, is watched from the authored angles)
    if (!master && !moving.length && !actors.some((a) => this.stage.atTheDoor(a.def.id))) {
      // (a pair has its two-shot as well: their wide stays the authored one, unless that's a far-off master)
      const authored = all ? this.size(wides[best], actors) : 0;
      const group = actors.length > 2 || authored < GROUP_PAIR ? this.groupShot(actors) : null;
      if (group && this.size(group, actors) >= GROUP_GAIN * authored) return this.wideOn(group, actors, true);
    }
    // Someone on their way out is watched from a wide, never chased to the door in a single.
    const staying = actors.filter((a) => !this.leaving(a));
    const priority = moving.filter((a) => !this.leaving(a));
    if (!priority.length) priority.push(...staying.slice(0, 1));
    if (allowCloseup && priority.length && !priority.every((a) => this.covers(wides[best], [a]))) return this.closeup(priority[0].def.id);
    this.wideOn(wides[best], actors);
  }

  /** The top of someone's head, hair and all, with a touch to spare. */
  private crown(a: Actor) {
    return a.headWorld.add(new THREE.Vector3(0, 0.16, 0));
  }

  /** Where someone's body leaves the bottom of a group shot: mid-thigh standing, the knees sitting down. */
  private knees(a: Actor) {
    const p = a.position.clone();
    if (a.seatHeight === null) p.y += 0.7 * a.legLen;
    else p.add(new THREE.Vector3(Math.sin(a.facing) * 0.4, a.seatHeight + 0.1, Math.cos(a.facing) * 0.4));
    return p;
  }

  /** How much of the picture's height people take up from here, from the tops of their heads to mid-thigh (or the
   *  knees, sitting), on average: 0 to 1. */
  private size(shot: Framing, actors: Actor[]) {
    const cam = this.probe(shot.pos, shot.target, shot.fov);
    return actors.reduce((sum, a) => sum + (this.crown(a).project(cam).y - this.knees(a).project(cam).y) / 2, 0) / actors.length;
  }

  /** A group shot worked out for these people, as the wide camera in a multi-camera sitcom frames the people in a
   *  conversation: from the audience's side of them, or the side most of them face, holding their heads and bodies
   *  down to mid-thigh with a little headroom. Of a few angles, heights and lenses, the one showing them biggest that's
   *  clean (see `groupFault`). Null when there's no such shot, or no call for one: a cabin (its own mounts), one
   *  person, someone on the move, or people spread across the set. */
  groupShot(actors: Actor[]): Framing | null {
    const set = this.stage.current;
    if (set.cameraBounds || set.dialogueCameras || actors.length < 2 || actors.length > 6 || actors.some((a) => a.isWalking)) return null;
    const flat = actors.map((a) => new THREE.Vector2(a.position.x, a.position.z));
    for (const [i, p] of flat.entries()) {
      const others = flat.filter((_, j) => j !== i).map((q) => q.distanceTo(p));
      if (Math.min(...others) > GROUP_STRAY || Math.max(...others) > GROUP_SPREAD) return null;
    }
    const audience = new THREE.Vector3(0, 0, 1);
    const facing = actors.reduce((sum, a) => sum.add(forward(a)), new THREE.Vector3());
    const sides = [audience];
    if (facing.length() > 0.4 * actors.length && facing.angleTo(audience) > 0.3) sides.push(facing.normalize());
    const dirs: THREE.Vector3[] = [];
    for (const side of sides) for (const turn of [0, 0.35, -0.35, 0.7, -0.7]) {
      const d = side.clone().applyAxisAngle(UP, turn);
      if (!dirs.some((o) => o.angleTo(d) < 0.15)) dirs.push(d);
    }
    const eye = actors.reduce((sum, a) => sum + a.headWorld.y, 0) / actors.length;
    const candidates: { shot: Framing; value: number }[] = [];
    for (const dir of dirs) {
      // (people with their backs to this side: fine at the edge of a group, not as a rule)
      const backs = actors.filter((a) => forward(a).dot(dir) < -0.3).length;
      if (backs > actors.length / 2) continue;
      for (const [high, lift] of [0.15, 0.5, 0.85].entries()) for (const fov of GROUP_LENSES) {
        const shot = this.frameGroup(actors, dir, Math.min(2.1, Math.max(1.2, eye + lift)), fov);
        if (!shot) continue;
        // (straight on from the audience, about eye level, reads best; the further round, the higher, and the more
        // backs, the less)
        const value = this.size(shot, actors) * (1 - 0.06 * dir.angleTo(sides[0])) * (1 - 0.08 * backs) * (1 - 0.03 * high)
          * (fov === GROUP_LENSES[0] || fov === GROUP_LENSES.at(-1) ? 0.97 : 1);
        candidates.push({ shot, value });
      }
    }
    candidates.sort((a, b) => b.value - a.value);
    for (const { shot } of candidates) if (!this.groupFault(shot, actors)) return shot;
    return null;
  }

  /** Frame a group from `dir` (the side the lens looks at them from), at a given height and lens: aimed across the
   *  middle of them, backed off just far enough to hold everyone, heads to knees and shoulder to shoulder (and never
   *  right on top of them), then tilted so the tallest head has a little headroom. */
  private frameGroup(actors: Actor[], dir: THREE.Vector3, height: number, fov: number): Framing | null {
    const across = new THREE.Vector3(-dir.z, 0, dir.x);
    const crowns = actors.map((a) => this.crown(a)), knees = actors.map((a) => this.knees(a));
    const shoulders = actors.flatMap((a) => [-1, 1].map((side) => a.headWorld.addScaledVector(across, side * GROUP_SHOULDER).setY(a.headWorld.y - 0.35)));
    const points = [...crowns, ...knees, ...shoulders];
    const middle = (axis: THREE.Vector3) => {
      const v = points.map((p) => p.dot(axis));
      return (Math.min(...v) + Math.max(...v)) / 2;
    };
    const target = across.clone().multiplyScalar(middle(across)).addScaledVector(dir, middle(dir));
    target.y = (Math.max(...crowns.map((p) => p.y)) + Math.min(...knees.map((p) => p.y))) / 2;
    const at = (dist: number) => target.clone().addScaledVector(dir, dist).setY(height);
    const fits = (pos: THREE.Vector3, aim: THREE.Vector3) => {
      const cam = this.probe(pos, aim, fov);
      return points.every((p) => {
        const v = p.clone().project(cam);
        return Math.abs(v.x) < 0.84 && v.y > -0.88 && v.y < GROUP_HEADROOM + 0.04 && v.z > -1 && v.z < 1;
      });
    };
    let lo = 1, hi = 14;
    if (!fits(at(hi), target)) return null;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (fits(at(mid), target)) hi = mid;
      else lo = mid;
    }
    // (a camera on the audience's side of the furniture, not in among the people)
    const nearest = Math.min(...actors.map((a) => a.headWorld.distanceTo(at(hi))));
    if (nearest < GROUP_NEAREST) hi += GROUP_NEAREST - nearest;
    const pos = at(hi);
    // A tall group (people standing) has room to spare above them: tilt down until the tallest head is just under
    // the headroom. A long one (a row of people sitting) stays in the middle of the picture, not up at the top of it
    // over a stretch of empty floor.
    const cam = this.probe(pos, target, fov);
    const top = Math.max(...crowns.map((p) => p.clone().project(cam).y)), bottom = Math.min(...knees.map((p) => p.clone().project(cam).y));
    const raise = Math.min(GROUP_HEADROOM - top, GROUP_FLOOR - bottom);
    // (as far as it goes with everyone still in: tilting swings the people out at the sides further out)
    const drop = raise * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * pos.distanceTo(target);
    const tilted = (t: number) => target.clone().setY(target.y - t * drop);
    let tilt = 0;
    if (drop > 0) {
      let out = 1;
      if (fits(pos, tilted(1))) tilt = 1;
      else for (let i = 0; i < 6; i++) {
        const t = (tilt + out) / 2;
        if (fits(pos, tilted(t))) tilt = t;
        else out = t;
      }
    }
    target.copy(tilted(tilt));
    return { pos, target, fov };
  }

  /** What's wrong with a group shot, if anything (an empty string: we can cut to it). The lens must stand on the floor
   *  of the set, not on the furniture; everyone must be in frame and in view, with nobody's head across anybody's
   *  face, nobody seen from behind anywhere but out at the side (and never in front of anyone else), and nobody else
   *  in front of them; no furniture across anyone's face or chest, no dressing in front of anyone, across the picture
   *  or right under the lens; and scenery behind them. */
  private groupFault(shot: Framing, actors: Actor[]) {
    if (!this.inside(shot.pos)) return 'outside';
    const cam = this.probe(shot.pos, shot.target, shot.fov);
    const half = Math.tan(THREE.MathUtils.degToRad(shot.fov / 2));
    // Heads in the picture, in its own units (up and across alike), with how far each reaches out from its middle.
    const heads = this.people().map((o) => {
      const distance = o.headWorld.distanceTo(shot.pos), v = o.headWorld.project(cam);
      const chin = o.headWorld.add(new THREE.Vector3(0, -0.24, 0)).project(cam);
      const back = turnedAway(shot.pos, o);
      return { o, distance, back, front: v.z > -1 && v.z < 1, x: v.x * cam.aspect, y: v.y, cx: chin.x * cam.aspect, cy: chin.y, r: 0.14 / (distance * half) };
    });
    const nearest = Math.min(...heads.filter((h) => actors.includes(h.o)).map((h) => h.distance));
    for (const h of heads) {
      if (!h.front) continue;
      const member = actors.includes(h.o);
      // somebody who isn't in the group, nearer the lens than any of them, with their head in the picture
      if (!member && h.distance < nearest && Math.abs(h.x) < cam.aspect + h.r && Math.abs(h.y) < 1 + h.r) return 'foreground';
      // someone seen from behind: only out at the side of the picture (and never in front of anyone: see bodyBlocked)
      if (member && h.back && Math.abs(h.x) < GROUP_SIDE * cam.aspect) return 'back';
      // a head in front of a face in the group (from the top of it down to the chin)
      for (const f of heads) {
        if (f === h || !actors.includes(f.o) || h.distance >= f.distance) continue;
        const gap = new THREE.Line3(new THREE.Vector3(f.x, f.y, 0), new THREE.Vector3(f.cx, f.cy, 0))
          .closestPointToPoint(new THREE.Vector3(h.x, h.y, 0), true, new THREE.Vector3()).distanceTo(new THREE.Vector3(h.x, h.y, 0));
        if (gap < h.r + 0.6 * f.r) return 'heads';
      }
    }
    this.ray.near = 0;
    this.ray.far = shot.pos.y;
    this.ray.set(shot.pos, DOWN);
    const floor = this.ray.intersectObjects(this.stage.occluders(), false)[0];
    if (floor && floor.point.y > (this.stage.current.floorAt?.(shot.pos.x, shot.pos.z) ?? 0) + 0.25) return 'furniture';
    if (!this.covers(shot, actors)) return 'hidden';
    if (actors.some((a) => this.bodyBlocked(cam, a, actors.filter((o) => o !== a)))) return 'body';
    const front = actors.reduce((a, b) => (a.headWorld.distanceTo(shot.pos) < b.headWorld.distanceTo(shot.pos) ? a : b));
    if (actors.some((a) => this.screened(shot.pos, a, true))) return 'screened';
    if (this.clutter(shot, front) > MAX_CLUTTER) return 'clutter';
    // (beer taps, a lamp, standing big and soft across the foreground)
    if (this.inView(cam, GROUP_DRESSING).some((o) => o.userData.dressing)) return 'dressing';
    return this.hasBackdrop(shot) ? '' : 'backdrop';
  }

  private framePoints(actors: Actor[]) {
    return actors.flatMap((a) => {
      const head = a.headWorld;
      return [head.clone().add(new THREE.Vector3(0, 0.1, 0)), head.clone().add(new THREE.Vector3(0, -0.35, 0))];
    });
  }

  private covers(shot: Framing, actors: Actor[]) {
    return this.allInFrame(shot.pos, shot.target, shot.fov, this.framePoints(actors)) && actors.every((a) => this.sees(shot.pos, a));
  }

  /** A copy of the lens set up for a shot, to test what it would see. */
  private probe(pos: THREE.Vector3, target: THREE.Vector3, fov: number) {
    // (one stand-in lens, reused: a shot search tries a great many framings)
    const cam = this.lens.copy(this.camera, false);
    cam.position.copy(pos);
    cam.fov = fov;
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return cam;
  }

  /** The scenery a lens can see, within `far` of it: all the rays it casts could hit. (Checking every ray against
   *  every mesh on the set is what makes a shot search slow.) */
  private inView(cam: THREE.PerspectiveCamera, far = Infinity) {
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    return this.stage.occluders().filter((o) => {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const sphere = this.sphere.copy(o.geometry.boundingSphere!).applyMatrix4(o.matrixWorld);
      return this.frustum.intersectsSphere(sphere) && sphere.center.distanceTo(cam.position) - sphere.radius < far;
    });
  }

  private allInFrame(pos: THREE.Vector3, target: THREE.Vector3, fov: number, pts: THREE.Vector3[]) {
    const cam = this.probe(pos, target, fov);
    return pts.every((p) => {
      const v = p.clone().project(cam);
      return Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85 && v.z > -1 && v.z < 1;
    });
  }

  /** Reverse angles must have scenery behind the subject, not the missing fourth wall. */
  private hasBackdrop(shot: Framing, thorough = false) {
    const cam = this.probe(shot.pos, shot.target, shot.fov);
    const objects = this.inView(cam);
    const open = this.stage.current.openSide;
    this.ray.near = 0.2; this.ray.far = 60;
    // Check the full picture, including corners and the strips between scenery
    // panels. A clear center must not approve a shot with an exposed set edge.
    // The open side can show through narrow gaps (a pass-through, a doorway), so look closer there.
    const steps = (n: number) => Array.from({ length: n + 1 }, (_, i) => -0.99 + 1.98 * i / n);
    for (const [xs, ys] of [
      [[-0.99, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 0.99], [-0.99, -0.5, 0, 0.5, 0.99]],
      [[-0.85, 0, 0.85], [-0.1, 0.25, 0.7]],
      ...open || thorough ? [[steps(20), steps(12)]] : [],
    ]) for (const x of xs) for (const y of ys) {
      this.ray.setFromCamera(new THREE.Vector2(x, y), cam);
      const hit = this.ray.intersectObjects(objects, false)[0];
      if (!hit) return false;
      // Nothing seen beyond the open side: that's where the cameras and the audience are.
      if (open && open.distanceToPoint(this.ray.ray.at(hit.distance, new THREE.Vector3())) > -0.05) return false;
    }
    return true;
  }

  /** In a car the camera rides along inside the cabin. */
  private inside(pos: THREE.Vector3) {
    return this.stage.current.cameraBounds?.containsPoint(pos) ?? true;
  }

  /** A framing we can cut to: the lens is on the set, everyone is in frame and in view, and there's scenery behind them. */
  private usable(shot: Framing, actors: Actor[]) {
    return this.inside(shot.pos) && this.covers(shot, actors) && this.hasBackdrop(shot);
  }

  /** How far out to the side of the picture (0 is its middle) the nearest head between the lens and the subject
   *  is; Infinity when there's nobody in the way, or only at the very edge of the frame. */
  private foreground(shot: Framing, subject: Actor) {
    const cam = this.probe(shot.pos, shot.target, shot.fov);
    const near = subject.headWorld.distanceTo(shot.pos) - 0.25;
    const half = Math.tan(THREE.MathUtils.degToRad(shot.fov / 2));
    let side = Infinity;
    for (const o of this.people()) {
      if (o === subject) continue;
      const head = o.headWorld, distance = head.distanceTo(shot.pos);
      if (distance > near) continue;
      // how far in from the edge of frame their head reaches, hair and all
      const reach = 0.15 / (distance * half);
      const v = head.project(cam), inner = Math.abs(v.x) - reach / cam.aspect;
      if (v.z > -1 && v.z < 1 && inner < 0.98 && Math.abs(v.y) - reach < 1) side = Math.min(side, Math.max(0, inner));
    }
    return side;
  }

  /** How much of the picture around the subject is blocked by scenery standing between them and the lens (the end
   *  of a wall, a pillar), or by set dressing in front of them or level with them (a potted palm beside them, a studio
   *  camera), from 0 to 1. A clear face isn't enough: a big soft shape across the frame ruins a single. The nearer the
   *  lens, the more it counts; the bottom of the picture, where a table or a desk in front of them belongs, doesn't. */
  clutter(shot: Framing, subject: Actor) {
    const cam = this.probe(shot.pos, shot.target, shot.fov);
    const depth = subject.headWorld.distanceTo(shot.pos), front = Math.max(0.1, depth - 0.45), beside = depth + 0.3;
    // (only what could be hit: scenery well in front of them, and dressing up to just behind them)
    const near = this.inView(cam, front);
    const dressing = this.inView(cam, beside).filter((o) => o.userData.dressing);
    if (!near.length && !dressing.length) return 0;
    if (dressing.length) subject.root.updateWorldMatrix(true, true);
    let sum = 0, n = 0;
    this.ray.near = 0.05;
    for (let i = 0; i <= 11; i++) for (let j = 0; j <= 6; j++) {
      const x = -0.96 + 1.92 * i / 11;
      // (a door frame or a curtain down the very edge of the picture frames the shot; it doesn't block it)
      const weight = Math.abs(x) > 0.7 ? 0.5 : 1;
      this.ray.setFromCamera(new THREE.Vector2(x, -0.4 + 1.35 * j / 6), cam);
      n += weight;
      this.ray.far = front;
      const hit = near.length ? this.ray.intersectObjects(near, false)[0] : undefined;
      if (hit) {
        sum += weight * Math.min(1, 2 * (1 - hit.distance / depth));
        continue;
      }
      if (!dressing.length) continue;
      this.ray.far = beside;
      const plant = this.ray.intersectObjects(dressing, false)[0];
      if (!plant) continue;
      // (a plant just behind them, hidden by them, is no matter)
      this.ray.far = plant.distance;
      if (!this.ray.intersectObjects(subject.bodyMeshes, false).length) sum += weight * 0.7;
    }
    return sum / n;
  }


  /** Scenery (a chair back, the arm of a sofa, a bar) or one of the `others` (someone in the foreground with their
   *  back to us, a shoulder) standing between the lens and someone's face, neck or chest. Whatever is lower than their
   *  chest (a table in front of them sitting down) doesn't count. */
  private bodyBlocked(cam: THREE.PerspectiveCamera, a: Actor, others: Actor[]) {
    const from = cam.position, head = a.headWorld;
    const across = head.clone().sub(from).setY(0).normalize();
    across.set(-across.z, 0, across.x);
    const objects: THREE.Object3D[] = [...this.inView(cam, head.distanceTo(from)), ...others.flatMap((o) => o.bodyMeshes)];
    for (const o of others) o.root.updateWorldMatrix(true, true);
    this.ray.near = 0;
    for (const [side, down] of [[0, 0], [0, 0.25], [0, 0.45], [0.15, 0.45], [-0.15, 0.45]]) {
      const to = head.clone().addScaledVector(across, side);
      to.y -= down;
      const dir = to.clone().sub(from);
      this.ray.far = dir.length() - 0.15;
      this.ray.set(from, dir.normalize());
      if (this.ray.intersectObjects(objects, false).some((hit) => hit.point.y > to.y - 0.05)) return true;
    }
    return false;
  }

  /** A lamp, a beer tap or a plant standing in front of someone's face, neck or chest from here (or their middle, for
   *  a `body` shot): small, but right across the middle of their single. (A table or a bar in front of them doesn't
   *  count.) */
  private screened(from: THREE.Vector3, a: Actor, body = false) {
    const dressing = this.stage.occluders().filter((o) => o.userData.dressing);
    if (!dressing.length) return false;
    const head = a.headWorld, across = head.clone().sub(from).setY(0).normalize();
    across.set(-across.z, 0, across.x);
    // (in a group shot, their middle too: a row of beer taps across their chests)
    for (const [side, down] of [[0, 0], [0, 0.25], [0, 0.45], [0.18, 0.35], [-0.18, 0.35], ...body ? [[0, 0.65], [0.15, 0.6], [-0.15, 0.6]] : []]) {
      const to = head.clone().addScaledVector(across, side);
      to.y -= down;
      const dir = to.clone().sub(from);
      this.ray.near = 0;
      this.ray.far = dir.length() - 0.15;
      this.ray.set(from, dir.normalize());
      if (this.ray.intersectObjects(dressing, false).length) return true;
    }
    return false;
  }

  /** Too much set dressing between the lens and the subject for a clean shot of them. Inside a car or a lift the
   *  cabin is always close around the lens, so there it's the cabin's own mounts and bounds that decide. */
  private cluttered(shot: Framing, subject: Actor) {
    return !this.stage.current.cameraBounds && (this.screened(shot.pos, subject) || this.clutter(shot, subject) > MAX_CLUTTER);
  }

  /** Nothing in the way of someone's face from here: their head, and down to their chin. */
  private sees(from: THREE.Vector3, a: Actor) {
    const head = a.headWorld;
    return this.clear(from, head, [a]) && this.clear(from, head.clone().add(new THREE.Vector3(0, -0.25, 0)), [a]);
  }

  private clear(from: THREE.Vector3, to: THREE.Vector3, ignore: Actor[]) {
    const dir = to.clone().sub(from), distance = dir.length();
    if (distance < 0.3) return false;
    const objects: THREE.Object3D[] = this.stage.occluders();
    const actors = [...Object.values(this.stage.actors),
      ...this.stage.extras.filter((e) => e.set === this.stage.current.id).map((e) => e.actor)];
    for (const a of actors) if (a.root.visible && !ignore.includes(a)) {
      a.root.updateWorldMatrix(true, true);
      objects.push(...a.bodyMeshes);
    }
    // Leave a small margin instead of accepting a ray that grazes a wall.
    for (const [dx, dy] of [[0, 0], [-0.025, 0], [0.025, 0], [0, -0.02], [0, 0.02]]) {
      const origin = from.clone().add(new THREE.Vector3(dx, dy, 0));
      dir.copy(to).sub(origin);
      this.ray.near = 0;
      this.ray.far = dir.length() - 0.12;
      dir.normalize();
      this.ray.set(origin, dir);
      if (this.ray.intersectObjects(objects, false).length) return false;
      // Back faces also matter: otherwise a camera outside a wall sees through it.
      this.ray.set(to, dir.clone().negate());
      if (this.ray.intersectObjects(objects, false).some((hit) => hit.distance >= 0.12 && !hit.object.userData.cameraBackdrop)) return false;
    }
    return true;
  }

  /** A deliberate dolly in on someone, from a medium shot to a tight single over `seconds` (the line it's on):
   *  reveals, realizations, a big confession. */
  pushIn(id: CharacterId, toward?: CharacterId, seconds = PUSH.seconds) {
    // (a cut held back for the shot on screen to have its moment starts the move late: it ends with the line anyway)
    const wait = this.shot && !this.hard ? Math.max(0, this.minShot - (this.time - this.lastCut)) : 0;
    this.closeup(id, toward, THREE.MathUtils.clamp(seconds - wait, PUSH.min, PUSH.max));
  }

  /** Still pushing in on someone: their next line carries on with the move instead of cutting away mid-way. */
  pushing(id: CharacterId) {
    const s = this.current;
    return !!s?.dolly && s.subject === id && s.dolly.t < s.dolly.seconds;
  }

  /** Where a push-in starting from `start` can end, as a distance from what it's aimed at: the tightest single along
   *  the same line that's as clean as any (inside the set, the face in frame with scenery behind it, nobody's head
   *  across it, no clutter in front), or null. */
  private pushEnd(start: Framing, a: Actor) {
    const back = start.pos.clone().sub(start.target), from = back.length();
    back.normalize();
    for (const to of PUSH.to) {
      if (to > from * PUSH.tighten) break;
      const end = { pos: start.target.clone().addScaledVector(back, to), target: start.target.clone(), fov: start.fov };
      if (this.foreground(end, a) > DIRTY_EDGE && this.usable(end, [a]) && !this.cluttered(end, a)) return to;
    }
    return null;
  }

  /** HIMYM car coverage uses fixed windshield/cabin mounts and maintains the seating axis. */
  private vehicleShot(actors: Actor[], kind: 'closeup' | 'two') {
    const mounts = this.stage.current.dialogueCameras;
    if (!mounts) return false;
    const target = actors.reduce((sum, a) => sum.add(a.headWorld), new THREE.Vector3()).divideScalar(actors.length);
    target.y -= 0.16;
    const forward = new THREE.Vector3(Math.sin(actors[0].facing), 0, Math.cos(actors[0].facing));
    const candidates = mounts.map((pos) => {
      const angle = pos.clone().sub(target).setY(0).normalize().dot(forward);
      // A rear passenger's single belongs in the rear compartment, not far away on the hood.
      const score = (1 - angle) * 2 + (kind === 'closeup' ? Math.abs(pos.distanceTo(target) - 1.3) : 0);
      return { pos, angle, score };
    }).filter((c) => c.angle > 0.35).sort((a, b) => a.score - b.score);
    for (const { pos } of candidates) for (const fov of [24, 28, 32, 38, 44, 50, 58, 66]) {
      if (!this.usable({ pos, target, fov }, actors)) continue;
      this.cut({ kind, pos: pos.clone(), target, fov, push: 0,
        subject: actors[0].def.id, subjects: actors.map((a) => a.def.id) });
      return true;
    }
    return false;
  }

  /** A single on someone; `push` (seconds) makes it a push-in that long. */
  closeup(id: CharacterId, toward?: CharacterId, push = 0): void {
    const pushIn = push > 0;
    const a = this.stage.actors[id];
    if (!a?.root.visible) return this.wide(0);
    if (this.stage.current.dialogueCameras) {
      // The camera stays bolted to the vehicle, including on an emphatic line.
      if (this.vehicleShot([a], 'closeup')) return;
      return this.coverage([id], false);
    }
    const head = a.headWorld;
    // (a push-in ends up tight on their face: framed on the way they're turning to face, not the way they face yet)
    const facing = pushIn && !a.isWalking ? a.targetFacing : a.facing;
    const look = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    if (toward && this.stage.onStage(toward)) {
      const t = this.stage.actors[toward].headWorld.sub(head).setY(0);
      if (t.lengthSq() > 0.01) look.copy(t.normalize());
    }
    const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    // Their face is turned to whoever they're talking to: never shoot it from the other side, past the back of
    // their head (someone on a bar stool talking to the person on the next stool).
    const face = forward.clone().add(look).normalize(), turned = look.dot(forward) < 0.95;
    const audience = new THREE.Vector3(0, 0, 1);
    // Keep reverse coverage for students and chairs facing into the room.
    const candidates = [forward.clone().lerp(look, 0.35).normalize(),
      ...[0.65, -0.65, 1.1, -1.1, 1.4, -1.4].map((angle) => forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)),
      ...[0.3, 0.65, 1].map((blend) => look.clone().lerp(audience, blend).normalize())];
    // A push-in starts from a medium shot further back (see PUSH).
    const dists = pushIn ? PUSH.from : this.stage.current.cameraBounds ? [2.35, 1.65, 1.15, 0.85, 0.6] : [2.35, 1.65, 1.15];
    // On an open set, someone facing upstage has no reverse: their single is a profile from the side. So is someone
    // up against a window or a wall, with no room for a clean angle in front of them.
    const around = (angles: number[]) => angles.map((angle) => forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle));
    // (a touch behind the shoulder only where there's no reverse at all)
    const profiles = around(this.stage.current.openSide ? [1.57, -1.57, 1.8, -1.8] : [1.57, -1.57]);
    // Last of all, the angles in between, from in between (someone up against a window, a plant in the way).
    const sweep = around([0.3, -0.3, 0.9, -0.9, 1.4, -1.4, 1.6, -1.6]);
    const nearer = pushIn || this.stage.current.cameraBounds ? dists : [2, 1.4];
    const single = (shot: Framing, end: number | null) => this.cut({ kind: 'closeup', ...shot, follow: a, followOffset: new THREE.Vector3(0, -0.16, 0),
      push: 0, dolly: end === null ? undefined : { from: shot.pos.distanceTo(shot.target), to: end, seconds: push, t: 0 }, subject: id, subjects: [id] });
    // Somebody else's head in the picture, between the lens and the subject: keep looking for a clean angle, and
    // if there isn't one, settle for the angle that keeps their head furthest out to the side, as long as it's out at
    // the edge of frame. Never a head across the middle of the picture: then it's a wide.
    let dirty: Framing | null = null, dirtyEnd: number | null = null, margin = DIRTY_EDGE;
    for (const [ds, minDot, range] of [[candidates, 0.05, dists], [profiles, -0.25, dists], [sweep, -0.25, nearer]] as const) for (const dist of range) for (const d of ds) {
      if (d.lengthSq() < 0.1 || d.dot(forward) < minDot || (turned && d.dot(face) < 0.3)) continue;
      const pos = head.clone().addScaledVector(d, dist);
      pos.y = head.y + 0.08;
      const target = head.clone().add(new THREE.Vector3(0, -0.16, 0));
      const fov = pushIn ? PUSH.fov : dist < 0.7 ? 60 : dist < 1 ? 50 : dist < 1.5 ? 44 : 32;
      const shot = { pos, target, fov }, side = this.foreground(shot, a);
      // (the odd angles the sweep finds often look along a wall or out of a window: check the whole picture)
      if (side <= margin || !this.usable(shot, [a]) || this.cluttered(shot, a) || (ds === sweep && !this.hasBackdrop(shot, true))) continue;
      // (a push-in has to have somewhere clean to end up, too)
      const end = pushIn ? this.pushEnd(shot, a) : null;
      if (pushIn && end === null) continue;
      if (side === Infinity) return single(shot, end);
      dirty = shot; dirtyEnd = end; margin = side;
    }
    if (dirty) return single(dirty, dirtyEnd);
    if (pushIn) return this.closeup(id, toward);
    // No clean single: the two of them together, from where their faces are, else the tightest wide that has them.
    if (toward && this.stage.onStage(toward) && !this.fallback) {
      this.fallback = true;
      try {
        return this.twoShot(id, toward);
      } finally {
        this.fallback = false;
      }
    }
    this.coverage([id], false);
  }

  twoShot(a: CharacterId, b: CharacterId) {
    const A = this.stage.actors[a], B = this.stage.actors[b];
    if (!A?.root.visible || !B?.root.visible) return this.closeup(a);
    if (this.stage.current.dialogueCameras) {
      if (this.vehicleShot([A, B], 'two')) return;
      return this.closeup(a, b);
    }
    const ha = A.headWorld, hb = B.headWorld;
    const mid = ha.clone().add(hb).multiplyScalar(0.5);
    const sep = ha.distanceTo(hb);
    const along = hb.clone().sub(ha).setY(0).normalize();
    // from the side they're facing: the audience usually, the chalkboard for two students, the bar for two people
    // side by side on its stools (not their backs from the room)
    const facing = new THREE.Vector3(Math.sin(A.facing) + Math.sin(B.facing), 0, Math.cos(A.facing) + Math.cos(B.facing));
    const fronts = facing.lengthSq() > 0.25 && facing.z < 0 ? [facing.clone().normalize()] : [new THREE.Vector3(0, 0, 1)];
    if (facing.lengthSq() > 0.25 && Math.abs(facing.x) > Math.abs(facing.z) && facing.z >= 0) fronts.unshift(facing.clone().normalize());
    // (back far enough for both of them and a shoulder's width to spare across the picture: on a full screen the first
    // two always are, but a split-screen panel is a narrow strip, which can take a wider lens closer in)
    const reach = (fov: number) => Math.max(2.3, sep * 1.25 + 1.3, (sep / 2 + 0.35) / (0.85 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * this.camera.aspect));
    const dist = reach(42), narrow = this.camera.aspect < 1.2;
    if (Math.min(dist, narrow ? reach(60) : Infinity) > (this.stage.current.maxTwoShotDistance ?? Infinity)) return this.closeup(a, b);
    const target = mid.clone().add(new THREE.Vector3(0, -0.2, 0));
    // In a car, come in closer on a wider lens rather than leave the cabin.
    const tries: [number, number][] = this.stage.current.cameraBounds ? [[dist, 42], [1.6, 52], [1.2, 60]] : narrow ? [[reach(60), 60], [dist, 42]] : [[dist, 42]];
    for (const front of fronts) {
      const perp = new THREE.Vector3(-along.z, 0, along.x);
      if (perp.dot(front) < 0) perp.negate();
      perp.lerp(front, 0.45).normalize();
      // (across the bar, step along it to get round the bartender)
      const across = front === fronts[0] && fronts.length > 1;
      const steps = across ? [0, 0.5, -0.5, 1, -1, 1.5, -1.5] : [0];
      for (const [d, fov] of across && !this.stage.current.cameraBounds ? [...tries, [1.8, 50] as [number, number]] : tries) for (const step of steps) {
        const pos = mid.clone().addScaledVector(perp, d).addScaledVector(along, step);
        pos.y = mid.y + 0.1;
        // (not their backs, nobody else's head in front of them, and no lamp in front of either face)
        const near = A.headWorld.distanceTo(pos) < B.headWorld.distanceTo(pos) ? [A, B] : [B, A];
        const backs = [A, B].some((o) => pos.clone().sub(o.headWorld).setY(0).normalize().dot(new THREE.Vector3(Math.sin(o.facing), 0, Math.cos(o.facing))) < -0.35);
        if (!backs && this.usable({ pos, target, fov }, [A, B]) && !this.crowded({ pos, target, fov }, near[1], near[0])
          && !this.screened(pos, A) && !this.screened(pos, B))
          return this.cut({ kind: 'two', pos, target, fov, push: 0, subject: a, subjects: [a, b] });
      }
    }
    this.closeup(a, b);
  }

  /** Over the listener's shoulder onto the speaker. As in a sitcom, the back of the listener's head and their
   *  shoulder take only the outer fifth or so of the picture, soft against the edge of frame, and the speaker reads
   *  clearly across the rest: the lens stands well back behind the listener, out to the side, on a longer lens. */
  overShoulder(speaker: CharacterId, listener: CharacterId) {
    const S = this.stage.actors[speaker], L = this.stage.actors[listener];
    if (!S?.root.visible || !L?.root.visible) return this.closeup(speaker);
    // Adjacent seats / separate rows use matching singles, as in the series. An orbit behind
    // a listener would put the camera through a door, headrest or the driver's partition.
    if (this.stage.current.dialogueCameras) return this.closeup(speaker, listener);
    const hs = S.headWorld, hl = L.headWorld;
    const back = hl.clone().sub(hs).setY(0);
    const gap = back.length();
    if (gap > 3.5 || gap < 0.5) return this.closeup(speaker, listener);
    back.normalize();
    const across = new THREE.Vector3(-back.z, 0, back.x);
    // (from the audience's side of them first)
    if (across.z < 0) across.negate();
    const target = hs.clone().add(new THREE.Vector3(0, -0.08, 0));
    // The speaker's face is turned between where their body faces and the listener: the lens must see it from the
    // front, not end up out at the side on a profile.
    const face = new THREE.Vector3(Math.sin(S.facing), 0, Math.cos(S.facing)).add(back).normalize();
    // ... and the listener is turned away from the lens: it's the back of their head and shoulder we're looking past,
    // not their face (two people side by side on a couch get singles).
    const away = new THREE.Vector3(Math.sin(L.facing), 0, Math.cos(L.facing));
    const at = (behind: number, out: number) => {
      const pos = hl.clone().addScaledVector(back, behind).addScaledVector(across, out);
      pos.y = hl.y + 0.1;
      return pos;
    };
    for (const sign of [1, -1]) for (const [behind, fov] of OTS_LENSES) for (const edge of [0.8, 0.68]) {
      // Out to the side just far enough that the listener's head lands `edge` of the way from the middle of the
      // picture to its side.
      let lo = 0, hi = 3;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2, cam = this.probe(at(behind, sign * mid), target, fov);
        if (Math.abs(hl.clone().project(cam).x) < edge) lo = mid;
        else hi = mid;
      }
      const pos = at(behind, sign * (lo + hi) / 2);
      const shot = { pos, target, fov };
      if (pos.clone().sub(hs).setY(0).normalize().dot(face) < OTS_FACE || pos.clone().sub(hl).setY(0).normalize().dot(away) > 0.2) continue;
      if (!this.shoulder(shot, L) || !this.inside(pos) || !this.allInFrame(pos, target, fov, this.framePoints([S])) || !this.sees(pos, S)
        || this.crowded(shot, S, L) || this.cluttered(shot, S) || !this.hasBackdrop(shot)) continue;
      return this.cut({ kind: 'ots', pos, target, fov, follow: S, followOffset: new THREE.Vector3(0, -0.08, 0), push: 0, subject: speaker, subjects: [speaker] });
    }
    this.closeup(speaker, listener);
  }

  /** The listener's head sits against the edge of frame, low, for an over-the-shoulder: not a blob across the middle. */
  private shoulder(shot: Framing, listener: Actor) {
    const v = listener.headWorld.project(this.probe(shot.pos, shot.target, shot.fov));
    return v.z > -1 && v.z < 1 && Math.abs(v.x) > 0.6 && Math.abs(v.x) < 0.95 && v.y > -0.75 && v.y < 0.25;
  }

  /** Everyone on the set the lens could catch: the cast, and the background people too (a bartender behind the bar
   *  counts as much as anyone). */
  private people() {
    const extras = this.stage.extras.filter((e) => e.set === this.stage.current.id && e.actor.root.visible).map((e) => e.actor);
    return [...this.stage.onStageIds().map((id) => this.stage.actors[id]), ...extras];
  }

  /** Somebody besides the listener between the lens and the speaker, any of their head in the picture. */
  private crowded(shot: Framing, speaker: Actor, listener: Actor) {
    const cam = this.probe(shot.pos, shot.target, shot.fov);
    const near = speaker.headWorld.distanceTo(shot.pos) - 0.25;
    const half = Math.tan(THREE.MathUtils.degToRad(shot.fov / 2));
    return this.people().some((o) => {
      const distance = o.headWorld.distanceTo(shot.pos);
      if (o === speaker || o === listener || distance > near) return false;
      // (how far a head, hair and all, reaches out from its middle, in the picture)
      const reach = 0.15 / (distance * half);
      const v = o.headWorld.project(cam);
      return v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.98 + reach / cam.aspect && Math.abs(v.y) < 1 + reach;
    });
  }

  /** The shot the writer asked for, on `subject` (and `other`, for a two-shot). */
  intent(shot: ShotIntent, subject: CharacterId, other?: CharacterId, seconds?: number) {
    switch (shot) {
      case 'closeup': return this.closeup(subject, other);
      case 'push_in': return this.pushIn(subject, other, seconds);
      case 'wide': return this.coverage(this.stage.castIds(), false, true);
      case 'two': {
        const partner = other && other !== subject && this.stage.onStage(other) ? other : this.nearest(subject);
        return partner ? this.twoShot(subject, partner) : this.closeup(subject);
      }
    }
  }

  /** On a group: a single, a two-shot, or the widest angle that holds them all. For reactions and lines said together. */
  group(ids: CharacterId[], toward?: CharacterId) {
    const on = ids.filter((id) => this.stage.onStage(id));
    // a single reaction is shot from the side of whoever they're reacting to, so the face reads
    if (on.length === 1) this.closeup(on[0], toward);
    else if (on.length === 2) this.twoShot(on[0], on[1]);
    else if (on.length) this.coverage(on, false);
  }

  /** Someone seen from behind in the middle of a shot, not out at the side where a group shot allows a back. */
  private backInMiddle(shot: Framing, a: Actor) {
    return turnedAway(shot.pos, a) && Math.abs(a.headWorld.project(this.probe(shot.pos, shot.target, shot.fov)).x) < GROUP_SIDE;
  }

  /** On their way out the door. */
  private leaving(a: Actor) {
    return this.stage.onStageIds().some((id) => this.stage.actors[id] === a && this.stage.leaving(id));
  }

  /** A shot framed on someone who isn't on stage any more: a single on an empty doorway. */
  private stale(s: ActiveShot) {
    if (s.kind === 'wide' || s.kind === 'establishing' || s.kind === 'selfie') return false;
    return (s.follow && !s.follow.root.visible) || (s.subjects ?? (s.subject ? [s.subject] : [])).some((id) => !this.stage.onStage(id));
  }

  /** Keep track of exits. Once someone is through the door, the camera is on whoever is still in the room; and no
   *  shot, on screen or about to be, stays framed on someone who has left. */
  private watchExits() {
    const gone = this.stage.takeExits().length > 0;
    if (this.pending && this.stale(this.pending)) this.pending = null;
    // (a wide of the room was of them too, until they went)
    if (gone) for (const s of [this.shot, this.pending]) if (s?.subjects) s.subjects = s.subjects.filter((id) => this.stage.onStage(id));
    if (gone || (this.shot && this.stale(this.shot))) this.room();
  }

  /** Back on the people still in the room after someone walked out: a lone one gets their single, held as a
   *  reaction; a group stays on an angle that holds them all. */
  private room() {
    const ids = this.stage.castIds().filter((id) => !this.stage.leaving(id));
    const actors = ids.map((id) => this.stage.actors[id]);
    const fits = (s: ActiveShot | null) => !!s && !this.stale(s) && (ids.length === 1
      ? s.kind === 'closeup' && s.subject === ids[0]
      : s.kind === 'wide' ? this.covers(s, actors) : !!ids.length && (s.subjects ?? []).every((id) => ids.includes(id)));
    // What's up is framed on nobody: replace it straight away, without waiting out its minimum.
    const now = !this.shot || this.stale(this.shot);
    if (fits(this.current)) {
      if (now && this.pending) this.commit(this.pending);
      return;
    }
    if (now) this.hard = true;
    if (ids.length === 1) this.closeup(ids[0]);
    else if (ids.length) this.coverage(ids, false);
    else this.wide(0);
  }

  private nearest(id: CharacterId) {
    const p = this.stage.actors[id].position;
    return this.stage.castIds().filter((o) => o !== id)
      .sort((a, b) => this.stage.actors[a].position.distanceTo(p) - this.stage.actors[b].position.distanceTo(p))[0];
  }

  /** Pick coverage for a line of dialogue. */
  onLine(speaker: CharacterId, to?: CharacterId) {
    const s = this.current;
    const since = this.time - this.lastCut;
    if (this.pushing(speaker)) return;
    if (s && s.subject === speaker && s.kind !== 'wide' && this.rng() < 0.65) return;
    if (s && s.subject === speaker && since < 2.5) return;
    const r = this.rng();
    const listener = to && to !== speaker && this.stage.onStage(to) ? to : undefined;
    const crowd = this.stage.castIds().length;
    if (listener) {
      if (r < 0.38) this.closeup(speaker, listener);
      else if (r < 0.6) this.overShoulder(speaker, listener);
      else if (r < 0.82) this.twoShot(speaker, listener);
      else this.coverage(this.stage.castIds());
    } else {
      if (r < (crowd > 3 ? 0.5 : 0.65)) this.closeup(speaker);
      else this.coverage(this.stage.castIds());
    }
  }

  /** The couch is nearly always the locked-off two-shot; now and then a single on whoever's talking. */
  onCouchLine(speaker: CharacterId) {
    const s = this.current;
    if (s?.kind === 'closeup' && s.subject === speaker) return;
    if (this.rng() < 0.3) this.closeup(speaker);
    else if (s?.kind !== 'wide') this.wide(0);
  }

  /** Right up in the gang's faces, like someone holding the camera at arm's length: for the main titles. */
  selfie(heads: THREE.Vector3[], o: { dist: number; yaw: number; lift: number; fov: number; aim?: number }) {
    const target = heads.reduce((sum, h) => sum.add(h), new THREE.Vector3()).divideScalar(Math.max(1, heads.length));
    target.y += o.aim ?? -0.06;
    const pos = target.clone().add(new THREE.Vector3(Math.sin(o.yaw) * o.dist, o.lift, Math.cos(o.yaw) * o.dist));
    this.cut({ kind: 'selfie', pos, target, fov: o.fov, push: 0 }, true);
  }

  /** The next photo in a burst: the same shot, taken from a hand's width away and a hair tighter or looser. */
  jog(amount = 0.06) {
    const s = this.shot;
    if (!s?.base) return;
    const r = () => (Math.random() * 2 - 1) * amount;
    s.pos.copy(s.base.pos).add(new THREE.Vector3(r(), r() * 0.5, r() * 0.5));
    s.target.copy(s.base.target).add(new THREE.Vector3(r() * 0.5, r() * 0.3, 0));
    s.fov = s.base.fov * (1 + r() * 0.6);
    this.apply(0);
  }

  /** The shot chosen: the one on screen, or the one about to replace it. */
  get current() {
    return this.pending ?? this.shot;
  }

  /** Go back to a shot held earlier, e.g. after cutting away to the kids. */
  resume(shot: ActiveShot | null) {
    // A wardrobe change in between swaps the actor a single was following.
    if (shot?.follow && shot.subject && shot.follow !== this.stage.actors[shot.subject]) shot.follow = this.stage.actors[shot.subject];
    if (shot) this.cut(shot, true);
    else {
      this.fresh();
      this.wide(0);
    }
  }

  update(dt: number) {
    if (this.held) return;
    this.time += dt;
    this.watchExits();
    if (this.pending && this.time - this.lastCut >= this.minShot) this.commit(this.pending);
    const s = this.shot;
    if (s && !this.pending && s.kind !== 'establishing' && !s.follow && this.time - Math.max(this.lastCut, this.lastReframe) > 0.5) {
      const ids = s.subjects?.filter((id) => this.stage.onStage(id)) ?? [];
      const moving = ids.map((id) => this.stage.actors[id]).filter((a) => a.isWalking);
      if (moving.length && !this.covers(s, moving)) {
        this.lastReframe = this.time;
        this.coverage(ids);
      } else if (s.group && dt > 0 && ids.some((id) => this.backInMiddle(s, this.stage.actors[id]))) {
        // Someone in a group shot has turned their back on it, in the middle of the picture (to talk to someone
        // behind them): look again, and settle for the authored wide if there's no clean group shot now.
        this.lastReframe = this.time;
        this.coverage(ids, false);
      }
    }
    this.apply(dt);
  }

  private apply(dt: number) {
    const s = this.shot;
    if (!s) return;
    // Exterior backdrops sit beyond the indoor camera's clipping plane.
    const far = s.kind === 'establishing' ? 600 : 60;
    if (this.camera.far !== far) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    // Settle the camera after a short move if a voice-over runs long.
    if (s.drift && this.time - this.lastCut < 4) {
      s.pos.addScaledVector(s.drift.move, dt);
      s.target.addScaledVector(s.drift.look, dt);
    }
    if (s.follow && s.followOffset) {
      // Track the body, not the head: breathing, talk nods and dance hops would shake the camera.
      const root = s.follow.root.getWorldPosition(new THREE.Vector3());
      const head = s.follow.headWorld;
      if (s.followRoot) {
        const displacement = root.clone().sub(s.followRoot);
        if (displacement.lengthSq() > 0.000001) {
          const moved = s.pos.clone().add(displacement);
          // (carried past a plant or a lamp, the lens stays put and pans instead; checked a few times a second)
          const tidy = () => {
            if (this.time - (s.tidyAt ?? -1) < 0.1) return s.tidy ?? true;
            s.tidyAt = this.time;
            return (s.tidy = !this.cluttered({ pos: moved, target: s.target.clone().add(displacement), fov: s.fov }, s.follow!));
          };
          if (this.inside(moved) && this.sees(moved, s.follow) && (s.kind !== 'closeup' || tidy())) {
            s.pos.copy(moved);
          }
          // Can't track alongside: pan from where we stand while they're still in view, rather than
          // cut to a fresh single on the same person.
          else if (!this.sees(s.pos, s.follow)) {
            // (someone going out the door is let go: we're back on the room)
            if (this.pending) return;
            if (s.subject && this.stage.leaving(s.subject)) this.room();
            else this.closeup(s.subject!);
            return;
          }
          s.target.add(displacement);
          s.carried = true;
        } else if (dt > 0 && s.kind === 'closeup' && s.subject && !this.pending && !s.follow.isWalking && this.time - (s.turnedAt ?? -1) > 0.5
          && s.pos.clone().sub(s.follow.headWorld).setY(0).normalize().dot(new THREE.Vector3(Math.sin(s.follow.facing), 0, Math.cos(s.follow.facing))) < -0.2) {
          // They've turned their back on the lens (to talk to someone behind them): find them a single from the front.
          s.turnedAt = this.time;
          this.closeup(s.subject);
          if (this.shot !== s) return;
        } else if (s.carried && !s.follow.isWalking && !this.pending) {
          // They've arrived, and the lens with them: if it fetched up behind a plant or against a wall, find
          // them a proper single.
          s.carried = false;
          if (s.kind === 'closeup' && s.subject && (this.cluttered(s, s.follow) || !this.hasBackdrop(s))) {
            this.closeup(s.subject);
            return;
          }
        }
      }
      s.followRoot = root;
      // Reframe for sitting down or standing up, but hold still through breathing, nods and gestures.
      const aim = head.add(s.followOffset), off = aim.distanceTo(s.target);
      if (!dt) s.target.copy(aim);
      else {
        if (off > 0.12) s.reframing = true;
        if (s.reframing) s.target.lerp(aim, damp(1.2, dt));
        if (off < 0.01) s.reframing = false;
      }
    }
    if (dt > 0 && s.dolly && s.dolly.t < s.dolly.seconds) {
      // A push-in: along its line, eased in and out, keeping inside the set and the subject in frame (or it stops).
      const d = s.dolly;
      d.t = Math.min(d.seconds, d.t + dt);
      const k = d.t / d.seconds, back = s.pos.clone().sub(s.target).normalize();
      const next = s.target.clone().addScaledVector(back, d.from + (d.to - d.from) * k * k * (3 - 2 * k));
      const actors = (s.subjects ?? []).filter((id) => this.stage.onStage(id)).map((id) => this.stage.actors[id]);
      if (this.inside(next) && this.covers({ ...s, pos: next }, actors)) s.pos.copy(next);
      else d.t = d.seconds;
    }
    if (dt > 0 && s.push && this.time - this.lastCut < 4) {
      const dir = s.target.clone().sub(s.pos);
      const next = s.pos.clone().addScaledVector(dir.normalize(), s.push * dt);
      const actors = (s.subjects ?? []).filter((id) => this.stage.onStage(id)).map((id) => this.stage.actors[id]);
      if (next.distanceTo(s.target) > 1 && this.covers({ ...s, pos: next }, actors)) s.pos.copy(next);
    }
    this.camera.position.copy(s.pos);
    if (this.camera.fov !== s.fov) {
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(s.target);
  }
}
