import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as THREE from 'three';
import { testStage } from './helpers/sets';
import { overlayStub } from './helpers/overlay';
import { validateEpisode } from '../src/script/validate';
import { replayBeats, resolveStrands } from '../src/script/strands';
import { episodeItems } from '../src/script/episodes';
import { ledger } from '../src/script/continuity';
import { Director } from '../src/show/director';
import { Player } from '../src/show/player';
import { speech } from '../src/audio/speech';
import { audio } from '../src/audio/audio';
import { CHARACTERS } from '../src/world/characters';
import { Actor } from '../src/world/actor';
import type { Beat, CharacterId, EpisodeScript, ReplayBeat, Scene, ShowItem } from '../src/script/types';

const spies: { mockRestore(): void }[] = [];
afterEach(() => spies.splice(0).forEach((s) => s.mockRestore()));

const sets = testStage().sets;
const booth = [
  { character: 'ted', mark: 'booth_end' }, { character: 'marshall', mark: 'booth_left_back' },
  { character: 'lily', mark: 'booth_left_front' }, { character: 'robin', mark: 'booth_right_back' },
];
const say = (character: string, line = 'Hi.', more: object = {}) => ({ type: 'say', character, line, ...more });

/** An episode around these scenes (one MacLaren's scene by default). */
const episode = (beats: unknown[], extra: Record<string, unknown> = {}, scenes?: unknown[]) => ({
  code: 'S99E01', title: 'Test', logline: 'A test.',
  scenes: scenes ?? [{ location: 'maclarens', time: 'night', cast: booth, beats }], ...extra,
});
const report = (ep: unknown) => validateEpisode(ep, sets);
const errors = (beats: unknown[], extra?: Record<string, unknown>, scenes?: unknown[]) =>
  report(episode(beats, extra, scenes)).errors.map((e) => `${e.path}: ${e.message}`);

describe('the audience laughs; it does not cheer', () => {
  test('"woo" is gone, with a pointer to what to use instead', () => {
    expect(errors([say('ted', 'Hi.', { laugh: 'woo' })]).join('\n')).toContain('the studio audience laughs');
    expect(errors([say('ted', 'Hi.', { laugh: 'applause' })])).toEqual([]);
  });
});

describe('editing is the writer\'s call', () => {
  test('one short scene, many cutaways and an ending with no laugh are all fine', () => {
    const cut = { type: 'cutaway', style: 'imagined', location: 'rooftop', time: 'night', cast: [{ character: 'ted', mark: 'ledge_lookout' }], beats: [say('ted')] };
    const r = report(episode([say('ted'), cut, cut, cut, say('robin', 'Ted.')]));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe('validating the new devices', () => {
  test('a scene using every new device is performable as written', () => {
    const scenes = [
      {
        id: 'booth', location: 'maclarens', time: 'night', label: 'Friday', sound: 'none', cast: booth,
        wardrobe: [{ character: 'marshall', keep: true, tie: 'yellow' }],
        beats: [
          { type: 'score', music: 'tense' },
          { type: 'narrate', line: 'That night, Ted had a plan.', over: true },
          { type: 'act', character: 'ted', gesture: 'salute', to: 'robin' },
          say('barney', 'Pick up, Ted.', { offscreen: 'phone', to: 'ted' }),
          say('lily', 'La la la.', { delivery: 'sing', accompanied: true }),
          { type: 'sound', sound: 'shatter' },
          { type: 'hold', character: 'ted', prop: 'sandwich' },
          {
            type: 'cutaway', id: 'dorm', style: 'misremembered', look: 'memory', transition: 'whip', sound: 'rewind', location: 'wesleyan_dorm', time: 'night',
            wardrobe: [{ character: 'ted', hairStyle: 'long' }], cast: [{ character: 'ted', mark: 'bed_left' }], beats: [say('ted', 'College.')],
          },
          {
            type: 'replay', of: 'dorm', style: 'flashback', label: 'What really happened', changes: [{ at: 0, replace: [say('marshall', 'Dude.')] }],
            add: [{ character: 'marshall', mark: 'bed_right' }],
          },
          {
            type: 'split', label: 'Meanwhile', panels: [
              { location: 'apartment', time: 'night', cast: [{ character: 'lily', mark: 'couch_left' }] },
              { location: 'office', time: 'night', cast: [{ character: 'marshall', mark: 'cubicle_1' }] },
            ],
            beats: [say('lily', 'Marshmallow?', { to: 'marshall', gesture: 'phone_call' }), say('marshall', 'Lilypad.', { to: 'lily' })],
          },
          { type: 'insert', kind: 'sign', title: 'Closed', sound: 'none' },
          { type: 'freeze', line: 'And there it was.', sound: 'shutter' },
          { type: 'score', music: 'silence' },
        ],
      },
      { location: 'apartment', time: 'night', cast: [{ character: 'barney', mark: 'couch_left' }], beats: [say('barney', 'Meanwhile.')] },
      { resume: 'booth', sound: 'chime', beats: [{ type: 'exit', character: 'robin' }, say('ted', 'Where did she go?'), { type: 'replay', of: 'booth', to: 2 }] },
    ];
    const marks = (loc: string) => Object.keys(sets[loc as keyof typeof sets].marks);
    // (the marks this test leans on exist)
    expect(marks('apartment')).toContain('couch_left');
    expect(marks('office')).toContain('cubicle_1');
    expect(marks('wesleyan_dorm')).toEqual(expect.arrayContaining(['bed_left', 'bed_right']));
    const ep = episode([], {
      continuity: { era: 'fall 2011', facts: { 'marshall.job': 'lawyer' }, changes: ['marshall.job'], opens: [{ id: 'ducky-tie', note: 'Marshall wears it until he wins a bet' }], closes: [] },
    }, scenes);
    expect(report(ep).errors.map((e) => `${e.path}: ${e.message}`)).toEqual([]);
  });

  test('replays name an earlier scene or cutaway, and their changes fit the original', () => {
    const cut = { type: 'cutaway', id: 'roof', style: 'flashback', location: 'rooftop', time: 'night', cast: [{ character: 'ted', mark: 'ledge_lookout' }], beats: [say('ted', 'A.'), say('ted', 'B.')] };
    expect(errors([{ type: 'replay', of: 'roof' }, cut])).toEqual([expect.stringContaining('isn\'t the id of an earlier scene or cutaway')]);
    expect(errors([cut, { type: 'replay', of: 'roof', from: 1, to: 5 }])).toEqual([expect.stringContaining('"to" is a beat number of "roof" (1-1)')]);
    expect(errors([cut, { type: 'replay', of: 'roof', changes: [{ at: 0, replace: [], insert: [] }] }])).toEqual([expect.stringContaining('either replaces')]);
    // a change can break the original: robin was never there
    expect(errors([cut, { type: 'replay', of: 'roof', changes: [{ at: 1, insert: [say('robin', 'Boo.')] }] }]))
      .toEqual(['scenes[0].beats[1].changes[0].insert[0]: robin isn\'t on stage here: put them in the cast or give them an "enter" beat first']);
    // ...unless the replay reveals she was there all along
    expect(errors([cut, { type: 'replay', of: 'roof', add: [{ character: 'robin', mark: 'lawn_chair_left' }], changes: [{ at: 1, insert: [say('robin', 'Boo.')] }] }]))
      .toEqual([]);
    expect(errors([cut, cut]).join('\n')).toContain('two scenes or cutaways are called "roof"');
    // replaying a scene that has a named cutaway in it doesn't name it twice
    expect(errors([], {}, [
      { id: 'bar', location: 'maclarens', time: 'night', cast: booth, beats: [say('ted'), cut] },
      { location: 'apartment', time: 'night', cast: [{ character: 'barney', mark: 'couch_left' }], beats: [{ type: 'replay', of: 'bar' }] },
    ])).toEqual([]);
  });

  test('a resumed scene picks up where it was left, with everyone where they were', () => {
    const scenes = [
      { id: 'bar', location: 'maclarens', time: 'night', cast: booth, beats: [{ type: 'exit', character: 'robin' }] },
      { location: 'apartment', time: 'night', cast: [{ character: 'barney', mark: 'couch_left' }], beats: [say('barney')] },
      { resume: 'bar', beats: [say('robin'), say('ted')] },
      { resume: 'bar', location: 'rooftop', cast: booth, beats: [say('ted')] },
      { resume: 'nowhere', beats: [] },
    ];
    expect(errors([], {}, scenes)).toEqual([
      'scenes[2].beats[0]: robin isn\'t on stage here: put them in the cast or give them an "enter" beat first',
      'scenes[3]: a resumed scene picks up with everyone where they were: leave out "cast" (bring anyone new on with "enter")',
      'scenes[3]: "location" comes from "bar": leave it out',
      'scenes[4]: "resume": "nowhere" isn\'t the id of an earlier scene (so far: bar)',
    ]);
  });

  test('a split screen is two or three places at once, where nobody walks around', () => {
    const panel = (location: string, character: string, mark: string) => ({ location, time: 'night', cast: [{ character, mark }] });
    expect(errors([{ type: 'split', panels: [panel('apartment', 'lily', 'couch_left')], beats: [say('lily')] }])).toEqual([
      'scenes[0].beats[0]: "panels" is 2-3 { "location", "time", "cast" }',
    ]);
    expect(errors([{
      type: 'split', panels: [panel('apartment', 'lily', 'couch_left'), panel('office', 'lily', 'cubicle_1')],
      beats: [{ type: 'move', character: 'lily', to: 'center' }, { type: 'cutaway', style: 'imagined', location: 'rooftop', time: 'night', cast: [], beats: [] }, say('penny', 'Seriously, Dad?')],
    }])).toEqual([
      'scenes[0].beats[0].panels[1]: lily can\'t be in two panels at once',
      expect.stringContaining('scenes[0].beats[0].beats[0]: a split screen holds say, narrate, act'),
      expect.stringContaining('scenes[0].beats[0].beats[1]: a split screen holds'),
      'scenes[0].beats[0].beats[2]: the kids can\'t interrupt a split screen',
    ]);
  });

  test('each new beat checks its own fields', () => {
    expect(errors([
      say('ted', 'I am right here.', { offscreen: 'phone' }),
      say('ted', 'La.', { accompanied: true }),
      { type: 'narrate', line: 'Kids.', over: true, laugh: 'laugh' },
      { type: 'sound', sound: 'kazoo' },
      { type: 'score', music: 'polka' },
    ])).toEqual([
      'scenes[0].beats[0]: ted is on stage: "offscreen" is for a voice we hear but don\'t see',
      'scenes[0].beats[1]: "accompanied": true puts a guitar under a sung line ("delivery": "sing")',
      'scenes[0].beats[2]: a voice-over under the action can\'t carry a laugh: put a laugh beat after it',
      expect.stringContaining('scenes[0].beats[3]: "sound": "kazoo" is not one of'),
      expect.stringContaining('scenes[0].beats[4]: "music": "polka" is not one of'),
    ]);
  });

  test('a kept costume only belongs on a scene, and continuity notes have a shape', () => {
    expect(errors([], { wardrobe: [{ character: 'ted', keep: true, top: 'red' }], continuity: { facts: { 'nobody.job': 'x' }, opens: [{ id: 'Bad Id' }] } })).toEqual([
      'wardrobe[0]: "keep" is for a scene\'s costume that stays on for the rest of the episode',
      expect.stringContaining('continuity.facts: "nobody.job": a fact is "<character>.<thing>"'),
      expect.stringContaining('continuity.opens[0]: a thread is'),
    ]);
  });
});

describe('strands', () => {
  const b = (n: number) => say('ted', `Line ${n}.`) as Beat;
  const original = [b(0), b(1), b(2), b(3)];

  test('a replay keeps the original order, with beats replaced, cut and added', () => {
    const r: Pick<ReplayBeat, 'from' | 'to' | 'changes'> = {
      from: 1, to: 3, changes: [{ at: 2, replace: [] }, { at: 1, insert: [b(9)] }, { at: 3, replace: [b(7), b(8)] }, { at: 4, insert: [b(6)] }],
    };
    expect(replayBeats(original, r).map((x) => (x as { line: string }).line)).toEqual(['Line 9.', 'Line 1.', 'Line 7.', 'Line 8.', 'Line 6.']);
  });

  test('resumed scenes and replays are handed the strand they refer to', () => {
    const scene = (s: Partial<Scene>) => ({ location: 'maclarens', time: 'night', cast: [], beats: [], ...s }) as Scene;
    const ep = resolveStrands({
      code: 'S99E01', title: 'T', logline: '', scenes: [
        scene({ id: 'a', cast: [{ character: 'ted', mark: 'booth_end' }], beats: [b(0), b(1)] }),
        scene({ location: 'apartment' }),
        { resume: 'a', beats: [b(2), { type: 'replay', of: 'a' } as Beat] } as unknown as Scene,
        { resume: 'a', beats: [b(3)] } as unknown as Scene,
      ],
    });
    const [, , back, again] = ep.scenes;
    expect(back).toMatchObject({ location: 'maclarens', time: 'night', cast: [{ character: 'ted', mark: 'booth_end' }] });
    expect(back.strand!.before).toEqual([b(0), b(1)]);
    expect(again.strand!.before).toEqual([b(0), b(1), b(2), back.beats[1]]);
    expect((back.beats[1] as ReplayBeat).strand!.beats).toEqual([b(0), b(1)]);
  });

  test('a kept costume stays on for the rest of the episode, until taken off', () => {
    const scene = (wardrobe?: unknown[]) => ({ location: 'maclarens', time: 'night', cast: [], beats: [], wardrobe }) as Scene;
    const items = episodeItems({
      code: 'S99E01', title: 'T', logline: '', coldOpen: 'Kids.', scenes: [
        scene([{ character: 'marshall', keep: true, tie: 'yellow' }]),
        scene(),
        scene([{ character: 'marshall', top: 'red' }]),
        scene([{ character: 'marshall', keep: true }]),
      ],
    } as EpisodeScript, 'x');
    const worn = items.flatMap((i) => (i.kind === 'scene' ? [i.scene.wardrobe] : []));
    expect(worn).toEqual([
      [{ character: 'marshall', tie: 'yellow' }],
      [{ character: 'marshall', tie: 'yellow' }],
      [{ character: 'marshall', tie: 'yellow', top: 'red' }],
      [],
    ]);
  });
});

describe('the continuity ledger', () => {
  const ep = (code: string, continuity: EpisodeScript['continuity']) => ({ code, title: code, logline: '', scenes: [], continuity }) as EpisodeScript;

  test('tracks facts and open threads in airing order, and flags quiet contradictions', () => {
    const book = ledger([
      ep('S11E02', { facts: { 'robin.job': 'anchor' }, closes: ['ducky-tie'] }),
      ep('S11E01', { era: 'fall 2011', facts: { 'robin.job': 'co-anchor' }, opens: [{ id: 'ducky-tie', note: 'Marshall wears the tie' }] }),
      ep('S11E03', { facts: { 'robin.job': 'producer' }, changes: ['robin.job'], opens: [{ id: 'slap-bet', note: 'Two slaps left' }] }),
      ep('S11E04', { closes: ['nothing-open'] }),
    ]);
    expect(book.facts.get('robin.job')).toEqual({ value: 'producer', code: 'S11E03' });
    expect([...book.open.keys()]).toEqual(['slap-bet']);
    expect(book.eras).toEqual([{ code: 'S11E01', era: 'fall 2011' }]);
    expect(book.issues).toEqual([
      { code: 'S11E02', message: 'robin.job is "anchor" here but "co-anchor" in S11E01: list it in "changes" if that\'s on purpose' },
      { code: 'S11E04', message: 'closes "nothing-open", which no earlier episode left open' },
    ]);
  });
});

/** The real player on the real stage, with speech and the screen stubbed out. */
function rig(items: ShowItem[], opts: { speak?: (line: string) => Promise<void> } = {}) {
  const stage = testStage();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 60);
  const director = new Director(camera, stage);
  const renderer = { fade: 1, rewind: 0, dream: 0, ripple: 0, memory: 0, still: 0, whip: 0, video: 0, panels: null as unknown[] | null, panelsDone: null };
  const log: string[] = [];
  const overlay = {
    ...overlayStub(),
    location: (t: string, look?: string) => log.push(`card:${t}:${look ?? ''}`),
    osd: (t: string | null) => log.push(`osd:${t}`),
  };
  const spoken: { line: string; who: string; set: string; panels: number; shot?: THREE.Vector3; ted?: string; held?: string | null }[] = [];
  spies.push(spyOn(speech, 'speak').mockImplementation((line, profile, onStart) => {
    onStart?.();
    const who = Object.values(CHARACTERS).find((c) => c.voice === profile)?.id ?? 'future-ted';
    spoken.push({ line, who, set: stage.current.id, panels: renderer.panels?.length ?? 0, shot: director.current?.pos.clone(), ted: stage.markOf('ted'), held: stage.actors.ted.prop });
    return { done: opts.speak?.(line) ?? Promise.resolve() };
  }));
  let requests = 0;
  const source = { next: () => (++requests <= items.length ? Promise.resolve(items[requests - 1]) : new Promise<ShowItem>(() => {})) };
  const player = new Player(stage, director, renderer as never, overlay as never, { line() {}, nowPlaying() {} } as never, source);
  const run = async () => {
    void player.run();
    const start = performance.now();
    while (requests <= items.length && performance.now() - start < 40000) await new Promise((r) => setTimeout(r, 20));
  };
  return { stage, director, renderer, overlay, player, log, spoken, run };
}

const meta = { id: 'dev', code: 'S99E01', title: 'Devices', logline: '' };
const scene = (beats: Beat[], more: Partial<Scene> = {}): Scene => ({ location: 'maclarens', time: 'night', transition: 'cut', cast: booth as Scene['cast'], beats, ...more });
const sceneItem = (s: Scene, index = 1): ShowItem => ({ kind: 'scene', episode: meta, index, scene: s });

describe('Playbook-only inserts', () => {
  test('retired cards keep dialogue, narration and reactions in the scene without card sounds or reading delays', async () => {
    const r = rig([]);
    r.player.stageNow(scene([]));
    const cards: InsertBeat[] = [
      { type: 'insert', kind: 'text', character: 'ted', messages: [{ from: 'robin', text: 'Bar?' }], line: 'She said bar.', sound: 'chime' },
      { type: 'insert', kind: 'chart', character: 'ted', title: 'Scores', items: [{ label: 'Ted', value: 1 }], line: 'One point.' },
      { type: 'insert', kind: 'slides', character: 'ted', title: 'The plan', lines: ['Explain the plan.'], line: 'Here is the plan.' },
      { type: 'insert', kind: 'sign', title: 'Closed', line: 'The sign said closed.', react: [{ character: 'robin', emotion: 'embarrassed' }], laugh: 'laugh' },
      { type: 'insert', kind: 'sign', title: 'Silent sign' },
    ];
    const insert = spyOn(r.overlay, 'insert');
    const cue = spyOn(audio, 'cue');
    const chime = spyOn(audio, 'textChime');
    const laugh = spyOn(audio, 'laugh').mockReturnValue(0);
    const wait = spyOn(r.player as unknown as { wait(seconds: number): Promise<void> }, 'wait').mockResolvedValue();
    spies.push(insert, cue, chime, laugh, wait);
    await r.player.perform(cards);
    expect(insert).not.toHaveBeenCalled();
    expect(cue).not.toHaveBeenCalled();
    expect(chime).not.toHaveBeenCalled();
    expect(r.spoken.map(({ line, who, set }) => ({ line, who, set }))).toEqual([
      { line: 'She said bar.', who: 'ted', set: 'maclarens' },
      { line: 'One point.', who: 'ted', set: 'maclarens' },
      { line: 'Here is the plan.', who: 'ted', set: 'maclarens' },
      { line: 'The sign said closed.', who: 'future-ted', set: 'maclarens' },
    ]);
    expect(r.stage.actors.robin.emotion).toBe('embarrassed');
    expect(laugh).toHaveBeenCalledWith('laugh');
    expect(wait.mock.calls.every(([seconds]) => seconds < 2)).toBe(true);
  });

  test('a Playbook title clears before the explanation; legacy steps do not prolong it, and skip clears it', async () => {
    const r = rig([]);
    r.player.stageNow(scene([]));
    const events: string[] = [];
    const insert = spyOn(r.overlay, 'insert').mockImplementation(((card: InsertBeat | null) => events.push(card ? 'title' : 'clear')) as never);
    const caption = spyOn(r.overlay, 'showCaption').mockImplementation(() => events.push('caption'));
    const wait = spyOn(r.player as unknown as { wait(seconds: number): Promise<void> }, 'wait').mockResolvedValue();
    spies.push(insert, caption, wait);
    const card: InsertBeat = { type: 'insert', kind: 'playbook', title: 'The Wingman', character: 'ted', line: 'Have you met Ted?', lines: Array(6).fill('A lengthy step in the old Playbook that is no longer shown.') };
    await r.player.perform([card]);
    expect(events).toEqual(['title', 'clear', 'caption']);
    expect(wait.mock.calls[0]).toEqual([2.6]);
    expect(r.spoken.at(-1)).toMatchObject({ line: 'Have you met Ted?', who: 'ted', set: 'maclarens' });
    events.length = 0;
    // A skip during a paused title must still take it down and omit the explanation.
    wait.mockRestore();
    const pending = r.player.perform([card]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    r.player.paused = true;
    r.player.skip('scene');
    await pending;
    expect(events).toEqual(['title', 'clear', 'clear']);
  });
});

describe('playback: nothing automatic', () => {
  test('laughter is the soundtrack only; cutaways, freezes, inserts and songs make no sound or look of their own', async () => {
    const cues = ['cue', 'whoosh', 'freezeFrame', 'dream', 'rewind', 'serenade'] as const;
    const calls: string[] = [];
    for (const k of cues) spies.push(spyOn(audio, k).mockImplementation(((...args: unknown[]) => { calls.push(`${k}${args.length ? `:${args[0]}` : ''}`); return 0; }) as never));
    const faces: string[] = [];
    const r = rig([sceneItem(scene([
      say('ted', 'So.', { react: [{ character: 'robin', emotion: 'embarrassed' }], laugh: 'big' }) as Beat,
      { type: 'cutaway', style: 'imagined', label: 'How Ted pictured it', location: 'rooftop', time: 'night', cast: [{ character: 'ted', mark: 'ledge_lookout' }], beats: [say('ted', 'Picture it.') as Beat] },
      { type: 'freeze', line: 'Kids, this was it.' },
      { type: 'insert', kind: 'sign', title: 'Closed' },
      say('lily', 'La la la.', { delivery: 'sing' }) as Beat,
      { type: 'say', character: 'lily', line: 'Again.', delivery: 'sing', accompanied: true },
      { type: 'sound', sound: 'shatter' },
    ]))]);
    const laugh = spyOn(audio, 'laugh').mockImplementation(() => {
      faces.push(r.stage.actors.robin.emotion);
      return 2;
    });
    spies.push(laugh);
    await r.run();
    // Robin stays mortified through the laugh
    expect(faces).toEqual(['embarrassed']);
    expect(r.stage.actors.robin.emotion).not.toBe('happy');
    // the only sounds are the ones asked for: the accompanied song and the shatter
    expect(calls.map((c) => c.split(':')[0])).toEqual(['serenade', 'cue']);
    expect(calls).toContain('cue:shatter');
    expect(r.log).toContain('card:How Ted pictured it:plain');
    expect(r.spoken.find((s) => s.line === 'Picture it.')).toMatchObject({ set: 'rooftop' });
  }, 60000);
});

describe('playback: time, memory and editing', () => {
  test('a replay restages the original with its framing, the changes made, and someone revealed', async () => {
    const original: Beat[] = [
      say('ted', 'I was very cool about it.', { to: 'robin' }) as Beat,
      say('robin', 'He was.', { to: 'ted' }) as Beat,
      say('marshall', 'So cool.', { to: 'ted' }) as Beat,
    ];
    const cut = { type: 'cutaway', id: 'party', style: 'misremembered', location: 'apartment', time: 'night', cast: [{ character: 'ted', mark: 'couch_left' }, { character: 'robin', mark: 'couch_right' }, { character: 'marshall', mark: 'armchair' }], beats: original } as Beat;
    const ep = resolveStrands({ code: 'S99E01', title: 'T', logline: '', scenes: [scene([
      cut,
      { type: 'replay', of: 'party', label: 'What actually happened', changes: [{ at: 1, replace: [say('robin', 'He cried.', { to: 'ted' }) as Beat] }], add: [{ character: 'barney', mark: 'kitchen' }] },
    ])] });
    const r = rig([sceneItem(ep.scenes[0])]);
    await r.run();
    const lines = r.spoken.map((s) => s.line);
    expect(lines).toEqual(['I was very cool about it.', 'He was.', 'So cool.', 'I was very cool about it.', 'He cried.', 'So cool.']);
    expect(r.spoken.every((s) => s.set === 'apartment')).toBe(true);
    // the unchanged beats are framed exactly as they were
    for (const [a, b] of [[0, 3], [2, 5]]) expect(r.spoken[b].shot!.distanceTo(r.spoken[a].shot!)).toBeLessThan(1e-6);
    expect(r.log).toContain('card:What actually happened:plain');
  }, 60000);

  test('intercutting: a resumed scene has everyone where they were, holding what they held', async () => {
    const ep = episodeItems({
      code: 'S99E01', title: 'T', logline: '', coldOpen: 'Kids.', scenes: [
        scene([{ type: 'move', character: 'ted', to: 'bar_standing' }, { type: 'hold', character: 'ted', prop: 'ring' }, { type: 'exit', character: 'lily' }], { id: 'bar' }),
        scene([say('barney', 'Meanwhile.') as Beat], { location: 'apartment', cast: [{ character: 'barney', mark: 'couch_left' }] }),
        { resume: 'bar', beats: [say('ted', 'So.') as Beat] } as unknown as Scene,
      ],
    } as EpisodeScript, 'x').filter((i) => i.kind === 'scene');
    const r = rig(ep);
    await r.run();
    expect(r.spoken.at(-1)).toMatchObject({ line: 'So.', set: 'maclarens', ted: 'bar_standing', held: 'ring' });
    expect(r.stage.onStage('lily')).toBe(false);
    expect(r.stage.onStage('marshall')).toBe(true);
  }, 60000);

  test('a split screen renders each panel through its own camera, then the scene comes back', async () => {
    const r = rig([sceneItem(scene([
      {
        type: 'split', panels: [
          { location: 'apartment', time: 'night', cast: [{ character: 'lily', mark: 'couch_left' }] },
          { location: 'office', time: 'night', cast: [{ character: 'marshall', mark: 'cubicle_1' }] },
        ], beats: [say('lily', 'Marshmallow?', { to: 'marshall' }) as Beat, say('marshall', 'Lilypad.', { to: 'lily' }) as Beat],
      },
      say('ted', 'Back.') as Beat,
    ]))]);
    await r.run();
    expect(r.spoken.map((s) => [s.line, s.panels])).toEqual([['Marshmallow?', 2], ['Lilypad.', 2], ['Back.', 0]]);
    expect(r.spoken.at(-1)!.set).toBe('maclarens');
    expect(r.renderer.panels).toBeNull();
    expect(r.stage.onStage('marshall')).toBe(true);
    expect(r.stage.markOf('marshall')).toBe('booth_left_back');
  }, 60000);

  test('narration over the action lets the action play, and holds the next line until it ends', async () => {
    let finish!: () => void;
    const order: string[] = [];
    const r = rig([sceneItem(scene([
      { type: 'narrate', line: 'That night, Ted moved.', over: true },
      { type: 'move', character: 'ted', to: 'bar_standing' },
      say('robin', 'Ted?') as Beat,
    ]))], {
      speak: (line) => {
        order.push(`start:${line}`);
        return line.startsWith('That night') ? new Promise<void>((res) => { finish = () => { order.push('narration done'); res(); }; }) : Promise.resolve();
      },
    });
    const done = r.run();
    const start = performance.now();
    // Ted walks while Future Ted is still talking
    while (r.stage.markOf('ted') !== 'bar_standing' && performance.now() - start < 5000) await new Promise((res) => setTimeout(res, 20));
    expect(r.stage.markOf('ted')).toBe('bar_standing');
    await new Promise((res) => setTimeout(res, 2600));
    expect(order).toEqual(['start:That night, Ted moved.']);
    finish();
    await done;
    expect(order).toEqual(['start:That night, Ted moved.', 'narration done', 'start:Ted?']);
  }, 60000);

  test('underscore carries across a scene change until the script stops it', async () => {
    const beds: string[] = [];
    spies.push(spyOn(audio, 'montage').mockImplementation((k) => { beds.push(k); }));
    spies.push(spyOn(audio, 'stopBed').mockImplementation(() => { beds.push('stop'); }));
    const r = rig([
      sceneItem(scene([{ type: 'score', music: 'tense' }, say('ted', 'One.') as Beat])),
      sceneItem(scene([say('ted', 'Two.') as Beat, { type: 'score', music: 'none' }], { location: 'apartment', cast: [{ character: 'ted', mark: 'couch_left' }] }), 2),
    ]);
    await r.run();
    expect(beds.filter((b) => b !== 'stop')).toEqual(['tense']);
    expect(beds.at(-1)).toBe('stop');
  }, 60000);
});

describe('playback: devices on screen', () => {
  test('each split-screen panel is framed for its own strip of the screen, with nobody cut off at the sides', async () => {
    let held: THREE.PerspectiveCamera[] = [];
    const r = rig([sceneItem(scene([{
      type: 'split', panels: [
        { location: 'apartment', time: 'night', cast: [{ character: 'marshall', mark: 'couch_left' }, { character: 'lily', mark: 'couch_right' }] },
        { location: 'office', time: 'night', cast: [{ character: 'robin', mark: 'cubicle_1' }] },
        { location: 'barneys', time: 'night', cast: [{ character: 'barney', mark: 'couch_left' }, { character: 'ted', mark: 'couch_right' }] },
      ], beats: [say('robin', 'Is everyone hearing this?') as Beat],
    }]))], {
      speak: async () => { held = (r.renderer.panels as { camera: THREE.PerspectiveCamera }[]).map((p) => p.camera); },
    });
    await r.run();
    expect(held).toHaveLength(3);
    // as the renderer shows them: a third of the screen each
    const panels: [string, [CharacterId, string][]][] = [
      ['apartment', [['marshall', 'couch_left'], ['lily', 'couch_right']]], ['office', [['robin', 'cubicle_1']]], ['barneys', [['barney', 'couch_left'], ['ted', 'couch_right']]],
    ];
    for (const [i, camera] of held.entries()) {
      const cam = camera.clone();
      cam.aspect = 16 / 9 / 3;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const [set, people] = panels[i];
      r.stage.setLocation(set as Scene['location'], 'night');
      for (const [id, mark] of people) {
        r.stage.place(id, mark);
        expect(Math.abs(r.stage.actors[id].headWorld.project(cam).x), `${id} in panel ${i + 1}`).toBeLessThan(0.9);
      }
    }
  }, 60000);

  test('a split-screen panel keeps its background people off the marks its cast took', () => {
    const st = testStage();
    st.setLocation('restaurant', 'night');
    st.place('lily', 'host');
    st.openPanel('barneys', 'night');
    st.place('barney', 'couch_left');
    st.update(1 / 30, 0);
    const extra = (mark: string) => st.extras.find((e) => e.set === 'restaurant' && e.mark === mark)!.actor.root.visible;
    // (the host would stand inside Lily)
    expect(extra('host')).toBe(false);
    expect(extra('service')).toBe(true);
    st.setLocation('restaurant', 'night');
    st.update(1 / 30, 0);
    expect(extra('host')).toBe(true);
  });

  test('on a split-screen call, whoever is on the line keeps the phone up until it ends', async () => {
    const calls: string[] = [];
    const r = rig([sceneItem(scene([{
      type: 'split', panels: [
        { location: 'apartment', time: 'night', cast: [{ character: 'lily', mark: 'couch_left' }] },
        { location: 'office', time: 'night', cast: [{ character: 'marshall', mark: 'cubicle_1' }] },
      ], beats: [say('lily', 'Marshmallow?', { to: 'marshall', gesture: 'phone_call' }) as Beat, say('marshall', 'Lilypad.', { to: 'lily', gesture: 'phone_call' }) as Beat],
    }]))]);
    // (on the prototype: dressing Marshall for the office swaps in another actor for him)
    const go = Actor.prototype.doGesture;
    spies.push(spyOn(Actor.prototype, 'doGesture').mockImplementation(function (this: Actor, g, o) {
      if (g === 'phone_call') calls.push(`${this.def.id}:${(o?.dur ?? 0) > 60 ? 'call' : 'line'}`);
      return go.call(this, g, o);
    }));
    await r.run();
    // both pick up as the split opens, before anyone speaks; their own lines carry on the same call
    expect(calls.slice(0, 2).sort()).toEqual(['lily:call', 'marshall:call']);
  }, 60000);

  test('a voice down the phone is on whoever has the phone, with it at their ear', async () => {
    const gestures: string[] = [];
    const r = rig([sceneItem(scene([
      { type: 'hold', character: 'ted', prop: 'phone' },
      say('barney', 'Ted. Suit up.', { offscreen: 'phone' }) as Beat,
    ]))]);
    const go = Actor.prototype.doGesture;
    spies.push(spyOn(Actor.prototype, 'doGesture').mockImplementation(function (this: Actor, g, o) {
      if (this.def.id === 'ted') gestures.push(String(g));
      return go.call(this, g, o);
    }));
    let on: string | undefined;
    r.overlay.showCaption = ((name: string) => { if (name.includes('on the phone')) on = r.director.current?.subject; }) as never;
    await r.run();
    expect(r.spoken.find((s) => s.line === 'Ted. Suit up.')?.who).toBe('barney');
    expect(on).toBe('ted');
    expect(gestures).toContain('phone_call');
  }, 60000);

  test('a freeze frame or a gesture on someone turned to talk to the room is shot from the side they face', async () => {
    const r = rig([sceneItem(scene([
      say('robin', 'Sir, your best line?', { to: 'ted' }) as Beat,
      say('ted', 'Only by destiny.', { to: 'robin' }) as Beat,
      { type: 'act', character: 'ted', gesture: 'shrug' },
      { type: 'freeze', character: 'ted', line: 'Kids, I had been workshopping it.' },
    ], { cast: [{ character: 'robin', mark: 'center' }, { character: 'ted', mark: 'bar_stool_2' }] as Scene['cast'] }))]);
    const singles: string[] = [];
    const closeup = r.director.closeup.bind(r.director);
    spies.push(spyOn(r.director, 'closeup').mockImplementation((id, toward, push) => {
      if (id === 'ted' && r.stage.actors.robin.talking === false) singles.push(`${id}>${toward ?? ''}`);
      return closeup(id, toward, push);
    }));
    let frozen = false;
    r.overlay.showCaption = (() => { if (r.renderer.still) frozen = true; }) as never;
    await r.run();
    expect(frozen).toBe(true);
    // (on a bar stool facing the bar, his face is turned round to Robin: a single from the bar would be the back of his head)
    expect(singles.length).toBeGreaterThan(0);
    expect(singles.every((s) => s === 'ted>robin')).toBe(true);
  }, 60000);

  test('a montage shot goes straight in on its people, and footage played again is wound back first', async () => {
    const order: string[] = [];
    const r = rig([sceneItem(resolveStrands({ code: 'S99E01', title: 'T', logline: '', scenes: [scene([
      {
        type: 'montage', music: 'upbeat', shots: [
          { location: 'rooftop', time: 'night', label: 'Day 1', cast: [{ character: 'ted', mark: 'lawn_chair_middle' }], beats: [] },
          { location: 'office', time: 'day', label: 'Day 2', cast: [{ character: 'ted', mark: 'cubicle_1' }], beats: [] },
        ],
      },
      { type: 'cutaway', id: 'tape', style: 'flashback', look: 'video', location: 'metro_news_one', time: 'day', cast: [{ character: 'robin', mark: 'anchor_left' }], beats: [say('robin', 'Good evening.') as Beat] },
      { type: 'replay', of: 'tape', look: 'video', label: 'Again' },
    ])] }).scenes[0])], { speak: async (line) => { order.push(`say:${line}`); } });
    spies.push(spyOn(audio, 'montage').mockImplementation(() => {}));
    const montage: number[] = [];
    const { location, osd } = r.overlay;
    r.overlay.location = ((t: string, look?: string) => {
      location(t, look);
      order.push(`card:${t}`);
      if (look === 'montage') queueMicrotask(() => montage.push(r.director.current!.pos.distanceTo(r.stage.actors.ted.headWorld)));
    }) as never;
    r.overlay.osd = ((t: string | null) => { osd(t); order.push(`osd:${t}`); }) as never;
    await r.run();
    // (not the master of the whole set, with Ted small and far off)
    expect(montage).toHaveLength(2);
    for (const d of montage) expect(d).toBeLessThan(3.5);
    const again = order.indexOf('card:Again');
    expect(order.slice(again)).toEqual(['card:Again', 'osd:▶ PLAY', 'osd:◀◀ REWIND', 'osd:▶ PLAY', 'say:Good evening.', 'osd:null']);
  }, 60000);
});
