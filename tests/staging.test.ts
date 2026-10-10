import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { testStage } from './helpers/sets';
import { walkingBlockers } from './helpers/geometry';
import { routeNodes } from '../src/show/navigation';
import { Director, MAX_CLUTTER, MIN_SHOT, nearFraming } from '../src/show/director';
import type { Actor } from '../src/world/actor';
import { isCharacterId, isKid, type CharacterId } from '../src/script/types';
import { SCRIPTS } from './helpers/episodes';
import type { Beat, Costume, Scene } from '../src/script/types';

const stage = testStage();
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 60);
const director = new Director(camera, stage);

function expectVisible(actor: Actor, label: string) {
  camera.updateMatrixWorld();
  for (const dy of [0, -0.25]) {
    const point = actor.headWorld.add(new THREE.Vector3(0, dy, 0));
    const projected = point.clone().project(camera);
    expect(Math.abs(projected.x), label).toBeLessThan(0.9);
    expect(Math.abs(projected.y), label).toBeLessThan(0.9);
    expect(projected.z, label).toBeGreaterThan(-1);
    expect(projected.z, label).toBeLessThan(1);
    const ray = new THREE.Raycaster(camera.position.clone(), point.clone().sub(camera.position).normalize(), 0, camera.position.distanceTo(point) - 0.12);
    const others = [...Object.values(stage.actors), ...stage.extras.filter(e => e.set === stage.current.id).map(e => e.actor)]
      .filter(a => a !== actor && a.root.visible).flatMap(a => {
        a.root.updateWorldMatrix(true, true);
        return a.bodyMeshes;
      });
    expect(ray.intersectObjects([...stage.occluders(), ...others], false).length, label).toBe(0);
    ray.set(point, camera.position.clone().sub(point).normalize());
    expect(ray.intersectObjects(stage.occluders(), false).filter(hit => hit.distance >= 0.12 && !hit.object.userData.cameraBackdrop).length, label).toBe(0);
  }
}

function expectBackdrop(label: string) {
  if (director.current!.kind === 'wide') return;
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const x of [-0.85, 0, 0.85]) for (const y of [-0.1, 0.25, 0.7]) {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    expect(ray.intersectObjects(stage.occluders(), false).length, `${label}/backdrop/${x}/${y}`).toBeGreaterThan(0);
  }
}

function finishMove(id: 'ted', maxSeconds = 60) {
  const a = stage.actors[id];
  for (let tick = 0; tick < maxSeconds * 30 && a.isWalking; tick++) stage.update(1 / 30, tick / 30);
  expect(a.isWalking).toBe(false);
}

describe('current set navigation', () => {
  for (const set of Object.values(stage.sets)) {
    test(`${set.id}: every mark is reachable from its entrance`, () => {
      for (const [name, mark] of Object.entries(set.marks)) {
        expect(set.nodes[mark.node], name).toBeDefined();
        const entrance = set.entrances?.[mark.node] ?? set.door;
        expect(routeNodes(set, set.marks[entrance].node, mark.node), name).not.toBeNull();
        for (const value of [...mark.pos.toArray(), mark.facing, ...set.nodes[mark.node].toArray()]) expect(Number.isFinite(value)).toBe(true);
      }
      for (const [a, b] of set.edges) {
        expect(set.nodes[a]).toBeDefined();
        expect(set.nodes[b]).toBeDefined();
      }
    });
    if (!set.seated) test(`${set.id}: walking aisles and approaches clear the actual furniture`, () => {
      for (const [a, b] of set.edges) expect(walkingBlockers(set, set.nodes[a], set.nodes[b]), `${a} → ${b}`).toEqual([]);
      for (const [name, mark] of Object.entries(set.marks)) {
        // The final step into a seat is deliberately allowed to overlap its cushion.
        expect(walkingBlockers(set, set.nodes[mark.node], mark.approach ?? mark.pos), name).toEqual([]);
      }
    });
  }

  test('short moves still go around the coffee table and get up along the seat approach', () => {
    stage.setLocation('apartment', 'day');
    stage.place('ted', 'couch_center');
    void stage.moveTo('ted', 'center');
    const path = stage.actors.ted.remainingPath;
    // Straight up off the cushion toward its approach, turning off once the way round the table is clear.
    const { pos, approach } = stage.current.marks.couch_center;
    const stepOut = new THREE.Line3(pos, approach!).closestPointToPoint(path[0], true, new THREE.Vector3());
    expect(path[0].distanceTo(stepOut)).toBeLessThan(0.001);
    expect(path[0].distanceTo(pos)).toBeGreaterThan(0.4);
    for (let i = 1; i < path.length; i++) expect(walkingBlockers(stage.current, path[i - 1], path[i])).toEqual([]);
    finishMove('ted');
    expect(stage.actors.ted.position.distanceTo(stage.current.marks.center.pos)).toBeLessThan(0.01);
  });

  test('an interrupted walk turns for the new mark instead of finishing the old one first', () => {
    stage.setLocation('apartment', 'day');
    stage.place('ted', 'kitchen');
    void stage.moveTo('ted', 'center');
    stage.update(0.05, 0);
    void stage.moveTo('ted', 'bedroom_ted');
    const path = [stage.actors.ted.position.clone(), ...stage.actors.ted.remainingPath];
    expect(path.some(p => p.distanceTo(stage.current.marks.center.pos) < 0.5)).toBe(false);
    for (let i = 1; i < path.length; i++) expect(walkingBlockers(stage.current, path[i - 1], path[i])).toEqual([]);
    finishMove('ted');
    expect(stage.actors.ted.position.y).toBeCloseTo(0.3, 2);
  });

  test('walks head straight for the mark wherever nothing stands in the way', () => {
    stage.setLocation('apartment', 'day');
    stage.place('ted', 'kitchen');
    void stage.moveTo('ted', 'center');
    // Out of the kitchen and straight across the room: no dog-leg down past the dining table.
    const path = stage.actors.ted.remainingPath;
    expect(path.length).toBeLessThanOrEqual(3);
    for (const p of path) expect(p.z).toBeLessThan(0.7);
  });

  test('nobody walks away from where they are going to touch a waypoint behind them', () => {
    let away = 0;
    for (const set of Object.values(stage.sets)) {
      if (set.seated) continue;
      for (const from of Object.keys(set.marks)) for (const to of Object.keys(set.marks)) {
        if (from === to) continue;
        stage.setLocation(set.id, 'day');
        stage.place('ted', from);
        void stage.moveTo('ted', to);
        const path = [stage.actors.ted.position.clone(), ...stage.actors.ted.remainingPath];
        const end = path.at(-1)!;
        // Getting up out of a seat and stepping onto the mark are authored; everything between should close in.
        for (let i = 2; i < path.length - 1; i++) away += Math.max(0, path[i].distanceTo(end) - path[i - 1].distanceTo(end));
      }
    }
    // Furniture still forces the odd detour around a chair; before straightening this was ~1375m.
    expect(away).toBeLessThan(250);
  }, 60_000);

  test('walking over to someone still on their way meets them where they stop, not on top of them', () => {
    stage.setLocation('maclarens_sidewalk', 'night');
    stage.place('ted', 'friend');
    stage.place('lily', 'pub');
    void stage.moveTo('lily', 'curb');
    for (let tick = 0; tick < 40; tick++) stage.update(1 / 30, tick / 30);
    expect(stage.actors.lily.isWalking).toBe(true);
    void stage.moveTo('ted', 'lily');
    finishMove('ted');
    for (let tick = 0; tick < 600 && stage.actors.lily.isWalking; tick++) stage.update(1 / 30, tick / 30);
    expect(stage.actors.ted.position.distanceTo(stage.actors.lily.position)).toBeGreaterThan(0.6);
  });

  test('unconnected nodes never fabricate a straight route through a partition', () => {
    expect(routeNodes(stage.sets.taxi, 'back', 'front')).toBeNull();
    expect(routeNodes(stage.sets.limo, 'bench_r', 'driver')).toBeNull();
  });

  test('front passengers and drivers enter and exit through their own compartment doors', async () => {
    for (const [location, mark] of [['taxi', 'front_passenger'], ['limo', 'driver']] as const) {
      stage.setLocation(location, 'night');
      const entering = stage.enter('ted', mark);
      const door = stage.current.marks[stage.current.entrances![stage.current.marks[mark].node]];
      expect(stage.actors.ted.position.distanceTo(door.pos)).toBeLessThan(0.01);
      finishMove('ted'); await entering;
      expect(stage.markOf('ted')).toBe(mark);
      const exiting = stage.exit('ted');
      finishMove('ted'); await exiting;
      expect(stage.onStage('ted')).toBe(false);
    }
  });

  test('moving between vehicle compartments exits and reenters without crossing the divider', async () => {
    stage.setLocation('taxi', 'night'); stage.place('ted', 'back_right');
    const moved = stage.moveTo('ted', 'front_passenger');
    expect(stage.actors.ted.remainingPath.every(p => p.z < 0)).toBe(true);
    finishMove('ted'); await Promise.resolve(); await Promise.resolve();
    expect(stage.actors.ted.remainingPath.every(p => p.z > 0)).toBe(true);
    finishMove('ted'); await moved;
    expect(stage.markOf('ted')).toBe('front_passenger');
  });

  test('background occupants yield before the first camera cut', () => {
    stage.setLocation('restaurant', 'day');
    const diner = stage.extras.find(e => e.set === 'restaurant' && e.mark === 'table_2_left')!;
    expect(diner.actor.root.visible).toBe(true);
    stage.place('ted', 'table_2_left');
    expect(diner.actor.root.visible).toBe(false);
  });
});

/** Run the stage until nobody's walking (or stepping back), and how close any two people came while someone was. */
async function closestPass(maxSeconds = 20) {
  let closest = Infinity;
  const inner = stage as unknown as { crowd: { aside: Map<unknown, unknown> }; doorWork: Map<unknown, unknown> };
  // (going through a door counts, standing to pull it open included)
  const busy = () => stage.onStageIds().some(id => stage.actors[id].isWalking) || inner.crowd.aside.size > 0 || inner.doorWork.size > 0;
  for (let tick = 0; tick < maxSeconds * 30; tick++) {
    stage.update(1 / 30, tick / 30);
    // Let exits finish (and hide whoever left) as they would between frames.
    for (let k = 0; k < 6; k++) await null;
    const ids = stage.onStageIds();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = stage.actors[ids[i]], b = stage.actors[ids[j]];
      if (a.isWalking || b.isWalking) closest = Math.min(closest, Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z));
    }
    if (!busy()) break;
  }
  expect(busy()).toBe(false);
  return closest;
}

const flatTo = (id: CharacterId, p: THREE.Vector3) => Math.hypot(stage.actors[id].position.x - p.x, stage.actors[id].position.z - p.z);

describe('nobody walks through anybody', () => {
  test('two people crossing the room pass each other instead of walking through', async () => {
    stage.setLocation('apartment', 'day');
    stage.place('ted', 'kitchen_passthrough');
    stage.place('marshall', 'fireplace');
    void stage.moveTo('ted', 'fireplace');
    void stage.moveTo('marshall', 'kitchen_passthrough');
    expect(await closestPass()).toBeGreaterThan(0.45);
  });

  test('walking over to someone in a queue stops on the near side of them', async () => {
    stage.setLocation('store', 'day');
    stage.place('ted', 'queue');
    stage.place('marshall', 'checkout');
    void stage.moveTo('marshall', 'ted');
    expect(await closestPass()).toBeGreaterThan(0.45);
    expect(flatTo('marshall', stage.current.marks.checkout.pos)).toBeLessThan(flatTo('ted', stage.current.marks.checkout.pos) + 0.5);
  });

  test('someone standing in the only way through steps aside, and back again after', async () => {
    stage.setLocation('apartment', 'day');
    stage.place('barney', 'kitchen_doorway');
    stage.place('ted', 'center');
    const home = stage.actors.barney.position.clone();
    void stage.moveTo('ted', 'kitchen_stove');
    let stepped = 0;
    for (let tick = 0; tick < 30; tick++) {
      stage.update(1 / 30, tick / 30);
      stepped = Math.max(stepped, flatTo('barney', home));
    }
    expect(stepped).toBeGreaterThan(0.2);
    expect(await closestPass()).toBeGreaterThan(0.45);
    expect(flatTo('ted', stage.current.marks.kitchen_stove.pos)).toBeLessThan(0.01);
    expect(flatTo('barney', home)).toBeLessThan(0.01);
  });

  test('sliding out of a booth, whoever sits nearer the end gets up to let them out and sits back down', async () => {
    stage.setLocation('restaurant', 'day');
    stage.place('ted', 'booth_left');
    stage.place('lily', 'booth_middle');
    void stage.moveTo('lily', 'host');
    expect(await closestPass()).toBeGreaterThan(0.4);
    const seat = stage.current.marks.booth_left;
    expect(flatTo('ted', seat.pos)).toBeLessThan(0.01);
    expect(stage.actors.ted.isSitting).toBe(true);
  });

  test('every scene plays without anyone walking through anyone', async () => {
    const bumps: string[] = [];
    for (const ep of SCRIPTS) for (const [i, scene] of ep.scenes.entries()) {
      if (scene.resume) continue;
      stage.setLocation(scene.location, scene.time);
      if (stage.current.seated) continue;
      for (const c of scene.cast) if (isCharacterId(c.character) && !isKid(c.character)) stage.place(c.character, c.mark);
      // The staging beats in order, each given the time to play out the player gives it.
      for (const b of scene.beats) {
        if (!('character' in b) || !isCharacterId(b.character) || isKid(b.character)) continue;
        const who = b.character;
        if (b.type === 'enter') void (stage.onStage(who) ? b.to && stage.moveTo(who, b.to) : stage.enter(who, b.to));
        else if (!stage.onStage(who)) continue;
        else if (b.type === 'move') void stage.moveTo(who, b.to === who ? 'center' : b.to);
        else if (b.type === 'exit') void stage.exit(who);
        else if (b.type === 'act' && (b.gesture === 'sit' || b.gesture === 'stand')) void (b.gesture === 'sit' ? stage.sitDown(who) : stage.standUp(who));
        else continue;
        const closest = await closestPass();
        if (closest < 0.4) bumps.push(`${ep.code} scene ${i + 1} (${scene.location}): ${b.type} ${who}, ${closest.toFixed(2)}m`);
      }
    }
    expect(bumps).toEqual([]);
  }, 120_000);
});

/** Every set a scene's beats cut away to: cutaways (and the ones inside them), montage shots, split-screen panels. */
const elsewhere = (beats: Beat[]): (Pick<Scene, 'location' | 'time' | 'cast' | 'wardrobe'> & { kind: string })[] => beats.flatMap((b) => {
  if (b.type === 'cutaway') return [{ ...b, kind: `${b.style} cutaway` }, ...elsewhere(b.beats)];
  if (b.type === 'montage') return b.shots.map((s, k) => ({ ...s, kind: `montage shot ${k + 1}` }));
  if (b.type === 'split') return b.panels.map((p, k) => ({ ...p, kind: `split panel ${k + 1}` }));
  return [];
});

// Every scene, cutaway, montage shot and split panel, in the clothes it's played in. (A resumed scene starts from
// wherever its strand left everyone, so it has no cast of its own to frame.)
const rerunScenes = SCRIPTS.flatMap((ep) => ep.scenes.flatMap((scene, i) => {
  const wardrobe: Costume[] = [...(ep.wardrobe ?? []), ...(scene.wardrobe ?? [])];
  return [
    ...(scene.resume ? [] : [{ ...scene, guests: ep.guests, wardrobe, label: `${ep.code} ${ep.title} ${i + 1}: ${scene.location}` }]),
    ...elsewhere(scene.beats).map((c) => ({ ...c, guests: ep.guests, wardrobe: [...wardrobe, ...(c.wardrobe ?? [])], label: `${ep.code} ${ep.title} ${i + 1}: ${c.kind} at ${c.location}` })),
  ];
}));

describe('camera coverage on the current sets', () => {
  for (const scene of rerunScenes) test(`${scene.label} covers the cast and both sides of each conversation`, () => {
    stage.castGuests(scene.guests);
    stage.setWardrobe(scene.wardrobe);
    stage.setLocation(scene.location, scene.time);
    for (const c of scene.cast) {
      expect(stage.current.marks[c.mark], `${c.character}/${c.mark}`).toBeDefined();
      stage.place(c.character, c.mark);
      expect(stage.markOf(c.character)).toBe(c.mark);
    }
    director.coverage(stage.castIds());
    // Shooting from inside a car, the driver behind the partition gets his own angles, not the passengers' master.
    const inMaster = scene.cast.filter(c => !(stage.current.cameraBounds && stage.current.reserved?.includes(c.mark)));
    for (const c of inMaster) expectVisible(stage.actors[c.character], `${scene.location}/${c.character}/wide`);
    for (const a of scene.cast) {
      director.closeup(a.character);
      expectVisible(stage.actors[a.character], `${a.character}/closeup`);
      expectBackdrop(`${a.character}/closeup`);
      for (const b of scene.cast) if (a !== b) {
        for (const shot of ['twoShot', 'overShoulder'] as const) {
          director[shot](a.character, b.character);
          expectVisible(stage.actors[a.character], `${a.character}/${b.character}/${shot}`);
          expectBackdrop(`${a.character}/${b.character}/${shot}`);
          if (director.current!.kind === 'two') expectVisible(stage.actors[b.character], `${b.character}/two`);
        }
      }
    }
  });

  for (const set of Object.values(stage.sets)) test(`${set.id}: every mark has unobstructed, in-frame dialogue coverage`, () => {
    const cast: CharacterId[] = set.id === 'future' ? ['penny', 'luke'] : ['ted', 'marshall', 'patrice'];
    for (const id of cast) {
      stage.setLocation(set.id, 'day');
      for (const name of Object.keys(set.marks)) {
        stage.place(id, name);
        director.closeup(id);
        expectVisible(stage.actors[id], `${set.id}/${name}/${id}`);
      }
    }
  });

  for (const set of Object.values(stage.sets)) {
    test(`${set.id}: two-shots and shoulder shots keep the speaker visible across every pair of marks`, () => {
      const marks = Object.keys(set.marks).filter(m => !m.includes('door'));
      for (const [i, first] of marks.entries()) for (const second of marks.slice(i + 1)) {
        stage.setLocation(set.id, 'day');
        stage.place('ted', first); stage.place('robin', second);
        for (const shot of ['twoShot', 'overShoulder'] as const) {
          director[shot]('ted', 'robin');
          expectVisible(stage.actors.ted, `${set.id}/${first}/${second}/${shot}`);
        }
      }
    });
  }

  test('added venues cover both directions of every conversation, with dressed reverse backgrounds', () => {
    for (const location of ['maclarens_sidewalk', 'hoser_hut', 'courtroom', 'atlantic_city_casino', 'lusty_leopard'] as const) {
      const names = Object.keys(stage.sets[location].marks).filter(m => m !== 'door');
      for (const first of names) for (const second of names) if (first !== second) {
        stage.setLocation(location, 'night');
        stage.place('marshall', first); stage.place('lily', second);
        for (const shot of ['twoShot', 'overShoulder'] as const) {
          director[shot]('marshall', 'lily');
          expectVisible(stage.actors.marshall, `${location}/${first}/${second}/${shot}`);
          expectBackdrop(`${location}/${first}/${second}/${shot}`);
          if (director.current!.kind === 'two') expectVisible(stage.actors.lily, `${location}/${second}/two`);
        }
      }
    }
  });

  test('car angles never leave the car: every wide and generated shot is shot from inside', () => {
    for (const set of Object.values(stage.sets).filter(s => s.cameraBounds)) {
      for (const [i, w] of set.wides.entries()) expect(set.cameraBounds!.containsPoint(w.pos), `${set.id}/wide ${i}`).toBe(true);
      const marks = Object.keys(set.marks);
      for (const first of marks) for (const second of marks) if (first !== second) {
        stage.setLocation(set.id, 'night');
        stage.place('ted', first); stage.place('robin', second);
        for (const shot of [() => director.closeup('ted'), () => director.closeup('ted', 'robin'), () => director.twoShot('ted', 'robin'),
          () => director.overShoulder('ted', 'robin'), () => director.coverage(['ted', 'robin'])]) {
          shot();
          expect(set.cameraBounds!.containsPoint(director.current!.pos), `${set.id}/${first}/${second}/${director.current!.kind}`).toBe(true);
        }
      }
    }
  });

  test('new master wides cover every mark, including short actors behind reception', () => {
    for (const location of ['subway', 'laser_tag', 'wesleyan_dorm', 'hospital', 'elevator', 'canadian_mall', 'maclarens_sidewalk', 'hoser_hut', 'courtroom', 'atlantic_city_casino', 'lusty_leopard'] as const) {
      for (const id of ['marshall', 'patrice'] as const) for (const name of Object.keys(stage.sets[location].marks)) {
        stage.setLocation(location, 'day');
        stage.place(id, name);
        director.wide(0, 0);
        expectVisible(stage.actors[id], `${location}/${name}/${id}/master`);
      }
    }
  });

  test('subway and elevator group coverage keeps people large enough in the picture', () => {
    for (const [location, minimumHeight] of [['subway', 0.25], ['elevator', 0.30]] as const) {
      const scene = SCRIPTS.flatMap(ep => ep.scenes).find(s => s.location === location)!;
      stage.setLocation(location, 'day');
      for (const c of scene.cast) stage.place(c.character, c.mark);
      director.coverage(stage.castIds());
      expect(director.current!.kind).toBe('wide');
      camera.updateMatrixWorld();
      for (const id of stage.castIds()) {
        const actor = stage.actors[id];
        const head = actor.headWorld.add(new THREE.Vector3(0, 0.1, 0)).project(camera);
        const floor = actor.position.clone().project(camera);
        expect((head.y - floor.y) / 2, `${location}/${id}/picture height`).toBeGreaterThan(minimumHeight);
        expectVisible(actor, `${location}/${id}/closer coverage`);
      }
    }
  });

  test('opposite subway benches get close-ups instead of a distant generated two-shot', () => {
    stage.setLocation('subway', 'day');
    stage.place('ted', 'seat_left'); stage.place('robin', 'seat_right_window');
    for (const [speaker, listener] of [['ted', 'robin'], ['robin', 'ted']] as const) {
      director.twoShot(speaker, listener);
      expect(director.current!.kind).toBe('closeup');
      expectVisible(stage.actors[speaker], `${speaker}/opposite benches`);
    }
    // With both people on one bench, the authored close pair stays preferred.
    stage.place('robin', 'seat_left_inner');
    director.coverage(['ted', 'robin']);
    expect(director.current!.pos.distanceTo(stage.sets.subway.wides[3].pos)).toBeLessThan(0.01);
  });

  test('a reverse-facing apartment chair gets a face angle backed by scenery', () => {
    stage.setLocation('apartment', 'day'); stage.place('robin', 'woven_chair');
    director.closeup('robin');
    const actor = stage.actors.robin;
    const forward = new THREE.Vector3(Math.sin(actor.facing), 0, Math.cos(actor.facing));
    expect(camera.position.clone().sub(actor.headWorld).normalize().dot(forward)).toBeGreaterThan(0.1);
    const ray = new THREE.Raycaster();
    camera.updateMatrixWorld(); ray.setFromCamera(new THREE.Vector2(0.65, 0.7), camera);
    expect(ray.intersectObjects(stage.occluders(), false).length).toBeGreaterThan(0);
    expectVisible(actor, 'woven chair reverse');
  });

  test('group wides cover both the professor and students, the whole limo bench and a full car', () => {
    for (const [location, cast] of [
      ['lecture_hall', [['ted', 'lectern'], ['robin', 'student_1_4'], ['barney', 'student_2_3'], ['marshall', 'student_3_5']]],
      ['limo', [['ted', 'rear_seat_left'], ['robin', 'rear_seat_right'], ['marshall', 'bench_1'], ['lily', 'bench_2'], ['barney', 'bench_3']]],
      ['car', [['marshall', 'driver'], ['ted', 'front_passenger'], ['robin', 'back_left'], ['lily', 'back_middle'], ['barney', 'back_right']]],
    ] as const) {
      stage.setLocation(location, 'day');
      for (const [id, mark] of cast) stage.place(id, mark);
      director.coverage(stage.castIds());
      expect(director.current!.kind).toBe('wide');
      for (const [id] of cast) expectVisible(stage.actors[id], `${location}/${id}/group wide`);
    }
  });

  test('students get reverse coverage facing the chalkboard', () => {
    stage.setLocation('lecture_hall', 'day'); stage.place('ted', 'student_3_6');
    director.closeup('ted');
    expect(director.current!.pos.z).toBeLessThan(stage.actors.ted.position.z);
    expectVisible(stage.actors.ted, 'student reverse');
  });

  test('Marshall in the front booth seat leaves Lily visible in both outfits', () => {
    // Fixed idle phases reproduce the shoulder overlap in the lower booth camera.
    const cast = [
      ['ted', 'booth_end', 47.06249302253127],
      ['marshall', 'booth_right_front', 7.203507027588785],
      ['lily', 'booth_right_back', 16.783609078265727],
      ['robin', 'booth_left_front', 92.65821692533791],
      ['barney', 'booth_left_back', 42.84091582521796],
    ] as const;
    stage.setWardrobe([]);
    for (const outfit of ['casual', 'work'] as const) {
      stage.setLocation('maclarens', 'night');
      stage.dress('marshall', outfit);
      const restore: (() => void)[] = [];
      try {
        for (const [id, mark, seed] of cast) {
          const actor = stage.actors[id] as unknown as { seed: number };
          const previous = actor.seed;
          restore.push(() => { actor.seed = previous; });
          actor.seed = seed;
          stage.place(id, mark);
        }
        director.coverage(stage.castIds());
        expect(director.current!.kind).toBe('wide');
        for (const [id] of cast) expectVisible(stage.actors[id], `${outfit}/${id}/booth`);
      } finally {
        restore.forEach(reset => reset());
      }
    }
  });

  test('Carl cast behind the bar shares a master wide with a full booth', () => {
    // The right bench's inner seat hides behind its front seat from the master, so the booth wides can't reach the bar.
    const booth = [['marshall', 'booth_right_front'], ['lily', 'booth_right_back'], ['ted', 'booth_end'], ['robin', 'booth_left_front'], ['barney', 'booth_left_back']] as const;
    stage.setWardrobe([]);
    for (let size = 2; size <= booth.length; size++) for (const time of ['day', 'night'] as const) {
      stage.setLocation('maclarens', time);
      stage.place('carl', 'behind_bar');
      for (const [id, mark] of booth.slice(0, size)) stage.place(id, mark);
      director.coverage(stage.castIds());
      expect(director.current!.kind).toBe('wide');
      for (const id of stage.castIds()) expectVisible(stage.actors[id], `${time}/${size}/${id}/booth and bar`);
    }
  });

  test('a push-in creeps toward its subject for longer than a closeup, without losing them', () => {
    stage.setWardrobe([]);
    stage.setLocation('metro_news_one', 'day'); stage.place('ted', 'center'); stage.place('robin', 'anchor_left');
    director.pushIn('ted', 'robin');
    const from = camera.position.distanceTo(stage.actors.ted.headWorld);
    for (let i = 0; i < 120; i++) {
      director.update(0.05);
      if (i % 20 === 19) expectVisible(stage.actors.ted, `push-in ${i}`);
    }
    expect(from - camera.position.distanceTo(stage.actors.ted.headWorld)).toBeGreaterThan(0.6);
  });

  test('asking for the angle already on screen holds it instead of re-cutting to a copy', () => {
    stage.setWardrobe([]);
    stage.setLocation('metro_news_one', 'day'); stage.place('ted', 'center'); stage.place('robin', 'anchor_left');
    director.wide(0);
    director.pushIn('ted', 'robin');
    const shot = director.current;
    for (let i = 0; i < 20; i++) director.update(0.05);
    const pushed = camera.position.clone();
    director.pushIn('ted', 'robin');
    expect(director.current).toBe(shot);
    expect(camera.position.distanceTo(pushed)).toBeLessThan(0.001);
    director.update(0.05);
    expect(camera.position.distanceTo(stage.actors.ted.headWorld)).toBeLessThan(pushed.distanceTo(stage.actors.ted.headWorld));

    director.wide(0);
    const wide = director.current;
    director.wide(0);
    expect(director.current).toBe(wide);
    director.closeup('ted', 'robin');
    expect(director.current).not.toBe(wide);
  });

  test('long held shots stop pushing before they enter the set', () => {
    stage.setLocation('apartment', 'day'); stage.place('ted', 'couch_left');
    director.closeup('ted');
    for (let i = 0; i < 100; i++) director.update(0.05);
    const settled = director.current!.pos.clone();
    for (let i = 0; i < 100; i++) director.update(0.5);
    expect(director.current!.pos.distanceTo(settled)).toBeLessThan(0.001);
    expectVisible(stage.actors.ted, 'held closeup');
  });

  test('once someone is out the door, no shot stays on them: the one left behind gets their single', async () => {
    director.minShot = MIN_SHOT;
    try {
      for (const [set, mark, toDoor] of [['apartment', 'dining_chair_1', false], ['apartment', 'dining_chair_1', true], ['barneys_office', 'desk_chair', false]] as const) {
        stage.setWardrobe([]);
        stage.setLocation(set, 'night');
        stage.place('lily', mark); stage.place('mickey', 'center');
        director.fresh();
        if (toDoor) {
          // walked to the door first, followed in a single, then out
          const walk = stage.moveTo('mickey', stage.current.door);
          director.closeup('mickey', 'lily');
          for (let tick = 0; tick < 300 && stage.actors.mickey.isWalking; tick++) {
            stage.update(1 / 30, tick / 30); director.update(1 / 30); await Promise.resolve();
          }
          await walk;
        } else director.closeup('mickey', 'lily');
        const out = stage.exit('mickey');
        director.wide(0);
        let gone = -1;
        for (let tick = 0; tick < 600 && (gone < 0 || tick - gone < 90); tick++) {
          // (as in the show: the walk's next step settles between frames, then a frame is staged, shot and drawn)
          for (let i = 0; i < 4; i++) await Promise.resolve();
          stage.update(1 / 30, tick / 30); director.update(1 / 30);
          const shot = director.current!;
          if (stage.onStage('mickey')) {
            // watched going from a wide, never chased to the door in a single
            expect(shot.subject === 'mickey' && shot.kind !== 'wide', `${set}: chased mickey out`).toBe(false);
            continue;
          }
          if (gone < 0) gone = tick;
          expect(shot.subjects ?? [], `${set}: framed on mickey after he left`).not.toContain('mickey');
          if (shot.kind !== 'wide') expect(shot.subject, `${set}: framed on mickey after he left`).not.toBe('mickey');
        }
        await out;
        expect(gone, `${set}: mickey never left`).toBeGreaterThan(0);
        expect(director.current!.kind, set).toBe('closeup');
        expect(director.current!.subject, set).toBe('lily');
        expectVisible(stage.actors.lily, `${set}: lily left behind`);
      }
    } finally {
      director.minShot = 0;
    }
  });

  test('a shot left on someone who has gone is replaced at once, and a group left behind stays in frame', () => {
    stage.setWardrobe([]);
    stage.setLocation('barneys_office', 'night');
    stage.place('lily', 'desk_chair'); stage.place('marshall', 'guest_chair_left'); stage.place('arthur', 'center');
    director.fresh();
    director.closeup('arthur');
    stage.leave('arthur');
    director.update(1 / 30);
    expect(director.current!.subjects ?? []).not.toContain('arthur');
    for (const id of ['lily', 'marshall'] as const) expectVisible(stage.actors[id], `${id} after arthur left`);
  });

  test('a single is never shot past a plant or a studio camera filling the foreground', () => {
    stage.setWardrobe([]);
    // a lens out in front of the camera operator, with the studio camera body between: the face is clear, the
    // picture isn't
    stage.setLocation('metro_news_one', 'night'); stage.place('lily', 'camera_operator');
    const lily = stage.actors.lily, head = lily.headWorld;
    const front = new THREE.Vector3(Math.sin(lily.facing), 0, Math.cos(lily.facing));
    const blocked = { pos: head.clone().addScaledVector(front, 2.35).add(new THREE.Vector3(0, 0.08, 0)), target: head.clone().add(new THREE.Vector3(0, -0.16, 0)), fov: 32 };
    expect(director.clutter(blocked, lily)).toBeGreaterThan(MAX_CLUTTER);
    // and every mark's single on every set (bar the cabins) keeps clear of the dressing
    for (const set of Object.values(stage.sets)) {
      if (set.cameraBounds) continue;
      stage.setLocation(set.id, 'night');
      const id = set.id === 'future' ? 'penny' : 'marshall';
      for (const mark of Object.keys(set.marks)) {
        stage.place(id, mark);
        director.closeup(id);
        if (director.current!.kind === 'closeup') expect(director.clutter(director.current!, stage.actors[id]), `${set.id}/${mark}`).toBeLessThanOrEqual(MAX_CLUTTER);
      }
    }
    // Marshall at Barney's office window, and Lily at the studio camera, still get their singles
    for (const [set, id, mark] of [['barneys_office', 'marshall', 'window'], ['metro_news_one', 'lily', 'camera_operator']] as const) {
      stage.setLocation(set, 'night'); stage.place(id, mark);
      director.closeup(id);
      expect(director.current!.kind, `${set}/${mark}`).toBe('closeup');
    }
  }, 30000);

  test('side by side at the bar: singles from in front, nobody across the middle, two-shots from across the bar', () => {
    stage.setWardrobe([]);
    const marks = ['bar_stool_1', 'bar_stool_2', 'bar_stool_3', 'bar_stool_4', 'bar_standing'];
    for (const a of marks) for (const b of marks) if (a !== b) {
      stage.setLocation('maclarens', 'night');
      stage.place('carl', 'behind_bar'); stage.place('lily', a); stage.place('robin', b);
      const lily = stage.actors.lily, label = `lily at ${a}, robin at ${b}`;
      const front = new THREE.Vector3(Math.sin(lily.facing), 0, Math.cos(lily.facing));
      for (const shoot of [() => director.closeup('lily', 'robin'), () => director.overShoulder('lily', 'robin')]) {
        shoot();
        const shot = director.current!;
        expectVisible(lily, label);
        if (shot.kind === 'wide') continue;
        camera.updateMatrixWorld();
        // seen from the front half of her, never past the back of her head
        expect(camera.position.clone().sub(lily.headWorld).setY(0).normalize().dot(front), label).toBeGreaterThan(-0.3);
        expect(director.clutter(shot, lily), label).toBeLessThanOrEqual(MAX_CLUTTER);
        // anyone between the lens and Lily stays out at the edge of frame (Robin's shoulder, for an over-the-shoulder)
        for (const o of [stage.actors.robin, stage.actors.carl]) {
          if (o.headWorld.distanceTo(camera.position) > lily.headWorld.distanceTo(camera.position)) continue;
          const v = o.headWorld.project(camera);
          if (v.z < 1 && Math.abs(v.y) < 1) expect(Math.abs(v.x), `${label}: ${o.def.id} in front`).toBeGreaterThan(0.5);
        }
      }
      director.twoShot('lily', 'robin');
      if (director.current!.kind === 'two') {
        // their faces, not their backs
        expect(camera.position.clone().sub(lily.headWorld).setY(0).normalize().dot(front), `${label}: two-shot`).toBeGreaterThan(-0.35);
        for (const o of [lily, stage.actors.robin]) expectVisible(o, `${label}: two-shot`);
      }
    }
    // the two on the middle stools get a two-shot from behind the bar, round the bartender
    stage.setLocation('maclarens', 'night');
    stage.place('carl', 'behind_bar'); stage.place('lily', 'bar_stool_2'); stage.place('robin', 'bar_stool_3');
    director.twoShot('robin', 'lily');
    expect(director.current!.kind).toBe('two');
  }, 30000);

  test('over the shoulder, the listener takes the edge of frame and the speaker the rest', () => {
    stage.setWardrobe([]);
    let shots = 0;
    for (const set of ['maclarens', 'apartment', 'barneys', 'restaurant'] as const) {
      // (the seats: where people sit and talk)
      const marks = Object.entries(stage.sets[set].marks).filter(([, m]) => m.seat !== null).map(([name]) => name);
      for (const a of marks) for (const b of marks) if (a !== b) {
        stage.setLocation(set, 'night');
        stage.place('ted', a); stage.place('barney', b);
        director.overShoulder('ted', 'barney');
        if (director.current!.kind !== 'ots') continue;
        shots++;
        camera.updateMatrixWorld();
        const listener = stage.actors.barney.headWorld, v = listener.clone().project(camera);
        const label = `${set}: ted at ${a}, barney at ${b}`;
        // the back of Barney's head sits out at the side, not across the middle of the picture
        expect(Math.abs(v.x), label).toBeGreaterThan(0.6);
        expect(camera.position.distanceTo(listener), label).toBeGreaterThan(1.4);
        expectVisible(stage.actors.ted, label);
      }
    }
    expect(shots).toBeGreaterThan(30);
    // across the MacLaren's booth table, both ways
    for (const [a, b] of [['booth_left_front', 'booth_right_front'], ['booth_right_back', 'booth_left_back']]) {
      stage.setLocation('maclarens', 'night');
      stage.place('ted', a); stage.place('barney', b);
      director.overShoulder('ted', 'barney');
      expect(director.current!.kind, `${a} over ${b}`).toBe('ots');
    }
  }, 30000);

  test('placement updates head height and facing before selecting the first shot', () => {
    stage.setLocation('apartment', 'day'); stage.place('ted', 'couch_left');
    const seatedHead = stage.actors.ted.headWorld.y;
    stage.place('ted', 'bedroom_ted');
    expect(stage.actors.ted.headWorld.y - seatedHead).toBeGreaterThan(0.5);
    expect(stage.actors.ted.root.rotation.y).toBe(stage.current.marks.bedroom_ted.facing);
    director.closeup('ted'); expectVisible(stage.actors.ted, 'landing first frame');
  });
});

/** How much of the picture's height someone takes up, from the top of their head to the floor under them. */
function pictureHeight(actor: Actor) {
  camera.updateMatrixWorld();
  const head = actor.headWorld.add(new THREE.Vector3(0, 0.1, 0)).project(camera);
  return (head.y - actor.position.clone().project(camera).y) / 2;
}

describe('group shots', () => {
  const clusters = [
    ['apartment', [['lily', 'couch_center'], ['marshall', 'couch_left'], ['ted', 'armchair'], ['robin', 'woven_chair'], ['barney', 'leather_chair']], 0.22],
    ['apartment', [['lily', 'couch_center'], ['marshall', 'couch_left'], ['ted', 'couch_right']], 0.6],
    ['apartment', [['lily', 'dining_chair_1'], ['marshall', 'dining_chair_2'], ['ted', 'dining_chair_3']], 0.6],
    ['maclarens', [['ted', 'booth_end'], ['marshall', 'booth_right_front'], ['lily', 'booth_right_back'], ['robin', 'booth_left_front'], ['barney', 'booth_left_back']], 0.36],
    ['barneys', [['barney', 'couch_center'], ['ted', 'couch_left'], ['marshall', 'armchair']], 0.45],
    ['restaurant', [['ted', 'booth_left'], ['robin', 'booth_middle'], ['barney', 'booth_right'], ['lily', 'booth_end_left'], ['marshall', 'booth_end_right']], 0.28],
    ['rooftop', [['ted', 'lawn_chair_left'], ['robin', 'lawn_chair_middle'], ['barney', 'lawn_chair_right']], 0.38],
  ] as const;

  test('a cluster talking gets a group shot holding all of them, clearly bigger than the master', () => {
    stage.setWardrobe([]);
    for (const [set, cast, minimum] of clusters) for (const time of ['day', 'night'] as const) {
      stage.setLocation(set, time);
      for (const [id, mark] of cast) stage.place(id, mark);
      director.fresh();
      director.wide(0);
      const master = Math.min(...cast.map(([id]) => pictureHeight(stage.actors[id])));
      director.coverage(stage.castIds());
      const shot = director.current!, label = `${set}/${time}/${cast.length}`;
      expect(shot.kind, label).toBe('wide');
      expect(shot.group, label).toBe(true);
      for (const [id] of cast) {
        expectVisible(stage.actors[id], `${label}/${id}`);
        expect(pictureHeight(stage.actors[id]), `${label}/${id}/picture height`).toBeGreaterThan(Math.max(minimum, 1.35 * master));
      }
      // the nearest of them is clear of set dressing in front
      const nearest = cast.map(([id]) => stage.actors[id]).sort((a, b) => a.headWorld.distanceTo(shot.pos) - b.headWorld.distanceTo(shot.pos))[0];
      expect(director.clutter(shot, nearest), `${label}/clutter`).toBeLessThanOrEqual(MAX_CLUTTER);
    }
  }, 30000);

  test('the master stays for the first shot of a scene, people on the move, and a group spread across the set', () => {
    stage.setWardrobe([]);
    const [, cast] = clusters[0];
    stage.setLocation('apartment', 'night');
    for (const [id, mark] of cast) stage.place(id, mark);
    director.fresh();
    director.coverage(stage.castIds(), true, true);
    expect(director.current!.group).toBeFalsy();
    expect(director.current!.pos.distanceTo(stage.current.wides[0].pos)).toBeLessThan(0.01);
    // the writer asking for a wide wants the room
    director.coverage(stage.castIds());
    director.intent('wide', 'ted');
    expect(director.current!.group).toBeFalsy();
    // somebody getting up and crossing the room
    void stage.moveTo('ted', 'kitchen');
    director.coverage(stage.castIds());
    expect(director.current!.group).toBeFalsy();
    finishMove('ted');
    // and now he's over in the kitchen, away from the rest
    director.coverage(stage.castIds());
    expect(director.current!.group).toBeFalsy();
    // someone at the door while the others are on the couch
    stage.setLocation('apartment', 'night');
    stage.place('ted', 'door'); stage.place('lily', 'couch_center'); stage.place('marshall', 'couch_left');
    director.coverage(stage.castIds());
    expect(director.current!.group).toBeFalsy();
  });

  test('nobody seen from behind in the middle of a group shot: else it is the master', () => {
    stage.setWardrobe([]);
    // game night with Mickey in the striped chair, his back to us right in front of the couch
    stage.setLocation('apartment', 'night');
    for (const [id, mark] of [...clusters[0][1], ['mickey', 'striped_chair']] as const) stage.place(id, mark);
    director.fresh();
    director.coverage(stage.castIds());
    expect(director.current!.group).toBeFalsy();
    // and in every scene, whoever has their back to a group shot is out at the side of it
    for (const scene of rerunScenes) {
      stage.castGuests(scene.guests);
      stage.setWardrobe(scene.wardrobe);
      stage.setLocation(scene.location, scene.time);
      for (const c of scene.cast) stage.place(c.character, c.mark);
      director.fresh();
      director.coverage(stage.castIds());
      const shot = director.current!;
      if (!shot.group) continue;
      camera.updateMatrixWorld();
      for (const id of stage.castIds()) {
        const a = stage.actors[id];
        const lens = shot.pos.clone().sub(a.headWorld).setY(0).normalize();
        if (lens.dot(new THREE.Vector3(Math.sin(a.facing), 0, Math.cos(a.facing))) > Math.cos(THREE.MathUtils.degToRad(90))) continue;
        expect(Math.abs(a.headWorld.project(camera).x), `${scene.label}: ${id}'s back`).toBeGreaterThan(0.5);
      }
    }
  }, 120000);

  test('someone turning their back on a group shot, in the middle of it, gets the shot replaced', () => {
    stage.setWardrobe([]);
    stage.setLocation('rooftop', 'night');
    // Ted up in front of the lawn chairs, holding forth
    for (const [id, mark] of [['ted', 'center'], ['robin', 'lawn_chair_left'], ['barney', 'lawn_chair_middle'], ['lily', 'lawn_chair_right']] as const) stage.place(id, mark);
    director.fresh();
    director.coverage(stage.castIds());
    expect(director.current!.group).toBe(true);
    const ted = stage.actors.ted;
    const middle = () => {
      camera.updateMatrixWorld();
      const lens = camera.position.clone().sub(ted.headWorld).setY(0).normalize();
      return lens.dot(new THREE.Vector3(Math.sin(ted.facing), 0, Math.cos(ted.facing))) < 0 && Math.abs(ted.headWorld.project(camera).x) < 0.5;
    };
    expect(middle()).toBe(false);
    // he turns round to talk to Barney, behind him
    ted.faceTowards(stage.actors.barney.headWorld, 0);
    ted.lookAt = stage.actors.barney.headWorld;
    for (let tick = 0; tick < 60; tick++) {
      stage.update(1 / 30, tick / 30);
      director.update(1 / 30);
    }
    expect(middle()).toBe(false);
    expectVisible(ted, 'ted turned round');
  });

  test('cabins keep their own mounts', () => {
    stage.setWardrobe([]);
    const lift = SCRIPTS.flatMap(ep => ep.scenes).find(s => s.location === 'elevator')!.cast.map(c => [c.character, c.mark] as const);
    for (const [location, cast] of [
      ['elevator', lift],
      ['car', [['marshall', 'driver'], ['ted', 'front_passenger'], ['robin', 'back_left'], ['lily', 'back_middle']]],
    ] as const) {
      stage.setLocation(location, 'day');
      for (const [id, mark] of cast) stage.place(id, mark);
      director.coverage(stage.castIds());
      expect(director.current!.group, location).toBeFalsy();
      expect(stage.current.wides.some(w => w.pos.distanceTo(director.current!.pos) < 0.01), location).toBe(true);
    }
  });

  test('a group shot asked for again is held, and the next wide is never a near copy of it', () => {
    let groups = 0;
    for (const scene of rerunScenes) {
      stage.castGuests(scene.guests);
      stage.setWardrobe(scene.wardrobe);
      stage.setLocation(scene.location, scene.time);
      for (const c of scene.cast) stage.place(c.character, c.mark);
      director.fresh();
      director.coverage(stage.castIds());
      const first = director.current!;
      if (!first.group) continue;
      groups++;
      // asked for again: the same shot stays up
      director.coverage(stage.castIds());
      expect(director.current, scene.label).toBe(first);
      // a reaction from all but one of them: the shot already up, or a clearly different one
      for (const out of stage.castIds()) {
        director.resume(first);
        director.coverage(stage.castIds().filter(id => id !== out), false);
        const next = director.current!;
        if (next !== first && next.kind === 'wide') expect(nearFraming(first, next), `${scene.label} without ${out}`).toBe(false);
      }
    }
    expect(groups).toBeGreaterThan(10);
  }, 120000);

  test('a replayed beat frames its group the same way', () => {
    stage.setWardrobe([]);
    const [, cast] = clusters[3];
    const shots = [0, 1].map(() => {
      stage.setLocation('maclarens', 'night');
      for (const [id, mark] of cast) stage.place(id, mark);
      director.fresh();
      director.reseed(42);
      for (let i = 0; i < 6; i++) director.onLine('ted', 'barney');
      director.coverage(stage.castIds());
      return { ...director.current! };
    });
    expect(shots[0].pos.distanceTo(shots[1].pos)).toBeLessThan(1e-6);
    expect(shots[0].target.distanceTo(shots[1].target)).toBeLessThan(1e-6);
    expect(shots[0].fov).toBe(shots[1].fov);
  });
});

describe('the 2030 couch', () => {
  // Future Ted is only ever a voice: the kids' couch shows Penny and Luke and nobody else.
  const adultsInView = () => [
    ...Object.entries(stage.actors).filter(([id, a]) => a.root.visible && !isKid(id)).map(([id]) => id),
    ...stage.extras.filter((e) => e.set === 'future' && e.actor.root.visible).map(() => 'extra'),
  ];
  const kidsVisible = () => stage.actors.penny.root.visible && stage.actors.luke.root.visible;

  test('cutting to the kids mid-scene hides the whole story cast, Ted included', () => {
    stage.setLocation('maclarens', 'night');
    for (const [id, mark] of [['ted', 'booth_end'], ['marshall', 'booth_left_front'], ['robin', 'booth_right_back'], ['guest1', 'booth_side']] as const) stage.place(id, mark);
    stage.cutToKids();
    expect(stage.current.id).toBe('future');
    expect(adultsInView()).toEqual([]);
    expect(kidsVisible()).toBe(true);
    stage.cutBack();
    expect(stage.actors.ted.root.visible).toBe(true);
  });

  test('a couch opening seats only the kids', () => {
    stage.setLocation('maclarens', 'night');
    stage.place('ted', 'booth_end');
    stage.setLocation('future', 'night');
    stage.seatKids();
    expect(adultsInView()).toEqual([]);
    expect(kidsVisible()).toBe(true);
  });

});
