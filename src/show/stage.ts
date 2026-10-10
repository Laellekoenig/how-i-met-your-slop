import * as THREE from 'three';
import { Actor, BACK_HEIGHTS } from '../world/actor';
import { CHARACTERS, dressed, outfitAt, setGuests, type CharacterDef } from '../world/characters';
import type { StageSet, Mark, Door } from '../world/sets/common';
import { buildSets } from '../world/sets';
import { KID_MARKS } from '../world/sets/future';
import { buildEstablishing, type Establishing } from '../world/sets/establishing';
import { CHARACTER_IDS, KIDS, isCharacterId, isGuest, isKid, type CharacterId, type Costume, type EstablishingTransition, type GuestStar, type LocationId, type Outfit, type Prop, type TimeOfDay } from '../script/types';
import { minBy, pick, rand } from '../util';
import { SEATED_SPACE, SPACE, joinRoute, routeNodes, walkRoute, type Person } from './navigation';
import { Crowd, type Seat } from './crowd';

/**
 * Going through a door that swings into the room, measured from its hinges: spots as [along the wall toward the
 * latch, out into the room], or as [how far from the hinges, how far round from the wall].
 */
const DOORWAY = {
  /** Just outside, and just inside. */
  out: [0.58, -0.7] as [number, number],
  in: [0.58, 0.12] as [number, number],
  /** Where they stand to pull it open or swing it shut: beside the latch, clear of its swing. */
  side: [1.33, 0.25] as [number, number],
  /** How far it's pulled open on the way out, how far it stays ahead of someone pulling it to behind them, and
   * of someone pushing it open on the way in (further: their feet are on the far side, out of sight). */
  open: 0.75,
  lead: 0.65,
  push: 0.75,
};

/** How far behind each seat its backrest is, at each of `BACK_HEIGHTS`, so whoever sits there can lean back into it. */
function measureBacks(set: StageSet, meshes: THREE.Mesh[]) {
  set.group.updateMatrixWorld(true);
  const marks = Object.values(set.marks);
  const props = marks.flatMap((m) => m.prop ?? []);
  const solid = meshes.filter((o) => !o.userData.cameraBackdrop && !props.some((p) => p === o || p.getObjectById(o.id)));
  const ray = new THREE.Raycaster();
  ray.far = 0.9;
  for (const m of marks) {
    if (m.seat === null) continue;
    const behind = new THREE.Vector3(-Math.sin(m.facing), 0, -Math.cos(m.facing));
    m.back = BACK_HEIGHTS.map((h) => {
      ray.set(new THREE.Vector3(m.pos.x, m.pos.y + m.seat! + h, m.pos.z), behind);
      return ray.intersectObjects(solid, false)[0]?.distance ?? Infinity;
    });
  }
}

export interface FrozenScene {
  set: StageSet;
  time: TimeOfDay;
  occupancy: Map<string, CharacterId>;
  actorMark: Map<CharacterId, string>;
  actorNode: Map<CharacterId, string>;
  background: Set<CharacterId>;
  outfits: Map<CharacterId, Outfit>;
  actors: {
    id: CharacterId; pos: THREE.Vector3; facing: number; seat: number | null; pose?: Mark['pose']; prop?: THREE.Object3D; depth?: number; back?: readonly number[];
    emotion: Actor['emotion']; holdingGlass: boolean; held: Prop | null;
  }[];
}

/** Owns the sets and actors; knows how to place and move people around. */
export class Stage {
  readonly sets: Record<LocationId, StageSet>;
  readonly actors = {} as Record<CharacterId, Actor>;
  /** Background people. `chatty` ones talk among themselves; one with a `mark` gives it up to anyone the script puts there. */
  readonly extras: { actor: Actor; set: LocationId; talkT: number; chatty: boolean; mark?: string }[] = [];
  current: StageSet;
  private sceneVersion = 0;
  private scenery = new Map<StageSet, THREE.Mesh[]>();
  private occupancy = new Map<string, CharacterId>(); // mark -> character
  private actorMark = new Map<CharacterId, string>();
  private actorNode = new Map<CharacterId, string>();
  private backgroundIds = new Set<CharacterId>();
  /** Who's in their work clothes. Everyone else is in their own. */
  private outfits = new Map<CharacterId, Outfit>();
  /** This episode's and scene's costumes, worn over casual or work clothes. */
  private costumes = new Map<CharacterId, Costume>();
  /** What each actor in `actors` was built to wear (an outfit, plus any costume); casual if missing. */
  private wearing = new Map<CharacterId, string>();
  /** Actors built for the clothes people aren't wearing right now, keyed `id|clothes`. */
  private wardrobe = new Map<string, Actor>();
  /** A freeze frame: nobody moves until it's lifted. */
  frozen = false;
  /** The scene we cut away from while we're on the 2030 couch. */
  private paused: { set: StageSet; visible: CharacterId[] } | null = null;
  private time: TimeOfDay = 'night';
  private establishing: Establishing | null = null;
  private establishingCast: CharacterId[] | null = null;
  /** Stop-motion: when set, the world only moves in steps this many seconds apart, like a burst of photos. */
  strobe = 0;
  private strobeDt = 0;
  /** A split screen is up: its sets share the same floor space, so nobody there gives way to anybody. */
  private split = false;
  /** Who gives way to whom, so nobody walks through anybody. Whoever's working a door keeps to their way. */
  private crowd = new Crowd((a) => Object.values(this.actors).includes(a) && !this.atDoor(a), (a) => this.seatOf(a));
  /** Who's going through a door right now, and which; their turn ends when they're told to do anything else. */
  private doorWork = new Map<CharacterId, { door: Door; turn: number }>();
  private doorTurns = 0;
  /** One at a time through each door: the next in line waits for whoever's going through. */
  private doorQueue = new Map<Door, Promise<void>>();
  /** Who's on their way out (an exit under way); any other instruction for them calls it off. */
  private outgoing = new Set<CharacterId>();
  /** Who has gone out the door since the director last asked (see `takeExits`). */
  private exited: CharacterId[] = [];
  /** A door shutting (for its sound). */
  onDoorShut: (() => void) | null = null;

  constructor(private scene: THREE.Scene) {
    this.sets = buildSets();
    for (const s of Object.values(this.sets)) {
      s.group.visible = false;
      scene.add(s.group);
      const meshes: THREE.Mesh[] = [];
      s.group.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
      this.scenery.set(s, meshes);
      measureBacks(s, meshes);
    }
    for (const id of CHARACTER_IDS) {
      const a = new Actor(CHARACTERS[id]);
      a.root.visible = false;
      scene.add(a.root);
      this.actors[id] = a;
    }
    this.buildExtras();
    this.current = this.sets.maclarens;
    this.current.group.visible = true;
  }

  private extra(i: number, name: string, look: Partial<CharacterDef['look']>) {
    const def: CharacterDef = {
      id: `extra${i}` as CharacterId,
      name,
      color: '#999',
      main: false,
      voice: CHARACTERS.carl.voice,
      look: { ...CHARACTERS.carl.look, extras: [], pants: '#2a2a30', build: 1, ...look } as CharacterDef['look'],
    };
    return new Actor(def);
  }

  /** Background patrons, crew, students and the cabbie; named marks yield to the cast. */
  private buildExtras() {
    const looks: Partial<CharacterDef['look']>[] = [
      { female: false, hair: '#2a1a12', hairStyle: 'short', top: '#5a6b7a', topStyle: 'polo', skin: '#c48a64', height: 1.8 },
      { female: true, hair: '#1a1210', hairStyle: 'ponytail', top: '#9a3a4a', topStyle: 'tee', skin: '#e8b996', height: 1.68 },
      { female: false, hair: '#8a6a3a', hairStyle: 'messy', top: '#3a5a3a', topStyle: 'flannel', plaid: ['#1a2a1a', '#9a8a5a'], skin: '#f0c4a4', height: 1.85 },
    ];
    // Corner/window seating, the neighboring booth, and both perimeter bays.
    // Background pairs belong to actual seats, outside the cast's walking aisles.
    const spots: [number, number, number, number][] = [
      [-6.42, -3.0, Math.PI / 2, 0.47], [-5.4, -3.92, 0, 0.47], [1.3, -3.78, 0, 0.48],
      [-3.78, 1.6, Math.PI / 2, 0.47], [-2.25, 0.95, -Math.PI / 2, 0.47],
      [-6.5, 2.9, Math.PI / 2, 0.47], [-4.81, 4.25, -Math.PI / 2, 0.48],
      [6.5, 3.2, -Math.PI / 2, 0.47], [4.81, 4.55, Math.PI / 2, 0.48],
    ];
    spots.forEach((spot, i) => {
      const a = this.extra(i, 'Patron', { ...looks[i % looks.length], top: ['#5a6b7a', '#9a3a4a', '#3a5a3a', '#756249', '#4f6570', '#72534a', '#605c76', '#6e7358', '#8a6550'][i] });
      a.place(new THREE.Vector3(spot[0], 0, spot[1]), spot[2], spot[3]);
      a.holdingGlass = true;
      this.sets.maclarens.group.add(a.root);
      this.extras.push({ actor: a, set: 'maclarens', talkT: rand(0, 3), chatty: true });
      if (i >= 3) {
        const partner = spots[i % 2 ? i + 1 : i - 1];
        a.lookAt = new THREE.Vector3(partner[0], 1.25, partner[1]);
      }
    });
    // they chat with each other
    this.extras[0].actor.lookAt = new THREE.Vector3(-5.4, 1.25, -3.92);
    this.extras[1].actor.lookAt = new THREE.Vector3(-6.42, 1.25, -3.0);

    // a cab always comes with a cabbie, unless Ranjit (or someone) takes the wheel
    const cabbie = this.extra(this.extras.length, 'Cabbie', {
      female: false, hair: '#3a2a20', hairStyle: 'receding', top: '#4a4238', topStyle: 'flannel', plaid: ['#2a2620', '#6a5a40'],
      skin: '#a8724c', height: 1.74, build: 1.15, extras: ['cap'],
    });
    const wheel = this.sets.taxi.marks.driver;
    cabbie.place(wheel.pos.clone(), wheel.facing, wheel.seat, { pose: wheel.pose });
    this.sets.taxi.group.add(cabbie.root);
    this.extras.push({ actor: cabbie, set: 'taxi', talkT: 0, chatty: false, mark: 'driver' });

    const atMark = (set: LocationId, markName: string, name: string, look: Partial<CharacterDef['look']>, chatty = false) => {
      const s = this.sets[set], m = s.marks[markName];
      const a = this.extra(this.extras.length, name, look);
      const p = m.pos.clone(); p.y = s.floorAt?.(p.x, p.z) ?? 0;
      a.place(p, m.facing, m.seat);
      s.group.add(a.root);
      this.extras.push({ actor: a, set, talkT: rand(0, 3), chatty, mark: markName });
      return a;
    };
    atMark('hoser_hut', 'bartender', 'Canadian bartender', { ...looks[0], top: '#6c3038', topStyle: 'flannel', plaid: ['#312b29', '#a67258'] });
    atMark('hoser_hut', 'patron_left', 'Hockey fan', { ...looks[2], top: '#254974', topStyle: 'sweater' }, true);
    atMark('hoser_hut', 'patron_right', 'Hockey fan', looks[1], true);
    atMark('atlantic_city_casino', 'dealer', 'Dealer', { ...looks[0], top: '#eeeece', topStyle: 'shirt', vest: '#743641', tie: '#25212b' });
    atMark('atlantic_city_casino', 'slots', 'Casino guest', looks[1]);
    atMark('courtroom', 'judge', 'Judge', { ...looks[0], top: '#292831', topStyle: 'blazer', under: '#e8e0cd', hair: '#b9b5a6', height: 1.86 });
    atMark('courtroom', 'jury', 'Juror', looks[1]);
    atMark('lusty_leopard', 'patron_left', 'Lounge guest', { ...looks[0], top: '#3e3d4a', topStyle: 'blazer' }, true);
    atMark('lusty_leopard', 'patron_right', 'Lounge guest', looks[1], true);
    atMark('store', 'cashier', 'Shopkeeper', { ...looks[0], top: '#567754' });
    atMark('metro_news_one', 'camera_operator', 'Camera operator', { ...looks[2], top: '#41464c', topStyle: 'tee' });
    // Dinner pairs look at each other, with occupied seats yielding to the cast.
    for (const [i, [left, right]] of [
      ['table_2_left', 'table_2_right'], ['dining_left', 'dining_right'], ['dining_front_left', 'dining_front_right'], ['window_front_left', 'window_front_right'],
    ].entries()) {
      const a = atMark('restaurant', left, 'Diner', { ...looks[i % looks.length], top: ['#5a6b7a', '#a47750', '#655875', '#4e6b59'][i], topStyle: i === 1 ? 'sweater' : 'polo' }, true);
      const b = atMark('restaurant', right, 'Diner', { ...looks[1], top: ['#9a3a4a', '#52756c', '#b17d55', '#aa6258'][i], hair: i === 1 ? '#674025' : '#1a1210' }, true);
      a.holdingGlass = b.holdingGlass = true;
      a.lookAt = b.headWorld; b.lookAt = a.headWorld;
    }
    atMark('restaurant', 'host', 'Host', { ...looks[0], top: '#303b36', topStyle: 'blazer', under: '#f4ead6', tie: '#78363c' });
    atMark('restaurant', 'service', 'Waiter', { ...looks[2], top: '#eee7d8', topStyle: 'shirt', vest: '#36302d', tie: '#78363c', extras: ['apron'] });
    for (const [i, spot] of ['student_1_2', 'student_1_5', 'student_2_1', 'student_2_4', 'student_3_3', 'student_3_6'].entries()) {
      atMark('lecture_hall', spot, 'Student', looks[i % looks.length]);
    }
  }

  /** Rebuild the guest-star slots this episode recasts. Call between scenes, never mid-scene. */
  castGuests(guests: GuestStar[] = []) {
    for (const id of setGuests(guests)) {
      this.discard(this.actors[id]);
      const a = new Actor(CHARACTERS[id]);
      a.root.visible = false;
      this.scene.add(a.root);
      this.actors[id] = a;
    }
  }

  /**
   * Remember the scene exactly as it is, to come back to after a cutaway that may reuse the same people.
   * Anyone still walking is put where they were headed.
   */
  freeze(): FrozenScene {
    return {
      set: this.current,
      time: this.time,
      occupancy: new Map(this.occupancy),
      actorMark: new Map(this.actorMark),
      actorNode: new Map(this.actorNode),
      background: new Set(this.backgroundIds),
      outfits: new Map(this.outfits),
      actors: this.onStageIds().map((id) => {
        const a = this.actors[id];
        const mark = this.current.marks[this.actorMark.get(id) ?? ''];
        const pos = a.isWalking ? (a.remainingPath.at(-1) ?? a.position.clone()) : a.position.clone();
        return {
          id, pos, facing: mark && (a.isWalking || mark.seat !== null) ? mark.facing : a.targetFacing,
          seat: mark?.seat ?? null, pose: mark?.pose, prop: mark?.prop, depth: mark?.depth, back: mark?.back, emotion: a.emotion, holdingGlass: a.holdingGlass,
          held: a.prop,
        };
      }),
    };
  }

  /** Back from a cutaway to the frozen scene. */
  thaw(f: FrozenScene) {
    this.setLocation(f.set.id, f.time);
    for (const id of CHARACTER_IDS) this.dress(id, f.outfits.get(id) ?? 'casual');
    for (const [k, v] of f.occupancy) this.occupancy.set(k, v);
    for (const [k, v] of f.actorMark) this.actorMark.set(k, v);
    for (const [k, v] of f.actorNode) this.actorNode.set(k, v);
    for (const id of f.background) this.backgroundIds.add(id);
    for (const s of f.actors) {
      const a = this.actors[s.id];
      a.place(s.pos, s.facing, s.seat, { pose: s.pose, prop: s.prop, depth: s.depth, back: s.back });
      a.setEmotion(s.emotion);
      a.holdingGlass = s.holdingGlass;
      a.hold(s.held);
      a.root.visible = true;
    }
    this.syncExtras();
  }

  setLocation(id: LocationId, time: TimeOfDay) {
    this.sceneVersion++;
    this.endEstablishing();
    this.paused = null;
    for (const s of Object.values(this.sets)) s.group.visible = false;
    this.current = this.sets[id] ?? this.sets.maclarens;
    this.current.group.visible = true;
    this.current.setTime(time);
    this.time = time;
    this.split = false;
    this.crowd.clear();
    for (const c of CHARACTER_IDS) this.dress(c, outfitAt(c, id));
    for (const a of Object.values(this.actors)) {
      a.root.visible = false;
      a.place(new THREE.Vector3(0, 0, 0), 0, null);
      a.resetFace();
      a.holdingGlass = false;
      a.hold(null);
    }
    this.clearMarks();
    this.backgroundIds.clear();
    this.doorWork.clear();
    this.doorQueue.clear();
    this.outgoing.clear();
    this.exited = [];
    for (const s of Object.values(this.sets)) for (const d of Object.values(s.doors ?? {})) d.reset();
    this.syncExtras();
  }

  /**
   * Change someone into their work clothes or back into their own, with their costume (if any) on top. Swaps in
   * another actor (built the first time it's needed), so only call it before they're placed in a scene.
   */
  dress(id: CharacterId, outfit: Outfit) {
    const costume = this.costumes.get(id);
    if (!CHARACTERS[id].work) outfit = 'casual';
    else if (outfit === 'casual') this.outfits.delete(id);
    else this.outfits.set(id, outfit);
    const clothes = costume ? `${outfit}:${costumeKey(costume)}` : outfit;
    const wearing = this.wearing.get(id) ?? 'casual';
    if (wearing === clothes) return;
    const old = this.actors[id];
    let a = this.wardrobe.get(`${id}|${clothes}`);
    if (!a) {
      a = new Actor(dressed(CHARACTERS[id], outfit, costume));
      this.scene.add(a.root);
    }
    this.wardrobe.delete(`${id}|${clothes}`);
    this.wardrobe.set(`${id}|${wearing}`, old);
    old.root.visible = false;
    old.hold(null);
    a.root.visible = false;
    a.place(new THREE.Vector3(0, 0, 0), 0, null);
    a.resetFace();
    a.holdingGlass = a.talking = false;
    a.lookAt = null;
    this.actors[id] = a;
    if (clothes === 'casual') this.wearing.delete(id);
    else this.wearing.set(id, clothes);
  }

  /**
   * Costumes for the scenes ahead (the episode's, with the scene's over them). They go on at the next location
   * change; actors built for costumes nobody wears any more are thrown away.
   */
  setWardrobe(costumes: Costume[] = []) {
    this.costumes.clear();
    for (const c of costumes) if (!isGuest(c.character) && !isKid(c.character)) this.costumes.set(c.character, c);
    for (const [k, a] of this.wardrobe) {
      const [id, clothes] = k.split('|') as [CharacterId, string];
      const costume = this.costumes.get(id);
      if (!clothes.includes(':') || (costume && clothes.endsWith(`:${costumeKey(costume)}`))) continue;
      this.discard(a);
      this.wardrobe.delete(k);
    }
  }

  /** Take an actor out of the scene for good, freeing its geometry. */
  private discard(a: Actor) {
    this.scene.remove(a.root);
    a.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }

  outfitOf(id: CharacterId): Outfit {
    return this.outfits.get(id) ?? 'casual';
  }

  /** Temporarily replace the story with an actor-free view of New York. Built only when first needed. */
  establish(kind: EstablishingTransition, location: LocationId, time: TimeOfDay, angle?: number) {
    this.endEstablishing();
    if (!this.establishing) {
      this.establishing = buildEstablishing();
      this.scene.add(this.establishing.group);
    }
    this.establishingCast = this.onStageIds();
    for (const id of this.establishingCast) this.actors[id].root.visible = false;
    this.current.group.visible = false;
    this.establishing.group.visible = true;
    return this.establishing.show(kind, location, time, angle);
  }

  endEstablishing() {
    if (!this.establishingCast) return;
    this.establishing!.group.visible = false;
    this.current.group.visible = true;
    for (const id of this.establishingCast) this.actors[id].root.visible = true;
    this.establishingCast = null;
  }

  onStage(id: CharacterId) {
    return this.actors[id]?.root.visible ?? false;
  }

  onStageIds(): CharacterId[] {
    return CHARACTER_IDS.filter((id) => this.onStage(id));
  }

  /** On-stage characters who are part of the scene (excludes background like Carl behind the bar). */
  castIds(): CharacterId[] {
    return this.onStageIds().filter((id) => !this.backgroundIds.has(id));
  }

  setBackground(id: CharacterId, on: boolean) {
    if (on) this.backgroundIds.add(id);
    else this.backgroundIds.delete(id);
  }

  markOf(id: CharacterId) {
    return this.actorMark.get(id);
  }

  /** Resolve a mark name loosely (LLMs improvise). Falls back to a free standing spot. */
  resolveMark(name: string | undefined, forChar?: CharacterId): string {
    const marks = this.current.marks;
    if (name && marks[name] && this.isFree(name, forChar)) return name;
    if (name) {
      const n = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const hit = Object.keys(marks).find((k) => k === n) ?? Object.keys(marks).find((k) => k.includes(n) || n.includes(k));
      if (hit && this.isFree(hit, forChar)) return hit;
      // occupied: look for a free mark of the same family (booth_*, couch_*, bar_stool_*)
      const family = (hit ?? n).split('_')[0];
      const sibling = Object.keys(marks).find((k) => k.startsWith(family) && this.isFree(k, forChar));
      if (sibling) return sibling;
    }
    const reserved = this.current.reserved ?? [];
    const free = Object.keys(marks).filter((k) => this.isFree(k, forChar) && k !== this.current.door && !reserved.includes(k));
    const seats = free.filter((k) => marks[k].seat !== null);
    if (seats.length) return pick(seats);
    if (free.length) return pick(free);
    // a full house: squeeze in somewhere
    return marks.center ? 'center' : pick(Object.keys(marks).filter((k) => k !== this.current.door && !reserved.includes(k)));
  }

  private isFree(mark: string, forChar?: CharacterId) {
    if (mark === this.current.door || Object.values(this.current.entrances ?? {}).includes(mark)) return true;
    const who = this.occupancy.get(mark);
    return !who || who === forChar;
  }

  /** Nobody is on any mark. */
  private clearMarks() {
    this.occupancy.clear();
    this.actorMark.clear();
    this.actorNode.clear();
  }

  private occupy(id: CharacterId, mark: string | null) {
    const prev = this.actorMark.get(id);
    if (prev && this.occupancy.get(prev) === id) this.occupancy.delete(prev);
    this.actorMark.delete(id);
    this.actorNode.delete(id);
    if (mark) {
      this.occupancy.set(mark, id);
      this.actorMark.set(id, mark);
      this.actorNode.set(id, this.current.marks[mark].node);
    }
    this.syncExtras();
  }

  private syncExtras() {
    for (const e of this.extras) if (e.set === this.current.id && e.mark) e.actor.root.visible = !this.occupancy.has(e.mark);
  }

  /** Standing spot near a mark, nudged if a standing mark is taken (people can share floor space). */
  private markPosition(m: Mark, name: string, id: CharacterId) {
    const p = m.pos.clone();
    if (m.seat === null) {
      const who = this.occupancy.get(name);
      if (who && who !== id) p.add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(0.3, 0.6)));
    }
    return p;
  }

  place(id: CharacterId, markName: string) {
    const name = this.resolveMark(markName, id);
    const m = this.current.marks[name];
    const a = this.actors[id];
    const pos = this.markPosition(m, name, id);
    pos.y = this.floorY(pos.x, pos.z);
    this.crowd.forget(a);
    this.leaveDoor(id);
    a.place(pos, m.facing, m.seat, { pose: m.pose, prop: m.prop, depth: m.depth, back: m.back });
    a.root.visible = true;
    this.occupy(id, name);
  }

  /** The current set's floor height here (raised in a few sets: a stage, the judge's bench). */
  private floorY(x: number, z: number) {
    return this.current.floorAt?.(x, z) ?? 0;
  }

  /** Stand someone anywhere on the floor, off the marks (the main titles' huddle). */
  stand(id: CharacterId, x: number, z: number, facing: number) {
    const a = this.actors[id];
    a.place(new THREE.Vector3(x, this.floorY(x, z), z), facing, null);
    a.root.visible = true;
  }

  /** Penny and Luke, in their spots on the couch. */
  seatKids() {
    for (const id of KIDS) {
      const m = this.sets.future.marks[KID_MARKS[id]];
      const a = this.actors[id];
      a.place(m.pos.clone(), m.facing, m.seat, { pose: m.pose, prop: m.prop, depth: m.depth, back: m.back });
      a.setEmotion('bored');
      a.root.visible = true;
    }
  }

  get inCutaway() {
    return this.paused !== null;
  }

  /** Cut to the kids on the couch in 2030, freezing the scene in progress. */
  cutToKids() {
    if (this.paused) return;
    const visible = this.onStageIds();
    this.paused = { set: this.current, visible };
    for (const id of visible) this.actors[id].root.visible = false;
    this.current.group.visible = false;
    this.current = this.sets.future;
    this.current.group.visible = true;
    this.current.setTime('night');
    this.seatKids();
  }

  /** Back to the story, exactly where we left it. */
  cutBack() {
    if (!this.paused) return;
    for (const id of KIDS) this.actors[id].root.visible = false;
    this.current.group.visible = false;
    this.current = this.paused.set;
    this.current.group.visible = true;
    for (const id of this.paused.visible) this.actors[id].root.visible = true;
    this.paused = null;
  }

  private nearestNode(p: THREE.Vector3) {
    const nodes = this.current.nodes;
    return minBy(Object.keys(nodes), (k) => nodes[k].distanceTo(p)) ?? '';
  }

  /** Walk to a mark or next to another character. */
  moveTo(id: CharacterId, target: string): Promise<void> {
    this.leaveDoor(id);
    return this.walkTo(id, target);
  }

  /** Walk to a mark or next to someone; `spot` stops somewhere else along the way to the mark (beside a door). */
  private walkTo(id: CharacterId, target: string, spot?: { pos: THREE.Vector3; facing: number }): Promise<void> {
    const a = this.actors[id];
    if (!a.root.visible) return this.enter(id, target);
    this.crowd.forget(a);
    const prevMarkName = this.actorMark.get(id);
    let name: string;
    let dest: THREE.Vector3;
    let facing: number;
    let seat: number | null = null;
    let approach: THREE.Vector3 | undefined;
    let node: string;
    const other = isCharacterId(target) ? target : null;
    // in a car you can't go stand next to someone: slide over to the free seat nearest them
    if (other && this.current.seated) target = this.seatNear(other, id) ?? (prevMarkName || target);
    if (other && other !== id && this.onStage(other) && !this.current.seated) {
      const o = this.actors[other];
      // Where they'll stand: someone still on their way is met at the end of their walk, not on top of it.
      const op = (o.remainingPath.at(-1) ?? o.position).clone();
      // Approach via their authored aisle, never an arbitrary offset inside a desk or wall.
      const otherMark = this.current.marks[this.actorMark.get(other) ?? ''];
      node = otherMark?.node ?? this.nearestNode(op);
      dest = (otherMark?.approach ?? this.current.nodes[node]).clone();
      if (dest.distanceTo(op) < 0.4) {
        const adjacent = this.current.edges.flatMap(([x, y]) => x === node ? [y] : y === node ? [x] : []);
        // Stop on the near side of them, not past them where they'd be walked through to get there.
        const nearby = adjacent.sort((x, y) => this.current.nodes[x].distanceTo(a.position) - this.current.nodes[y].distanceTo(a.position))[0];
        if (nearby) dest.lerp(this.current.nodes[nearby], Math.min(1, 0.85 / dest.distanceTo(this.current.nodes[nearby])));
      }
      facing = Math.atan2(op.x - dest.x, op.z - dest.z) * 0.6;
      name = '';
    } else {
      name = this.resolveMark(target, id);
      const m = this.current.marks[name];
      dest = spot?.pos.clone() ?? this.markPosition(m, name, id);
      facing = spot?.facing ?? m.facing;
      seat = spot ? null : m.seat;
      approach = spot ? undefined : m.approach;
      node = m.node;
    }
    if (prevMarkName === name && !a.isWalking && !spot) return Promise.resolve();
    const curMark = prevMarkName ? this.current.marks[prevMarkName] : undefined;
    const pts = a.remainingPath;
    const start = pts.at(-1) ?? a.position;
    const fromNode = curMark?.node ?? this.actorNode.get(id) ?? this.nearestNode(start);
    const route = routeNodes(this.current, fromNode, node);
    if (!route) {
      // Separate vehicle compartments are entered through their own doors.
      if (this.current.seated && name) {
        const version = this.sceneVersion;
        return this.exit(id).then(() => {
          if (version === this.sceneVersion) return this.enter(id, name);
        });
      }
      return Promise.resolve();
    }
    this.occupy(id, name || null);
    this.actorNode.set(id, node);
    // Set off from where they are (finishing any corners still ahead only if nothing shorter is clear),
    // stepping out of the seat they're leaving, and arrive by the mark's own approach.
    const leaving = [a.position.clone(), ...pts, ...(curMark?.approach ? [curMark.approach.clone()] : [])];
    const arriving = [...(approach ? [approach.clone()] : []), dest];
    // Cars keep every seat on the way; on foot, cut across wherever the furniture allows.
    // On foot, they go around whoever stands about too, if there's a way.
    const people = this.current.seated ? [] : this.peopleAround(a);
    const path = (!this.current.seated && (walkRoute(this.current, leaving, fromNode, arriving, node, people) || walkRoute(this.current, leaving, fromNode, arriving, node)))
      || [...leaving, ...route, ...arriving];
    const m = this.current.marks[name];
    return a.walk(joinRoute(path).slice(1), { facing, seat, scoot: this.current.seated, pose: m?.pose, prop: m?.prop, depth: m?.depth, back: m?.back });
  }

  /** The free seat closest to someone (for sliding over to them in a car). */
  private seatNear(other: CharacterId, id: CharacterId) {
    if (!this.onStage(other)) return undefined;
    const p = this.actors[other].position;
    const marks = this.current.marks;
    const reserved = this.current.reserved ?? [];
    const seats = Object.keys(marks).filter((k) => marks[k].seat !== null && k !== this.current.door && !reserved.includes(k)
      && this.isFree(k, id) && marks[k].pos.distanceTo(p) > 0.1);
    return minBy(seats, (k) => marks[k].pos.distanceTo(p));
  }

  /** Sit down in the nearest free seat they can get to. */
  sitDown(id: CharacterId): Promise<void> {
    this.leaveDoor(id);
    const a = this.actors[id];
    if (!this.onStage(id) || a.isSitting || this.current.seated) return Promise.resolve();
    const from = this.actorNode.get(id) ?? this.nearestNode(a.position);
    const marks = this.current.marks;
    const doors = [this.current.door, ...Object.values(this.current.entrances ?? {}), ...(this.current.reserved ?? [])];
    const seats = Object.keys(marks).filter((k) => marks[k].seat !== null && !doors.includes(k) && this.isFree(k, id)
      && routeNodes(this.current, from, marks[k].node));
    const best = minBy(seats, (k) => marks[k].pos.distanceTo(a.position));
    return best ? this.moveTo(id, best) : Promise.resolve();
  }

  /** Get up out of a seat and step into the aisle beside it (there's no standing up in a car). */
  standUp(id: CharacterId): Promise<void> {
    this.leaveDoor(id);
    const a = this.actors[id];
    if (!this.onStage(id) || !a.isSitting || this.current.seated) return Promise.resolve();
    const m = this.current.marks[this.actorMark.get(id) ?? ''];
    const node = m?.node ?? this.nearestNode(a.position);
    const dest = (m?.approach ?? this.current.nodes[node]).clone();
    this.crowd.forget(a);
    this.occupy(id, null);
    this.actorNode.set(id, node);
    return a.walk([dest], { facing: a.facing, seat: null });
  }

  private entrance(markName?: string) {
    const node = this.current.marks[markName ?? '']?.node;
    return this.current.entrances?.[node] ?? this.current.door;
  }

  /** Come in through the door (opening and shutting it, unless `instant`: a scene picked up after they came in). */
  enter(id: CharacterId, target?: string, instant = false): Promise<void> {
    this.leaveDoor(id);
    const name = this.resolveMark(target && target !== this.current.door ? target : 'center', id);
    const doorName = this.entrance(name), door = this.current.marks[doorName];
    const swing = this.current.doors?.[doorName];
    if (swing && !instant) return this.throughDoor(id, swing, (turn) => this.comeIn(id, swing, doorName, name, turn));
    const a = this.actors[id];
    const pos = door.pos.clone();
    pos.y = this.floorY(pos.x, pos.z);
    a.place(pos, door.facing, this.current.seated ? door.seat : null);
    a.root.visible = true;
    this.occupy(id, doorName);
    return this.walkTo(id, name);
  }

  /** Gone, without walking to the door (a scene picked up after they left). */
  leave(id: CharacterId) {
    this.leaveDoor(id);
    this.actors[id].root.visible = false;
    this.actors[id].hold(null);
    this.crowd.forget(this.actors[id]);
    this.occupy(id, null);
  }

  /**
   * Split screen: light up another set beside the current one, ready for its own people to be placed on its
   * marks. Everyone already placed stays where they are (on their own set); `setLocation` or `thaw` ends it.
   */
  openPanel(id: LocationId, time: TimeOfDay) {
    this.current = this.sets[id] ?? this.current;
    this.current.group.visible = true;
    this.current.setTime(time);
    this.split = true;
    this.clearMarks();
    this.syncExtras();
  }

  /** Look at one panel's set as the current one (for framing it), without moving anyone. */
  focusPanel(id: LocationId) {
    this.current = this.sets[id] ?? this.current;
  }

  /** Someone walking out: still on stage, but heading for the door to leave. */
  leaving(id: CharacterId) {
    return this.outgoing.has(id) && this.onStage(id);
  }

  /** Someone opening a door, going through it or shutting it behind them: coming or going, even when not walking. */
  atTheDoor(id: CharacterId) {
    return this.doorWork.has(id);
  }

  /** Who has walked out through the door since the last call: they're gone, and the room is the rest. */
  takeExits() {
    return this.exited.splice(0);
  }

  /** Out through the door and off the stage. */
  private gone(id: CharacterId) {
    this.outgoing.delete(id);
    this.actors[id].root.visible = false;
    this.occupy(id, null);
    this.exited.push(id);
  }

  async exit(id: CharacterId) {
    if (!this.onStage(id)) return;
    this.leaveDoor(id);
    this.outgoing.add(id);
    const version = this.sceneVersion, door = this.entrance(this.actorMark.get(id));
    const swing = this.current.doors?.[door];
    if (swing) return this.throughDoor(id, swing, (turn) => this.goOut(id, swing, door, turn));
    await this.walkTo(id, door);
    // A skipped scene or a subsequent move must not let an old exit hide the new cast.
    if (version !== this.sceneVersion || this.actorMark.get(id) !== door) return;
    this.gone(id);
  }

  /** Whether someone is in the middle of going through a door (and keeps to their own way meanwhile). */
  private atDoor(a: Actor) {
    for (const id of this.doorWork.keys()) if (this.actors[id] === a) return true;
    return false;
  }

  /** Wait for the door to be free, then go through it. `go` checks it's still their turn after every step. */
  private throughDoor(id: CharacterId, door: Door, go: (turn: number) => Promise<void>) {
    const turn = ++this.doorTurns;
    this.doorWork.set(id, { door, turn });
    const done = (this.doorQueue.get(door) ?? Promise.resolve()).then(() => this.doorWork.get(id)?.turn === turn ? go(turn) : undefined);
    this.doorQueue.set(door, done.catch(() => {}));
    return done;
  }

  /** Stop whatever they were doing at a door: let go of it, and it swings shut by itself. */
  private leaveDoor(id: CharacterId) {
    this.outgoing.delete(id);
    const work = this.doorWork.get(id);
    if (!work) return;
    this.doorWork.delete(id);
    const a = this.actors[id];
    a.grab(null);
    a.turnTo = null;
    if (work.door.angle > 0.01) void work.door.swing(0, 0.9);
    else work.door.hold(null);
  }

  /** Done with the door, which is shut. */
  private doneWithDoor(id: CharacterId) {
    this.onDoorShut?.();
    this.doorWork.delete(id);
    this.actors[id].grab(null);
    this.actors[id].turnTo = null;
  }

  /** Take hold of a door's handle with the nearer hand, turned to it a little (the reaching shoulder leads). */
  private handOnDoor(a: Actor, door: Door) {
    const [h] = door.handle(a.position);
    a.root.updateWorldMatrix(true, false);
    const side = a.root.worldToLocal(h.clone()).x > 0 ? 1 : -1;
    a.grab(() => door.handle(a.position), side);
    a.turnTo = () => {
      const [k] = door.handle(a.position), p = a.position;
      return Math.atan2(k.x - p.x, k.z - p.z) - side * 0.35;
    };
  }

  /**
   * In through a door that swings into the room: push it open ahead of them, step in beside the latch, then take
   * hold of it and swing it shut by the handle before walking on.
   */
  private async comeIn(id: CharacterId, door: Door, doorName: string, name: string, turn: number) {
    const a = this.actors[id], version = this.sceneVersion;
    const still = () => this.sceneVersion === version && this.doorWork.get(id)?.turn === turn;
    const out = door.spot(...DOORWAY.out);
    out.y = this.floorY(out.x, out.z);
    a.place(out, door.facing, null);
    a.root.visible = true;
    this.occupy(id, doorName);
    door.hold(() => Math.max(door.angle, door.angleOf(a.position) + DOORWAY.push));
    await a.walk([door.spot(...DOORWAY.in)], { facing: a.facing, seat: null });
    if (!still()) return;
    // (their hand only shows once they're through: before that it would be reaching round the door)
    this.handOnDoor(a, door);
    await a.walk([door.around(...DOORWAY.side)], { facing: a.facing, seat: null });
    if (!still()) return;
    await door.swing(0, 1);
    if (!still()) return;
    this.doneWithDoor(id);
    return this.walkTo(id, name);
  }

  /** Out through a door that swings into the room: pull it open from beside the latch, then pull it to behind them. */
  private async goOut(id: CharacterId, door: Door, doorName: string, turn: number) {
    const a = this.actors[id], version = this.sceneVersion;
    const still = () => this.sceneVersion === version && this.doorWork.get(id)?.turn === turn;
    const beside = door.around(...DOORWAY.side), [h] = door.handle(beside);
    await this.walkTo(id, doorName, { pos: beside, facing: Math.atan2(h.x - beside.x, h.z - beside.z) });
    if (!still()) return;
    this.handOnDoor(a, door);
    await door.swing(DOORWAY.open, 1);
    if (!still()) return;
    door.hold(() => Math.min(door.angle, door.angleOf(a.position) + DOORWAY.lead));
    await a.walk([door.spot(...DOORWAY.in), door.spot(...DOORWAY.out)], { facing: a.facing, seat: null });
    if (!still()) return;
    await door.swing(0, 0.2);
    if (!still()) return;
    this.doneWithDoor(id);
    this.gone(id);
  }

  update(dt: number, t: number) {
    if (this.frozen) return;
    if (this.strobe) {
      this.strobeDt += dt;
      if (this.strobeDt < this.strobe) return;
      dt = this.strobeDt;
      this.strobeDt = 0;
    }
    if (this.establishingCast) {
      this.establishing!.update(dt);
      return;
    }
    if (!this.split && !this.paused && !this.current.seated) this.crowd.update(this.current, this.inTheWay(), dt);
    for (const a of Object.values(this.actors)) if (a.root.visible) a.update(dt, t);
    for (const d of Object.values(this.current.doors ?? {})) d.update(dt);
    // step actors up onto raised floors
    const floorAt = this.current.floorAt;
    if (floorAt)
      for (const a of Object.values(this.actors)) {
        if (!a.root.visible) continue;
        const p = a.root.position;
        p.y += (floorAt(p.x, p.z) - p.y) * Math.min(1, dt * 14);
      }
    for (const e of this.extras) {
      if (!this.sets[e.set].group.visible) continue;
      if (e.mark) e.actor.root.visible = !this.occupancy.has(e.mark);
      if (!e.chatty) {
        e.actor.update(dt, t);
        continue;
      }
      e.talkT -= dt;
      if (e.talkT < 0) {
        e.actor.talking = !e.actor.talking;
        e.talkT = e.actor.talking ? rand(1, 3) : rand(1.5, 5);
        if (!e.actor.talking && Math.random() < 0.3) e.actor.doGesture('drink');
        if (Math.random() < 0.15) e.actor.setEmotion(pick(['happy', 'neutral', 'neutral'] as const));
      }
      e.actor.update(dt, t);
    }
    this.current.update?.(dt, t);
  }

  /** Everyone on the current set a walker could bump into: the cast, and the background people too. */
  private inTheWay() {
    const extras = this.extras.filter((e) => e.set === this.current.id && e.actor.root.visible).map((e) => e.actor);
    return [...this.onStageIds().map((id) => this.actors[id]), ...extras];
  }

  /** The seat someone in the cast is sitting in, for getting up out of it to let someone by. */
  private seatOf(a: Actor): Seat | null {
    const id = this.onStageIds().find((id) => this.actors[id] === a);
    const m = this.current.marks[(id && this.actorMark.get(id)) ?? ''];
    if (!m || m.seat === null) return null;
    return { pos: m.pos.clone(), approach: m.approach?.clone(), facing: m.facing, height: m.seat, pose: m.pose, prop: m.prop, depth: m.depth, back: m.back };
  }

  /** Where everyone else on the set is standing or sitting, or will be once they've got where they're going. */
  private peopleAround(me: Actor): Person[] {
    return this.inTheWay().filter((a) => a !== me).map((a) => ({
      at: (a.remainingPath.at(-1) ?? a.position).clone(),
      room: a.isSitting || a.headingToSeat ? SEATED_SPACE : SPACE,
    }));
  }

  occluders(): THREE.Mesh[] {
    // Include walls, chair backs and new props automatically, even without a legacy tag.
    this.current.group.updateWorldMatrix(true, true);
    return (this.scenery.get(this.current) ?? []).filter((o) => {
      for (let parent: THREE.Object3D | null = o; parent; parent = parent.parent) if (!parent.visible) return false;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      return materials.some((m) => m.visible && (!m.transparent || m.opacity >= 0.8));
    });
  }
}

const costumeKey = ({ character: _, ...look }: Costume) => JSON.stringify(look);
