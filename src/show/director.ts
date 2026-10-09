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
  push: number; // dolly speed toward target, m/s; 0 for a locked-off shot
  /** How long the dolly keeps going after the cut (4 s unless it's a deliberate push-in). */
  pushFor?: number;
  subject?: CharacterId;
  drift?: EstablishingShot;
  subjects?: CharacterId[];
  /** Where the followed actor's body stood last frame; the camera tracks it, not the bobbing head. */
  followRoot?: THREE.Vector3;
  /** The aim is easing onto a new framing after a big head move, like sitting down. */
  reframing?: boolean;
  /** Where the shot was framed when we cut to it, before any jog, push or drift. */
  base?: Framing;
}

/** Two framings a viewer can't tell apart: cutting from one to the other only reads as a jump. */
function sameFraming(a: Framing, b: Framing) {
  const look = (f: Framing) => f.target.clone().sub(f.pos).normalize();
  return a.pos.distanceTo(b.pos) < 0.25 && look(a).angleTo(look(b)) < 0.07 && Math.abs(a.fov - b.fov) < 4;
}

/** The shortest a shot stays up on the show, in seconds: anything briefer reads as a glitch, not an edit. */
export const MIN_SHOT = 1.2;

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

  establish(s: EstablishingShot, moving = true) {
    this.cut({ kind: 'establishing', pos: s.pos.clone(), target: s.target.clone(), fov: s.fov, push: 0, drift: moving ? s : undefined }, true);
  }

  /** Prefer a tight authored angle only when every subject is framed and unobstructed. */
  coverage(ids: CharacterId[], allowCloseup = true) {
    const actors = ids.filter((id) => this.stage.onStage(id)).map((id) => this.stage.actors[id]);
    if (!actors.length) return this.wide(0);
    const wides = this.stage.current.wides;
    const moving = actors.filter((a) => a.isWalking);
    let best = 0, score = -1;
    for (let i = wides.length - 1; i >= 0; i--) {
      const shot = wides[i];
      const visible = actors.filter((a) => this.covers(shot, [a]));
      if (visible.length === actors.length) { best = i; break; }
      const value = visible.length + visible.filter((a) => a.isWalking).length * (actors.length + 1);
      if (value >= score) { score = value; best = i; }
    }
    const priority = moving.length ? moving : actors.slice(0, 1);
    if (allowCloseup && !priority.every((a) => this.covers(wides[best], [a]))) return this.closeup(priority[0].def.id);
    this.wide(best);
    this.shot!.subjects = actors.map((a) => a.def.id);
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
    const cam = this.camera.clone();
    cam.position.copy(pos);
    cam.fov = fov;
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return cam;
  }

  private allInFrame(pos: THREE.Vector3, target: THREE.Vector3, fov: number, pts: THREE.Vector3[]) {
    const cam = this.probe(pos, target, fov);
    return pts.every((p) => {
      const v = p.clone().project(cam);
      return Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85 && v.z > -1 && v.z < 1;
    });
  }

  /** Reverse angles must have scenery behind the subject, not the missing fourth wall. */
  private hasBackdrop(shot: Framing) {
    const cam = this.probe(shot.pos, shot.target, shot.fov);
    const objects = this.stage.occluders();
    const open = this.stage.current.openSide;
    this.ray.near = 0.2; this.ray.far = 60;
    // Check the full picture, including corners and the strips between scenery
    // panels. A clear center must not approve a shot with an exposed set edge.
    // The open side can show through narrow gaps (a pass-through, a doorway), so look closer there.
    const steps = (n: number) => Array.from({ length: n + 1 }, (_, i) => -0.99 + 1.98 * i / n);
    for (const [xs, ys] of [
      [[-0.99, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 0.99], [-0.99, -0.5, 0, 0.5, 0.99]],
      [[-0.85, 0, 0.85], [-0.1, 0.25, 0.7]],
      ...open ? [[steps(20), steps(12)]] : [],
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
    let side = Infinity;
    for (const id of this.stage.onStageIds()) {
      const o = this.stage.actors[id];
      if (o === subject || !o.root.visible) continue;
      const head = o.headWorld;
      if (head.distanceTo(shot.pos) > near) continue;
      const v = head.project(cam);
      if (v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 1) side = Math.min(side, Math.abs(v.x));
    }
    return side;
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

  /** A slow, deliberate dolly in on someone: reveals, realizations, a big confession. */
  pushIn(id: CharacterId, toward?: CharacterId) {
    this.closeup(id, toward, true);
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

  closeup(id: CharacterId, toward?: CharacterId, pushIn = false): void {
    const a = this.stage.actors[id];
    if (!a?.root.visible) return this.wide(0);
    if (this.stage.current.dialogueCameras) {
      // The camera stays bolted to the vehicle, including on an emphatic line.
      if (this.vehicleShot([a], 'closeup')) return;
      return this.coverage([id], false);
    }
    const head = a.headWorld;
    const look = new THREE.Vector3(Math.sin(a.facing), 0, Math.cos(a.facing));
    if (toward && this.stage.onStage(toward)) {
      const t = this.stage.actors[toward].headWorld.sub(head).setY(0);
      if (t.lengthSq() > 0.01) look.copy(t.normalize());
    }
    const forward = new THREE.Vector3(Math.sin(a.facing), 0, Math.cos(a.facing));
    const audience = new THREE.Vector3(0, 0, 1);
    // Keep reverse coverage for students and chairs facing into the room.
    const candidates = [forward.clone().lerp(look, 0.35).normalize(),
      ...[0.65, -0.65, 1.1, -1.1, 1.4, -1.4].map((angle) => forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)),
      ...[0.3, 0.65, 1].map((blend) => look.clone().lerp(audience, blend).normalize())];
    // A push-in starts from a medium shot further back and creeps in over several seconds; inside a car
    // there's less room to back off.
    const dists = pushIn ? [3.3, 2.8, 2.35] : this.stage.current.cameraBounds ? [2.35, 1.65, 1.15, 0.85, 0.6] : [2.35, 1.65, 1.15];
    // On an open set, someone facing upstage has no reverse: their single is a profile from the side.
    const profiles = this.stage.current.openSide
      ? [1.57, -1.57, 1.8, -1.8].map((angle) => forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)) : [];
    const single = (shot: Framing) => this.cut({ kind: 'closeup', ...shot, follow: a, followOffset: new THREE.Vector3(0, -0.16, 0),
      push: pushIn ? 0.32 : 0, pushFor: pushIn ? 6 : undefined, subject: id, subjects: [id] });
    // Somebody else's head in the picture, between the lens and the subject: keep looking for a clean angle, and
    // if there isn't one, settle for the angle that keeps their head furthest out to the side.
    let dirty: Framing | null = null, margin = -1;
    for (const [ds, minDot] of [[candidates, 0.05], [profiles, -0.25]] as const) for (const dist of dists) for (const d of ds) {
      if (d.lengthSq() < 0.1 || d.dot(forward) < minDot) continue;
      const pos = head.clone().addScaledVector(d, dist);
      pos.y = head.y + 0.08;
      const target = head.clone().add(new THREE.Vector3(0, -0.16, 0));
      const fov = pushIn ? 34 : dist < 0.7 ? 60 : dist < 1 ? 50 : dist < 1.5 ? 44 : 32;
      const shot = { pos, target, fov }, side = this.foreground(shot, a);
      if (side <= margin || !this.usable(shot, [a])) continue;
      if (side === Infinity) return single(shot);
      dirty = shot; margin = side;
    }
    if (dirty) return single(dirty);
    if (pushIn) return this.closeup(id, toward);
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
    const perp = new THREE.Vector3(-along.z, 0, along.x);
    // from the side they're facing: the audience usually, the chalkboard for two students
    const facing = new THREE.Vector3(Math.sin(A.facing) + Math.sin(B.facing), 0, Math.cos(A.facing) + Math.cos(B.facing));
    const front = facing.lengthSq() > 0.25 && facing.z < 0 ? facing.normalize() : new THREE.Vector3(0, 0, 1);
    if (perp.dot(front) < 0) perp.negate();
    perp.lerp(front, 0.45).normalize();
    const dist = Math.max(2.3, sep * 1.25 + 1.3);
    if (dist > (this.stage.current.maxTwoShotDistance ?? Infinity)) return this.closeup(a, b);
    const target = mid.clone().add(new THREE.Vector3(0, -0.2, 0));
    // In a car, come in closer on a wider lens rather than leave the cabin.
    const tries: [number, number][] = this.stage.current.cameraBounds ? [[dist, 42], [1.6, 52], [1.2, 60]] : [[dist, 42]];
    for (const [d, fov] of tries) {
      const pos = mid.clone().addScaledVector(perp, d);
      pos.y = mid.y + 0.1;
      if (this.usable({ pos, target, fov }, [A, B]))
        return this.cut({ kind: 'two', pos, target, fov, push: 0, subject: a, subjects: [a, b] });
    }
    this.closeup(a, b);
  }

  /** Over the listener's shoulder onto the speaker. */
  overShoulder(speaker: CharacterId, listener: CharacterId) {
    const S = this.stage.actors[speaker], L = this.stage.actors[listener];
    if (!S?.root.visible || !L?.root.visible) return this.closeup(speaker);
    // Adjacent seats / separate rows use matching singles, as in the series. An orbit behind
    // a listener would put the camera through a door, headrest or the driver's partition.
    if (this.stage.current.dialogueCameras) return this.closeup(speaker, listener);
    const hs = S.headWorld, hl = L.headWorld;
    const back = hl.clone().sub(hs).setY(0);
    if (back.length() > 3.5 || back.length() < 0.5) return this.closeup(speaker, listener);
    back.normalize();
    const side = new THREE.Vector3(-back.z, 0, back.x);
    if (side.z < 0) side.negate();
    const pos = hl.clone().addScaledVector(back, 1.1).addScaledVector(side, 0.45);
    pos.y = hl.y + 0.05;
    const target = hs.clone().add(new THREE.Vector3(0, -0.08, 0));
    // Validate reverse angles against the current walls and furniture too.
    if (!this.inside(pos) || !this.allInFrame(pos, target, 36, this.framePoints([S])) || !this.sees(pos, S) || !this.hasBackdrop({ pos, target, fov: 36 })) return this.closeup(speaker, listener);
    this.cut({ kind: 'ots', pos, target, fov: 36, follow: S, followOffset: new THREE.Vector3(0, -0.08, 0), push: 0, subject: speaker, subjects: [speaker] });
  }

  /** The shot the writer asked for, on `subject` (and `other`, for a two-shot). */
  intent(shot: ShotIntent, subject: CharacterId, other?: CharacterId) {
    switch (shot) {
      case 'closeup': return this.closeup(subject, other);
      case 'push_in': return this.pushIn(subject, other);
      case 'wide': return this.coverage(this.stage.castIds(), false);
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

  private nearest(id: CharacterId) {
    const p = this.stage.actors[id].position;
    return this.stage.castIds().filter((o) => o !== id)
      .sort((a, b) => this.stage.actors[a].position.distanceTo(p) - this.stage.actors[b].position.distanceTo(p))[0];
  }

  /** Pick coverage for a line of dialogue. */
  onLine(speaker: CharacterId, to?: CharacterId) {
    const s = this.current;
    const since = this.time - this.lastCut;
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
    if (this.pending && this.time - this.lastCut >= this.minShot) this.commit(this.pending);
    const s = this.shot;
    if (s && !this.pending && s.kind !== 'establishing' && !s.follow && this.time - Math.max(this.lastCut, this.lastReframe) > 0.5) {
      const ids = s.subjects?.filter((id) => this.stage.onStage(id)) ?? [];
      const moving = ids.map((id) => this.stage.actors[id]).filter((a) => a.isWalking);
      if (moving.length && !this.covers(s, moving)) {
        this.lastReframe = this.time;
        this.coverage(ids);
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
          if (this.inside(moved) && this.sees(moved, s.follow)) s.pos.copy(moved);
          // Can't track alongside: pan from where we stand while they're still in view, rather than
          // cut to a fresh single on the same person.
          else if (!this.sees(s.pos, s.follow)) {
            if (!this.pending) this.closeup(s.subject!);
            return;
          }
          s.target.add(displacement);
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
    if (dt > 0 && s.push && this.time - this.lastCut < (s.pushFor ?? 4)) {
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
