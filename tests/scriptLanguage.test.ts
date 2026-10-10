import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as THREE from 'three';
import { testStage } from './helpers/sets';
import { EPISODES, SCRIPTS } from './helpers/episodes';
import { validateEpisode } from '../src/script/validate';
import { Director } from '../src/show/director';
import { Player } from '../src/show/player';
import { speech } from '../src/audio/speech';
import { audio } from '../src/audio/audio';
import { CHARACTERS, setGuests } from '../src/world/characters';
import { GESTURES, INSERT_KINDS, LEGACY_INSERT_KINDS, type Beat, type InsertBeat, type Scene, type ShowItem } from '../src/script/types';
import { overlayStub } from './helpers/overlay';

const spies: { mockRestore(): void }[] = [];
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  setGuests([]);
});

const sets = testStage().sets;
const booth = [
  { character: 'ted', mark: 'booth_end' }, { character: 'marshall', mark: 'booth_left_back' },
  { character: 'lily', mark: 'booth_left_front' }, { character: 'robin', mark: 'booth_right_back' },
];

/** A one-scene episode at MacLaren's around these beats, plus anything else at the top level. */
const episode = (beats: unknown[], extra: Record<string, unknown> = {}, scene: Record<string, unknown> = {}) => ({
  code: 'S99E01', title: 'Test', logline: 'A test.', coldOpen: 'Kids, a test.',
  scenes: [{ location: 'maclarens', time: 'night', cast: booth, beats, ...scene }], ...extra,
});
const errors = (beats: unknown[], extra?: Record<string, unknown>, scene?: Record<string, unknown>) =>
  validateEpisode(episode(beats, extra, scene), sets).errors.map((e) => `${e.path}: ${e.message}`);

describe('validating the new beats', () => {
  test('a scene using every new device is performable as written', () => {
    expect(errors([
      { type: 'say', character: 'ted', line: 'Guys.', chorus: ['marshall', 'lily'], react: [{ character: 'robin', gesture: 'spit_take' }], shot: 'push_in' },
      { type: 'hold', character: 'ted', prop: 'ring' },
      { type: 'give', character: 'ted', to: 'robin' },
      { type: 'give', character: 'robin', to: 'lily', prop: 'flowers' },
      { type: 'hold', character: 'lily', prop: 'none' },
      { type: 'act', character: 'marshall', gesture: 'fist_bump', to: 'ted', shot: 'two' },
      { type: 'freeze', character: 'marshall', gesture: 'slap', to: 'ted', line: 'Kids, this was slap four.', laugh: 'big' },
      { type: 'insert', kind: 'text', character: 'ted', title: 'barney', messages: [{ from: 'barney', text: 'Suit up.' }, { from: 'ted', text: 'No.' }] },
      { type: 'insert', kind: 'chart', chart: 'pie', title: 'Hot/Crazy', items: [{ label: 'Hot', value: 9 }], react: [{ character: 'lily', emotion: 'surprised' }] },
      { type: 'insert', kind: 'playbook', title: 'The Lorenzo Von Matterhorn', lines: ['Make a website.'], character: 'barney', line: 'Page twelve.' },
      {
        type: 'montage', label: 'A week of ring shopping', music: 'tender', shots: [
          { location: 'store', time: 'day', label: 'Day 1', cast: [{ character: 'ted', mark: 'shelves' }], beats: [{ type: 'act', character: 'ted', gesture: 'think' }] },
          { location: 'rooftop', time: 'night', cast: [{ character: 'ted', mark: 'center' }], beats: [] },
        ],
      },
      { type: 'say', character: 'penny', line: 'Dad!', chorus: ['luke'] },
    ], { wardrobe: [{ character: 'ted', shoes: 'red', boots: true }] }, { wardrobe: [{ character: 'barney', topStyle: 'hoodie', top: 'gray' }] })).toEqual([]);
  });

  test('group lines and reactions only use people who are there', () => {
    expect(errors([
      { type: 'say', character: 'ted', line: 'A.', chorus: ['ted', 'barney', 'penny'] },
      { type: 'say', character: 'ted', line: 'B.', react: [{ character: 'ted' }, { character: 'barney', gesture: 'jaw_drop' }, { character: 'luke' }] },
      { type: 'say', character: 'penny', line: 'C.', chorus: ['marshall'] },
    ])).toEqual([
      'scenes[0].beats[0]: ted is already saying the line: "chorus" is everyone else',
      'scenes[0].beats[0]: barney isn\'t on stage to join in',
      'scenes[0].beats[0]: penny is on the 2030 couch and can\'t join a line in the story',
      'scenes[0].beats[1].react[0]: ted said the line: reactions are the listeners',
      'scenes[0].beats[1].react[1]: barney isn\'t on stage to react',
      'scenes[0].beats[1].react[2]: luke reacts from the couch with a "say" or "act" beat, not a reaction',
      'scenes[0].beats[2]: "chorus" on a kid\'s line is the other kid',
    ]);
  });

  test('you can only hand over what you are holding, to someone who is there', () => {
    expect(errors([
      { type: 'give', character: 'ted', to: 'robin' },
      { type: 'hold', character: 'ted', prop: 'jetpack' },
      { type: 'give', character: 'marshall', to: 'barney', prop: 'beer' },
      { type: 'exit', character: 'robin' },
      { type: 'give', character: 'lily', to: 'robin', prop: 'goat' },
    ])).toEqual([
      'scenes[0].beats[0]: ted isn\'t holding anything: "hold" it first, or say which "prop"',
      expect.stringContaining('scenes[0].beats[1]: "prop": "jetpack" is not one of'),
      'scenes[0].beats[2]: barney isn\'t on stage to take it',
      'scenes[0].beats[4]: robin isn\'t on stage to take it',
    ]);
  });

  test('inserts need something to show, of the right kind', () => {
    expect(errors([
      { type: 'insert', kind: 'text', title: 'Mom' },
      { type: 'insert', kind: 'chart', items: [{ label: 'Way too long a label for any easel', value: 1 }, { label: 'Crazy', value: 'lots' }] },
      { type: 'insert', kind: 'sign' },
      { type: 'insert', kind: 'slides', title: 'Why Ted Should Move In', messages: [{ from: 'ted', text: 'Hi' }], chart: 'bar' },
      { type: 'insert', kind: 'hologram', title: 'Nope' },
    ])).toEqual([
      'scenes[0].beats[0]: a text insert needs "messages" [{ "from", "text" }]',
      'scenes[0].beats[1].items[0]: a chart item is { "label": up to 24 characters, "value": a number >= 0 }',
      'scenes[0].beats[1].items[1]: a chart item is { "label": up to 24 characters, "value": a number >= 0 }',
      'scenes[0].beats[2]: a sign insert needs a "title" or "lines"',
      'scenes[0].beats[3]: "chart" is only for a chart',
      'scenes[0].beats[3]: "messages" are only for a text',
      expect.stringContaining('scenes[0].beats[4]: "kind": "hologram" is not one of'),
    ]);
  });

  test('a montage has two to six quick shots on real sets, never inside a cutaway, and no couch cutaways', () => {
    const shot = (beats: unknown[] = []) => ({ location: 'store', time: 'day', cast: [{ character: 'ted', mark: 'shelves' }], beats });
    const act = { type: 'act', character: 'ted', gesture: 'nod' };
    expect(errors([
      { type: 'montage', music: 'upbeat', shots: [shot()] },
      { type: 'montage', music: 'disco', shots: [shot([act, act, act, act]), shot([{ type: 'say', character: 'luke', line: 'Ugh.' }]), { ...shot(), cast: [{ character: 'ted', mark: 'nowhere' }] }] },
      { type: 'cutaway', style: 'imagined', label: 'Ted\'s dream', location: 'rooftop', time: 'night', cast: [], beats: [{ type: 'montage', music: 'upbeat', shots: [shot(), shot()] }] },
    ])).toEqual([
      'scenes[0].beats[0]: 1 shots: a montage has 2-6',
      expect.stringContaining('scenes[0].beats[1]: "music": "disco" is not one of'),
      'scenes[0].beats[1].shots[0]: 4 beats: a montage shot is quick (0-2 beats)',
      'scenes[0].beats[1].shots[1]: the kids stay on the couch: no couch cutaways inside a montage',
      expect.stringContaining('scenes[0].beats[1].shots[2].cast[0]: mark "nowhere" doesn\'t exist at store'),
      'scenes[0].beats[2].beats[0]: no montages inside a cutaway or another montage',
    ]);
  });

  test('costumes are for the regular cast and use the guest-star vocabulary', () => {
    expect(errors([], {
      wardrobe: [{ character: 'guest1', top: 'red' }, { character: 'penny', top: 'red' }, { character: 'ted', shoes: 'plaid', boots: 'yes', cape: true }],
    }, { wardrobe: [{ character: 'barney', topStyle: 'toga' }, { character: 'barney', top: 'red' }] })).toEqual([
      'wardrobe[0]: costumes are for the regular cast, not "guest1" (guest stars are described in "guests"; the kids don\'t change)',
      'wardrobe[1]: costumes are for the regular cast, not "penny" (guest stars are described in "guests"; the kids don\'t change)',
      expect.stringContaining('wardrobe[2]: unknown field "cape"'),
      expect.stringContaining('wardrobe[2]: "shoes": "plaid" must be #rrggbb'),
      'wardrobe[2]: "boots" is true or false',
      expect.stringContaining('scenes[0].wardrobe[0]: "topStyle": "toga" is not one of'),
      'scenes[0].wardrobe[1]: barney has two costumes here: merge them',
    ]);
  });
});

describe('the episodes use the new devices', () => {
  const all = (beats: Beat[]): Beat[] => beats.flatMap((b) =>
    b.type === 'cutaway' ? [b, ...all(b.beats)] : b.type === 'montage' ? [b, ...b.shots.flatMap((s) => all(s.beats))] : [b]);
  const beats = SCRIPTS.flatMap((ep) => ep.scenes.flatMap((s) => all(s.beats)));

  test('every episode still validates', () => {
    for (const ep of EPISODES) expect(validateEpisode(ep, sets).errors, ep.code).toEqual([]);
  });

  test('every insert kind, a freeze frame, a montage, props, group lines, reactions, shots and wardrobe', () => {
    expect(INSERT_KINDS).toEqual(['playbook']);
    expect(new Set(beats.flatMap((b) => b.type === 'insert' ? [b.kind] : []))).toEqual(new Set([...INSERT_KINDS, ...LEGACY_INSERT_KINDS]));
    for (const type of ['freeze', 'montage', 'hold', 'give'] as const) expect(beats.some((b) => b.type === type), type).toBe(true);
    expect(beats.some((b) => b.type === 'say' && b.chorus?.length && !b.chorus.includes('penny'))).toBe(true);
    expect(beats.some((b) => b.type === 'say' && b.chorus?.includes('penny'))).toBe(true);
    expect(beats.some((b) => (b.type === 'say' || b.type === 'insert') && b.react?.length)).toBe(true);
    expect(beats.some((b) => 'shot' in b && b.shot === 'push_in')).toBe(true);
    expect(SCRIPTS.some((ep) => ep.wardrobe?.length)).toBe(true);
    expect(SCRIPTS.some((ep) => ep.scenes.some((s) => s.wardrobe?.length))).toBe(true);
  });

  test('every storytelling device plays somewhere, so the screen tests see it', () => {
    const say = beats.flatMap((b) => b.type === 'say' ? [b] : []);
    const cutaways = beats.flatMap((b) => b.type === 'cutaway' ? [b] : []);
    const replays = beats.flatMap((b) => b.type === 'replay' ? [b] : []);
    expect(beats.some((b) => b.type === 'split' && b.panels.length === 3)).toBe(true);
    expect(replays.some((b) => b.changes?.length && b.add?.length)).toBe(true);
    expect(replays.some((b) => b.look === 'video')).toBe(true);
    expect(new Set(cutaways.map((b) => b.look ?? 'plain'))).toEqual(new Set(['plain', 'dream', 'memory', 'video']));
    for (const t of ['whip', 'ripple', 'rewind'] as const) expect([...cutaways, ...replays].some((b) => b.transition === t), t).toBe(true);
    expect(cutaways.some((c) => c.look === 'video' && c.beats.some((b) => b.type === 'freeze'))).toBe(true);
    expect(beats.some((b) => b.type === 'montage' && b.label && b.shots.every((s) => s.label))).toBe(true);
    expect(say.some((b) => b.offscreen === 'phone')).toBe(true);
    for (const shot of ['push_in', 'two', 'closeup', 'wide'] as const) expect(say.some((b) => b.shot === shot), shot).toBe(true);
    expect(say.some((b) => b.delivery === 'sing' && b.accompanied)).toBe(true);
    expect(say.some((b) => b.delivery === 'sing' && !b.accompanied)).toBe(true);
    expect(say.some((b) => b.react && b.react.length > 2)).toBe(true);
    expect(beats.some((b) => b.type === 'narrate' && b.over)).toBe(true);
  });

  test('every new gesture shows up somewhere', () => {
    const used = new Set(beats.flatMap((b) => [
      ...(b.type === 'say' || b.type === 'act' || b.type === 'freeze') && b.gesture ? [b.gesture] : [],
      ...(b.type === 'say' || b.type === 'insert' ? b.react ?? [] : []).flatMap((r) => r.gesture ? [r.gesture] : []),
    ]));
    const added = GESTURES.slice(GESTURES.indexOf('kiss'));
    expect(added.filter((g) => !used.has(g))).toEqual([]);
  });
});

describe('wardrobe and props on stage', () => {
  const stage = testStage();
  const look = (id: 'ted' | 'barney' | 'marshall') => stage.actors[id].def.look;

  test('costumes go on over casual or work clothes at the next location, and come off with the next wardrobe', () => {
    stage.setWardrobe([{ character: 'ted', shoes: 'red', boots: true }, { character: 'barney', topStyle: 'hoodie', top: 'gray' }]);
    stage.setLocation('office', 'day');
    expect(look('ted')).toMatchObject({ topStyle: 'suit', boots: true, shoes: '#b8302e' });
    expect(look('barney')).toMatchObject({ topStyle: 'hoodie', top: '#7a7d82' });
    expect(look('barney').vest).toBeUndefined();
    expect(look('barney').underStripes).toBeUndefined();
    expect(look('barney').suitFit).toBeUndefined();
    stage.setLocation('maclarens', 'night');
    expect(look('ted')).toMatchObject({ topStyle: 'sweater', underPlaid: CHARACTERS.ted.look.underPlaid, boots: true });
    stage.setWardrobe([]);
    stage.setLocation('maclarens', 'night');
    expect(look('ted').boots).toBeUndefined();
    expect(look('barney')).toEqual(CHARACTERS.barney.look);

    // Replacing Marshall's shirt removes its third layer without mutating his normal outfit.
    stage.setWardrobe([{ character: 'marshall', under: 'red' }]);
    stage.setLocation('maclarens', 'night');
    expect(look('marshall').cardigan?.tee).toBeUndefined();
    expect(look('marshall').under).toBe('#b8302e');
    stage.setWardrobe([{ character: 'marshall', topStyle: 'flannel', top: 'green' }]);
    stage.setLocation('apartment', 'day');
    expect(look('marshall').cardigan).toBeUndefined();
    expect(look('marshall').plaid).toBeDefined();
    stage.setWardrobe([]);
    stage.setLocation('maclarens', 'night');
    expect(look('marshall').cardigan?.tee).toBe(CHARACTERS.marshall.look.cardigan?.tee);
    expect(look('marshall').cardigan?.tee).toBeDefined();
  });

  test('a prop is dropped at a new location, but survives a cutaway', () => {
    stage.setLocation('maclarens', 'night');
    stage.place('marshall', 'center');
    stage.actors.marshall.hold('goat');
    const frozen = stage.freeze();
    stage.setLocation('rooftop', 'night');
    expect(stage.actors.marshall.prop).toBeNull();
    stage.thaw(frozen);
    expect(stage.actors.marshall.prop).toBe('goat');
  });

  test('sitting down finds the nearest free seat; standing up steps back into the room', async () => {
    stage.setLocation('maclarens', 'night');
    stage.place('ted', 'center');
    const sat = stage.sitDown('ted');
    for (let i = 0; i < 600 && stage.actors.ted.isWalking; i++) stage.update(1 / 30, i / 30);
    await sat;
    expect(stage.actors.ted.isSitting).toBe(true);
    const seat = stage.markOf('ted')!;
    expect(stage.current.marks[seat].seat).not.toBeNull();
    const stood = stage.standUp('ted');
    for (let i = 0; i < 600 && stage.actors.ted.isWalking; i++) stage.update(1 / 30, i / 30);
    await stood;
    expect(stage.actors.ted.isSitting).toBe(false);
    expect(stage.markOf('ted')).toBeUndefined();
  });
});

describe('playback of the new beats', () => {
  test('a card, a hand-off, a line said together, a freeze frame and a montage all play and clean up after themselves', async () => {
    const stage = testStage();
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 60);
    const director = new Director(camera, stage);
    const renderer = { fade: 1, rewind: 0, dream: 0, ripple: 0, memory: 0, still: 0 };
    const log: string[] = [];
    const overlay = {
      ...overlayStub(), location: (t: string, s?: string) => log.push(`label:${t}:${s ?? ''}`),
      showCaption: (name: string) => log.push(`caption:${name}`),
      insert: (c: InsertBeat | null) => log.push(c ? `insert:${c.kind}` : 'insert:off'),
    };
    spies.push(spyOn(speech, 'speak').mockImplementation((_text, profile, onStart) => {
      onStart?.();
      const key = Object.values(CHARACTERS).find((c) => c.voice === profile)?.id ?? 'future-ted';
      log.push(`speak:${key}:${stage.current.id}:still=${renderer.still}:frozen=${stage.frozen}`);
      return { done: Promise.resolve() };
    }));
    const bed = spyOn(audio, 'montage');
    const stopBed = spyOn(audio, 'stopBed');
    spies.push(bed, stopBed);
    const beats = [
        { type: 'insert', kind: 'playbook', character: 'ted', title: 'The Wingman', react: [{ character: 'marshall', gesture: 'jaw_drop' }] },
        { type: 'hold', character: 'ted', prop: 'ring' },
        { type: 'give', character: 'ted', to: 'robin' },
        { type: 'say', character: 'ted', line: 'Aww.', chorus: ['marshall', 'lily', 'robin'] },
        { type: 'freeze', character: 'marshall', gesture: 'facepalm', line: 'Kids, this was a mistake.' },
        {
          type: 'montage', label: 'A week of ring shopping', music: 'upbeat', shots: [
            { location: 'store', time: 'day', cast: [{ character: 'ted', mark: 'shelves' }], beats: [{ type: 'say', character: 'ted', line: 'Too big.' }] },
            { location: 'restaurant', time: 'night', label: 'Day 7', cast: [{ character: 'lily', mark: 'host' }], beats: [] },
          ],
        },
        { type: 'say', character: 'robin', line: 'It fits.' },
    ] as Beat[];
    const meta = { id: 'ring', code: 'S1E1', title: 'Ring', logline: '' };
    const items: ShowItem[] = [{ kind: 'scene', episode: meta, index: 1, scene: { location: 'maclarens', time: 'night', transition: 'cut', cast: booth as Scene['cast'], beats } }];
    let requests = 0;
    const source = { next: () => (++requests <= items.length ? Promise.resolve(items[requests - 1]) : new Promise<ShowItem>(() => {})) };
    let robinHeld: string | null = null;
    const player = new Player(stage, director, renderer as never, overlay as never, { line() {} } as never, source);
    const thaw = stage.thaw.bind(stage);
    spies.push(spyOn(stage, 'thaw').mockImplementation((f) => {
      thaw(f);
      robinHeld = stage.actors.robin.prop;
    }));
    void player.run();
    const start = performance.now();
    while (requests <= items.length && performance.now() - start < 40000) await new Promise((r) => setTimeout(r, 20));

    expect(log.filter((l) => l.startsWith('insert'))).toEqual(['insert:playbook', 'insert:off']);
    expect(log).toContain('caption:Everyone');
    expect(log).toContain('speak:future-ted:maclarens:still=1:frozen=true');
    expect(log).toContain('speak:ted:store:still=0:frozen=false');
    expect(log).toContain('label:A week of ring shopping:montage');
    expect(log).toContain('label:Day 7:montage');
    expect(bed).toHaveBeenCalledWith('upbeat');
    expect(stopBed).toHaveBeenCalled();
    // the ring changed hands, and is still Robin's after the montage
    expect(robinHeld).toBe('ring');
    expect(stage.actors.ted.prop).toBeNull();
    expect(log.at(-1)).toBe('speak:robin:maclarens:still=0:frozen=false');
    expect(renderer.still).toBe(0);
    expect(director.held).toBe(false);
  }, 60000);
});
