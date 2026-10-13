import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { testStage } from './helpers/sets';
import { walkingBlockers } from './helpers/geometry';
import type { Actor } from '../src/world/actor';
import type { LocationId } from '../src/script/types';
import { Door, SlidingDoor } from '../src/world/sets/common';

const stage = testStage();
const hinged = Object.values(stage.sets).filter(s => Object.values(s.doors ?? {}).some(d => d instanceof Door)).map(s => s.id);

/** Run the stage a frame at a time, letting the door work's promises settle between frames as they would. */
async function play(seconds: number, each?: () => void) {
  for (let tick = 0; tick < seconds * 30; tick++) {
    stage.update(1 / 30, tick / 30);
    for (let k = 0; k < 6; k++) await null;
    each?.();
  }
}

/** How close either of someone's palms comes to the door's handle. */
function palmToHandle(a: Actor, door: NonNullable<typeof stage.current.doors>[string]) {
  const [at] = door.handle(a.position);
  const hands = a as unknown as { lHand: { palm: THREE.Mesh }; rHand: { palm: THREE.Mesh } };
  a.root.updateWorldMatrix(true, true);
  return Math.min(...[hands.lHand, hands.rHand].map(h => h.palm.getWorldPosition(new THREE.Vector3()).distanceTo(at)));
}

describe('doors on hinges', () => {
  test('the entrances with real doors open them by hand', () => {
    expect(hinged.sort()).toEqual(['apartment', 'barneys', 'barneys_office', 'hoser_hut', 'hospital', 'lecture_hall', 'maclarens', 'metro_news_one', 'restaurant', 'rooftop', 'store', 'wesleyan_dorm'].sort() as LocationId[]);
  });

  test('the spot beside each latch, the way in to it and the swing of the door are clear of the furniture', () => {
    const blocked: string[] = [];
    for (const id of hinged) {
      const set = stage.sets[id];
      for (const [name, door] of Object.entries(set.doors!)) {
        set.group.updateWorldMatrix(true, true);
        const inside = door.spot(0.58, 0.3), beside = door.around(1.33, 0.25), mark = set.marks[name];
        const check = (label: string, a: THREE.Vector3, b: THREE.Vector3, r: number) => {
          const hits = walkingBlockers(set, a, b, r);
          if (hits.length) blocked.push(`${id} ${label}: ${hits.join('; ')}`);
        };
        check('in to the latch', inside, beside, 0.18);
        check('beside the latch', beside, beside.clone().setX(beside.x + 0.001), 0.22);
        check('to the door mark', beside, mark.pos, 0.18);
        // (as far as it goes: pushed open ahead of someone coming in, up to their spot beside the latch)
        for (let a = 0.15; a < 1.06; a += 0.15) check(`swing ${a.toFixed(2)}`, door.around(0.15, a), door.around(1.05, a), 0.04);
      }
    }
    expect(blocked).toEqual([]);
  });

  test('nothing but the door itself fills a doorway: an open door shows the way through, not a sign left hanging', () => {
    const left: string[] = [];
    for (const id of hinged) {
      const set = stage.sets[id];
      set.group.updateWorldMatrix(true, true);
      for (const door of Object.values(set.doors!)) {
        // In front of what's seen through it, and behind the face of the frame.
        const opening = new THREE.Box3(new THREE.Vector3(-0.5, 0.05, door.beyond.position.z + 0.002), new THREE.Vector3(0.5, 2.2, 0.1));
        const into = door.matrixWorld.clone().invert();
        set.group.traverse(o => {
          if (!(o instanceof THREE.Mesh)) return;
          for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === door) return;
          o.geometry.computeBoundingBox();
          const box = o.geometry.boundingBox!.clone().applyMatrix4(into.clone().multiply(o.matrixWorld));
          if (box.intersectsBox(opening)) left.push(`${id}: ${o.geometry.type} at ${box.getCenter(new THREE.Vector3()).toArray().map(n => n.toFixed(2))} ${box.min.toArray().map(n => n.toFixed(2))}..${box.max.toArray().map(n => n.toFixed(2))}`);
        });
      }
    }
    expect(left).toEqual([]);
  });

  for (const id of hinged) test(`${id}: out by pulling the door open and to, in by pushing it open and swinging it shut`, async () => {
    stage.setLocation(id, 'night');
    const door = Object.values(stage.current.doors!)[0];
    stage.place('ted', 'center');
    let opened = 0, held = Infinity;
    const watch = (a: Actor) => () => {
      opened = Math.max(opened, door.angle);
      if (a.root.visible) held = Math.min(held, palmToHandle(a, door));
    };
    let gone = false;
    void stage.exit('ted').then(() => { gone = true; });
    await play(12, watch(stage.actors.ted));
    expect(gone).toBe(true);
    expect(stage.onStage('ted')).toBe(false);
    expect(opened).toBeGreaterThan(0.6);
    expect(held).toBeLessThan(0.1);
    expect(door.angle).toBeLessThan(0.01);

    opened = 0; held = Infinity;
    let arrived = false;
    void stage.enter('robin', 'center').then(() => { arrived = true; });
    await play(12, watch(stage.actors.robin));
    expect(arrived).toBe(true);
    expect(stage.markOf('robin')).not.toBe(Object.keys(stage.current.doors!)[0]);
    expect(opened).toBeGreaterThan(0.6);
    expect(held).toBeLessThan(0.1);
    expect(door.angle).toBeLessThan(0.01);
  });

  test('two people leaving together take turns at the door', async () => {
    stage.setLocation('apartment', 'night');
    stage.place('ted', 'center');
    stage.place('marshall', 'red_chair');
    let left = 0;
    for (const id of ['ted', 'marshall'] as const) void stage.exit(id).then(() => left++);
    await play(20);
    expect(left).toBe(2);
    expect(stage.onStageIds()).toEqual([]);
    expect(stage.current.doors!.door.angle).toBeLessThan(0.01);
  });

  test('told to do something else halfway through, they let go and the door swings shut by itself', async () => {
    stage.setLocation('maclarens', 'night');
    stage.place('ted', 'bar_standing');
    void stage.exit('ted');
    const door = stage.current.doors!.door;
    for (let t = 0; t < 12 && door.angle < 0.3; t += 0.1) await play(0.1);
    expect(door.angle).toBeGreaterThan(0.3);
    let back = false;
    void stage.moveTo('ted', 'bar_standing').then(() => { back = true; });
    await play(8);
    expect(back).toBe(true);
    expect(stage.onStage('ted')).toBe(true);
    expect(door.angle).toBeLessThan(0.01);
  });

  test('a scene picked up after they came in has them there already, the door shut', () => {
    stage.setLocation('apartment', 'night');
    void stage.enter('lily', 'center', true);
    stage.actors.lily.arrive();
    expect(stage.markOf('lily')).toBe('center');
    expect(stage.current.doors!.door.angle).toBe(0);
  });
});

describe('a lift\'s sliding doors', () => {
  /** Watch someone through the doors: how far open they are at the least while that person is in the doorway (their
   *  middle within a body's width of the wall), and how often the doors chime open and close. */
  function watch(id: 'ted' | 'robin' | 'lily') {
    const doors = stage.current.doors!.door as SlidingDoor;
    const wall = doors.getWorldPosition(new THREE.Vector3()).z;
    const seen = { passing: Infinity, opened: 0, shut: 0 };
    stage.onDoorOpen = () => { seen.opened++; };
    stage.onDoorShut = () => { seen.shut++; };
    const each = () => {
      const a = stage.actors[id];
      if (a.root.visible && Math.abs(a.position.z - wall) < 0.3) seen.passing = Math.min(seen.passing, doors.open);
    };
    return { doors, seen, each };
  }

  test('the elevator has a pair of them on its way in, shut to begin with', () => {
    stage.setLocation('elevator', 'night');
    expect(stage.current.doors!.door).toBeInstanceOf(SlidingDoor);
    expect(stage.liftDoors).toBe(true);
    expect((stage.current.doors!.door as SlidingDoor).open).toBe(0);
  });

  test('in: they slide open as the chime goes, the newcomer steps through, and they slide shut behind', async () => {
    stage.setLocation('elevator', 'night');
    stage.place('ted', 'left');
    const { doors, seen, each } = watch('robin');
    let arrived = false;
    void stage.enter('robin', 'buttons').then(() => { arrived = true; });
    expect(seen.opened).toBe(1);
    await play(8, each);
    expect(arrived).toBe(true);
    expect(stage.markOf('robin')).toBe('buttons');
    expect(seen.passing).toBeLessThan(Infinity);
    expect(seen.passing).toBeGreaterThan(0.95);
    expect(doors.open).toBeLessThan(0.01);
    expect(seen).toMatchObject({ opened: 1, shut: 1 });
  });

  test('out: they slide open, the leaver steps out onto the landing, and they slide shut before they\'re gone', async () => {
    stage.setLocation('elevator', 'night');
    stage.place('ted', 'center');
    stage.place('robin', 'right');
    const { doors, seen, each } = watch('ted');
    let gone = false, shutFirst = false;
    void stage.exit('ted').then(() => { gone = true; shutFirst = doors.open < 0.01; });
    await play(10, each);
    expect(gone).toBe(true);
    expect(stage.onStage('ted')).toBe(false);
    expect(seen.passing).toBeLessThan(Infinity);
    expect(seen.passing).toBeGreaterThan(0.95);
    expect(shutFirst).toBe(true);
    expect(seen).toMatchObject({ opened: 1, shut: 1 });
  });

  test('two coming in together come through one opening of the doors', async () => {
    stage.setLocation('elevator', 'day');
    const { doors, seen } = watch('robin');
    let arrived = 0;
    for (const [id, mark] of [['robin', 'left'], ['lily', 'right']] as const) void stage.enter(id, mark).then(() => arrived++);
    await play(10);
    expect(arrived).toBe(2);
    expect(stage.markOf('robin')).toBe('left');
    expect(stage.markOf('lily')).toBe('right');
    expect(doors.open).toBeLessThan(0.01);
    expect(seen).toMatchObject({ opened: 1, shut: 1 });
  });
});
