import type { Stage } from './stage';
import { MIN_SHOT, type Director } from './director';
import type { Renderer } from '../engine/renderer';
import type { Overlay, Panel } from '../ui/overlay';
import { audio } from '../audio/audio';
import { speech, deliveryRate, estimateDuration } from '../audio/speech';
import { CHARACTERS, FUTURE_TED_VOICE, charName, outfitAt } from '../world/characters';
import {
  ESTABLISHING_TRANSITIONS, KIDS, PAIRED_GESTURES, isCharacterId, isKid, kidTake, playbookTitle,
  type Beat, type CastPlacement, type CharacterId, type Costume, type CutawayBeat, type CutawayLook, type CutawayStyle, type CutawayTransition,
  type Emotion, type EstablishingTransition, type FreezeBeat, type Gesture, type InsertBeat, type LaughKind, type MontageBeat, type MontageMusic, type Reaction,
  type ReplayBeat, type Scene, type SceneLocationId, type Score, type ShowItem, type SoundCue, type SplitBeat, type TimeOfDay,
} from '../script/types';
import { replayBeats } from '../script/strands';
import { GRIP, PROP_NAME } from '../world/props';
import { sleep, clamp, pick, prefersReducedMotion, rand } from '../util';
import { lipTrack } from '../world/lipsync';
import { gestureDuration, impliedEmotion } from '../world/gestures';
import { dipsToBlack, sceneTransition } from './transitions';
import { BURSTS, GANG, HUDDLE_AT, TITLE_TAIL, type Burst } from './mainTitles';
import { openingCredits, closingCredits, type CreditCard } from './credits';

export interface ContentSource {
  next(onWaiting: (msg: string) => void): Promise<ShowItem>;
}

class Skip extends Error {}

/** One kind of beat, by its `type`. */
type BeatOf<T extends Beat['type']> = Extract<Beat, { type: T }>;

/** Someone who can be on stage in the story: anyone in the cast but Penny and Luke, who stay on the couch in 2030. */
const inStory = (id: unknown): id is CharacterId => isCharacterId(id) && !isKid(id);

/** Lines and reactions from Penny or Luke: these happen on the couch in 2030. */
const isKidBeat = (b: Beat) => (b.type === 'say' || b.type === 'act') && isKid(b.character);

/** Everyone a beat puts on stage: the speaker and whoever says it with them or reacts, both ends of a hand-off. */
function participants(b: Beat): string[] {
  switch (b.type) {
    case 'say': return [...(b.offscreen ? [] : [b.character, ...(b.chorus ?? [])]), ...(b.react ?? []).map((r) => r.character)];
    case 'give': return [b.character, b.to];
    case 'insert': return (b.react ?? []).map((r) => r.character);
    case 'act': case 'hold': case 'move': case 'exit': return [b.character];
    case 'freeze': return b.character ? [b.character] : [];
    default: return [];
  }
}

/** In a split screen the camera is fixed per panel: the beats' coverage choices are ignored. */
const LOCKED_OFF = new Proxy({}, { get: () => () => undefined }) as Director;

/** Gestures that last as long as the line they're on. */
const HELD: Gesture[] = ['phone_call', 'lean_in', 'arms_crossed', 'hands_on_hips', 'head_in_hands', 'sob'];

/** Gestures the other person does too: hands meet, glasses clink, they hug and kiss back. */
const JOINED: Gesture[] = ['high_five', 'hug', 'cheers', 'kiss', 'fist_bump'];

/** What a cutaway is, for the transcript. */
const STYLE_NAME: Record<CutawayStyle, string> = {
  imagined: 'Imagined', prediction: 'Predicted', flashback: 'Flashback', flash_forward: 'Flash-forward', meanwhile: 'Meanwhile',
  misremembered: 'Misremembered', sanitized: "Ted's version",
};

/** A sequence played away from the scene: a cutaway, or a replay of an earlier scene or cutaway. */
interface Sequence {
  style: CutawayStyle;
  label?: string;
  look?: CutawayLook;
  transition?: CutawayTransition;
  sound?: SoundCue;
  location: SceneLocationId;
  time: TimeOfDay;
  cast: CastPlacement[];
  wardrobe?: Costume[];
  /** Already happened: blocking replayed instantly before the first beat. */
  before?: Beat[];
  /** Revealed people placed after that. */
  add?: CastPlacement[];
  beats: Beat[];
  replay?: boolean;
}

/** A beat's identity for seeding the camera: the same beat gets the same coverage. */
function beatSeed(b: Beat) {
  const s = JSON.stringify(b);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The episode's costumes with the scene's over them. */
function mergeWardrobe(episode: Costume[] = [], scene: Costume[] = []): Costume[] {
  const out = new Map(episode.map((c) => [c.character, c]));
  for (const c of scene) {
    const ep = out.get(c.character);
    out.set(c.character, ep ? { ...ep, ...c, extras: [...new Set([...(ep.extras ?? []), ...(c.extras ?? [])])] } : c);
  }
  return [...out.values()];
}

/** Plays show items: main titles, scenes beat by beat, closing credits. */
export class Player {
  paused = false;
  private skipLevel: 'none' | 'scene' | 'episode' = 'none';
  private skipWaiters: (() => void)[] = [];
  private currentEpisode: string | null = null;
  private previousScene: Scene | null = null;
  /** This episode's costumes, worn in every scene. */
  private episodeWardrobe: Costume[] = [];
  /** Opening credits still to show over the first scenes of this episode. */
  private credits: CreditCard[] = [];
  private billing: ReturnType<typeof openingCredits> | null = null;
  private rollingCredits = false;
  /** Items played so far (the last one is on screen), so dev mode can step back through them. */
  private history: ShowItem[] = [];
  /** Played items queued again by back(), ahead of anything new from the source. */
  private rewound: ShowItem[] = [];
  private fetching: Promise<ShowItem> | null = null;
  private wake: (() => void) | null = null;
  private playing = false;
  /** What the current scene's people are wearing (the episode's costumes, with the scene's over them). */
  private wardrobe: Costume[] = [];
  /** Underscore a score beat started; it carries across lines, cutaways and scenes until another stops it. */
  private score: MontageMusic | null = null;
  /** A score beat asked for silence: no room tone either, until the next score beat or scene. */
  private hushed = false;
  /** Future Ted still talking under the action (a narrate beat with `over`). */
  private voiceOver: Promise<void> | null = null;
  private speechStops = new Set<() => void>();
  /** The look of the cutaway we're in (null in the scene itself). */
  private look: CutawayLook | null = null;
  /** During a split screen: which panel each person is in. */
  private panelOf: Map<CharacterId, number> | null = null;
  onItem: ((item: ShowItem) => void) | null = null;

  constructor(
    private stage: Stage,
    private director: Director,
    private renderer: Renderer,
    private overlay: Overlay,
    private panel: Panel,
    private source: ContentSource,
  ) {
    stage.onDoorShut = () => audio.doorShut();
    director.minShot = MIN_SHOT;
  }

  skip(level: 'scene' | 'episode') {
    this.skipLevel = level;
    this.stopSpeech();
    this.skipWaiters.splice(0).forEach((f) => f());
  }

  /** Replay the previous scene, or the previous episode from its cold open (the current one if it is the first). */
  back(level: 'scene' | 'episode') {
    const h = this.history;
    if (!h.length) return;
    // While waiting on the writers, the last item has finished: stepping back replays it.
    const current = this.playing ? h.length - 1 : h.length;
    const episodeStart = (i: number) => {
      while (i > 0 && h[i - 1].episode.id === h[i].episode.id) i--;
      return i;
    };
    let to = Math.max(0, current - 1);
    if (level === 'episode') {
      const start = episodeStart(Math.min(current, h.length - 1));
      to = start > 0 ? episodeStart(start - 1) : 0;
    }
    this.rewound.unshift(...h.splice(to));
    this.skip('scene');
    this.wake?.();
  }

  /** Cut away from what's on screen and air whatever the source brings next (after it has been re-cued). */
  cue() {
    this.rewound = [];
    this.fetching = null;
    this.skip('scene');
    this.wake?.();
  }

  /** Something is on screen: an item from the source, or beats the playground is performing. */
  get busy() {
    return this.playing;
  }

  /** Dev playground: put a scene on stage at once, dressed and blocked, without playing any of it. */
  stageNow(scene: Scene) {
    this.reset();
    this.episodeWardrobe = [];
    this.dress(scene);
    this.stageScene(scene, scene.label ? { label: scene.label } : undefined);
    this.previousScene = scene;
  }

  /** Dev playground: play beats in the scene already on stage, without restaging it. Ignored while anything airs. */
  async perform(beats: Beat[]) {
    if (this.playing) return;
    this.playing = true;
    this.skipLevel = 'none';
    try {
      await this.playBeats(beats, this.stage.current.id === 'future');
    } catch (e) {
      if (!(e instanceof Skip)) console.error(e);
      this.reset();
    } finally {
      this.playing = false;
    }
  }

  private async nextItem(): Promise<ShowItem> {
    for (;;) {
      if (this.rewound.length) return this.rewound.shift()!;
      // Keep a pending fetch across a back() so the item it brings is not lost.
      const fetching = (this.fetching ??= this.source.next((msg) => this.overlay.standby(true, msg)));
      const item = await Promise.race([fetching, new Promise<null>((r) => (this.wake = () => r(null)))]);
      this.wake = null;
      if (item) {
        this.fetching = null;
        return item;
      }
    }
  }

  /** Playback time freezes on pause; all waits and fades abort on skip. */
  private wait(seconds: number) {
    return this.animate(seconds, () => {});
  }

  /** The tail before a hard cut away: at least `seconds`, and long enough for the last shot asked for to have played. */
  private async settle(seconds = 0) {
    const d = this.director;
    let shot, left;
    do {
      shot = d.current;
      left = d.settling;
      await this.wait(Math.max(seconds, left));
      seconds = 0;
      // Go again if someone walking out of frame prompted another angle meanwhile, or if the camera's clock
      // fell behind ours (slow frames).
    } while (d.settling > 0 && (d.current !== shot || d.settling < left));
  }

  private async animate(seconds: number, update: (progress: number) => void) {
    await this.untilUnpaused();
    let elapsed = 0;
    let last = performance.now();
    update(0);
    while (elapsed < seconds) {
      await this.race(sleep(16));
      const now = performance.now();
      if (!this.paused) {
        elapsed += (now - last) / 1000;
        update(clamp(elapsed / seconds, 0, 1));
      }
      last = now;
    }
  }

  private race<T>(p: Promise<T>): Promise<T> {
    if (this.skipLevel !== 'none') return Promise.reject(new Skip());
    return new Promise<T>((resolve, reject) => {
      const onSkip = () => reject(new Skip());
      this.skipWaiters.push(onSkip);
      p.then(
        (v) => {
          this.skipWaiters = this.skipWaiters.filter((f) => f !== onSkip);
          resolve(v);
        },
        (e) => {
          this.skipWaiters = this.skipWaiters.filter((f) => f !== onSkip);
          reject(e);
        },
      );
    });
  }

  private async untilUnpaused() {
    if (this.skipLevel !== 'none') throw new Skip();
    while (this.paused) await this.race(sleep(50));
  }

  async run() {
    for (;;) {
      const item = await this.nextItem();
      this.overlay.standby(false);
      // skipping an episode drops the rest of its items
      if (this.skipLevel === 'episode' && 'episode' in item && item.episode.id === this.currentEpisode) {
        if (item.kind === 'episode-end') this.skipLevel = 'none';
        continue;
      }
      this.skipLevel = 'none';
      this.history.push(item);
      if (this.history.length > 400) this.history.splice(0, 100);
      this.onItem?.(item);
      this.playing = true;
      try {
        await this.untilUnpaused();
        await this.play(item);
      } catch (e) {
        if (!(e instanceof Skip)) console.error(e);
        this.reset();
        // (re-read: skip() may have changed it while we were awaiting)
        if ((this.skipLevel as string) === 'scene') this.skipLevel = 'none';
      } finally {
        this.playing = false;
      }
    }
  }

  /** The cold open cuts to six still photographs: the name early, creators on the last group portrait. */
  private async mainTitles() {
    // A story cold open can leave a score running. Titles are a fresh musical boundary.
    this.endScore(0.05);
    const st = this.stage, r = this.renderer;
    const reducedMotion = prefersReducedMotion();
    this.overlay.hideCaption();
    this.overlay.hideLocation();
    this.overlay.year(false);
    audio.ambience('none');
    const credits = this.billing ??= openingCredits();
    this.credits = credits.cast;
    try {
      st.setLocation('maclarens', 'night');
      for (const bg of st.current.background) {
        st.place(bg.character, bg.mark);
        st.setBackground(bg.character, true);
      }
      r.fade = 1;
      r.snap = 1;
      r.trail = 0;
      // Capture each pose once. Reframing the resulting print cannot introduce live animation or ghost faces.
      const photos = BURSTS.map((burst) => {
        this.burst(burst);
        return r.photo(1280);
      });
      const { beat } = audio.theme();
      const total = BURSTS.reduce((n, b) => n + b.beats * beat, 0) + TITLE_TAIL;
      let current = -1;
      await this.animate(total, (u) => {
        const elapsed = u * total;
        let index = 0, start = 0;
        while (index < BURSTS.length - 1 && elapsed >= start + BURSTS[index].beats * beat) {
          start += BURSTS[index++].beats * beat;
        }
        const burst = BURSTS[index];
        const duration = burst.beats * beat + (index === BURSTS.length - 1 ? TITLE_TAIL : 0);
        if (index !== current) {
          this.overlay.showTitle(photos[index], burst.card === 'name');
          this.overlay.credit(burst.card === 'creators' ? credits.creators : null, 'creators');
          current = index;
        }
        this.overlay.moveTitle(clamp((elapsed - start) / duration, 0, 1), burst, reducedMotion,
          index > 0 ? Math.max(0, 1 - (elapsed - start) / 0.12) : 0);
      });
    } finally {
      st.strobe = 0;
      r.snap = r.trail = 0;
      this.overlay.showTitle(null);
      this.overlay.credit(null);
      for (const id of GANG) st.actors[id].talking = false;
      audio.stopCue();
    }
  }

  /** Stage a candid photograph with space between faces and deliberately held expressions. */
  private burst(b: Burst) {
    const st = this.stage, d = this.director;
    for (const id of GANG) {
      const at = b.layout[id];
      if (!at) { st.actors[id].root.visible = false; continue; }
      st.stand(id, HUDDLE_AT[0] + at[0], HUDDLE_AT[1] + at[1], 0);
    }
    d.selfie(b.who.map((id) => st.actors[id].headWorld), b);
    const lens = d.current!.pos;
    for (const [i, id] of b.who.entries()) {
      const a = st.actors[id];
      a.faceTowards(lens, 0);
      a.facing = a.targetFacing;
      a.setEmotion(id === 'barney' ? 'smug' : 'happy');
      a.talking = id !== 'barney';
      a.talkLevel = 0.7;
      // Turn a little toward a friend while keeping three-quarter faces readable.
      a.lookAt = b.looks?.[id] ? lens.clone().lerp(st.actors[b.looks[id]!].headWorld, 0.55) : lens.clone();
      a.onGestureBeat = null;
      const move = b.moves.find(([who]) => who === id);
      if (move) a.doGesture(move[1]);
      a.update(0.32, 1.1 + i * 0.37, true);
      a.root.updateWorldMatrix(true, true);
    }
  }

  /** Cast and creators, one card at a time, over the first scenes (never on the 2030 couch). */
  private async rollCredits() {
    if (this.rollingCredits || !this.credits.length) return;
    this.rollingCredits = true;
    try {
      await this.wait(1.2);
      while (this.credits.length) {
        if (!this.stage.inCutaway && this.stage.current.id !== 'future') this.overlay.credit(this.credits.shift()!, 'cast');
        await this.wait(3);
      }
    } catch {
      // skipped: the next scene picks up where we left off
    } finally {
      this.rollingCredits = false;
    }
  }

  /** Brief, static crew cards on black, cut to the theme reprise with the playback clock. */
  private async endCredits() {
    await this.quiet();
    this.endScore();
    this.credits = [];
    this.overlay.hideCaption();
    this.overlay.hideLocation();
    this.overlay.hideCards();
    this.overlay.year(false);
    audio.ambience('none');
    this.renderer.fade = 0;
    const pages = closingCredits((this.billing ?? openingCredits()).creators);
    try {
      const { duration } = audio.theme();
      let current = -1;
      await this.animate(duration, (u) => {
        const index = Math.min(pages.length - 1, Math.floor(u * pages.length));
        if (index !== current) {
          this.overlay.closingCredit(pages[index]);
          current = index;
        }
      });
    } finally {
      this.overlay.closingCredit(null);
      audio.stopCue();
    }
  }

  /** Take down captions, cards, looks and music left over from whatever was cut short (or, in the playground, the last beats). */
  reset() {
    this.stopSpeech();
    this.overlay.hideCaption();
    this.overlay.hideCards();
    this.overlay.insert(null);
    this.overlay.year(false);
    this.overlay.osd(null);
    const r = this.renderer;
    r.fade = 1;
    r.rewind = 0;
    r.dream = r.ripple = r.memory = r.still = r.whip = r.video = 0;
    r.panels = r.panelsDone = null;
    this.panelOf = null;
    this.look = null;
    this.voiceOver = null;
    this.score = null;
    this.hushed = false;
    this.stage.frozen = this.director.held = false;
    audio.stopCue();
    audio.stopBed(0.05);
    for (const a of Object.values(this.stage.actors)) a.talking = false;
  }

  /** The camera, unless a split screen has locked each panel's off. */
  private get cam(): Director {
    return this.panelOf ? LOCKED_OFF : this.director;
  }

  /** Who a beat is aimed at (its `to`), if that's someone else on stage. */
  private addressee(who: CharacterId, to: string | undefined) {
    return isCharacterId(to) && to !== who && this.stage.onStage(to) ? to : undefined;
  }

  /** Wait for a walk (or sitting down, or leaving) to finish, but no longer than `ms`: nobody holds up the scene. */
  private untilArrived(walk: Promise<void>, ms: number) {
    return this.race(Promise.race([walk, sleep(ms)]));
  }

  /** Two people who can see each other: always, except across the panels of a split screen. */
  private together(a: CharacterId, b: CharacterId) {
    return !this.panelOf || this.panelOf.get(a) === this.panelOf.get(b);
  }

  /** The VCR's "▶ PLAY" while we're watching footage (a cutaway with the video look); nothing otherwise. */
  private showTape() {
    this.overlay.osd(this.look === 'video' ? '▶ PLAY' : null);
  }

  /** Room tone for the set we're on, unless the script asked for silence. */
  private room(kind = this.stage.current.ambience) {
    audio.ambience(this.hushed ? 'none' : kind);
  }

  /** Captions come down between beats, but not while Future Ted is still talking over the action. */
  private hideCaption() {
    if (!this.voiceOver) this.overlay.hideCaption();
  }

  /** Anyone about to speak waits for a voice-over to finish. */
  private async quiet() {
    if (this.voiceOver) await this.race(this.voiceOver);
  }

  /** All spoken routes share the same music mix, including narration over action and offscreen voices. */
  private speak(...[text, profile, onStart, options]: Parameters<typeof speech.speak>) {
    let active = true;
    let release: (() => void) | undefined;
    const finish = () => {
      active = false;
      release?.();
      this.speechStops.delete(finish);
    };
    this.speechStops.add(finish);
    try {
      const handle = speech.speak(text, profile, () => {
        if (!active) return; // delayed browser callbacks must not revive a skipped line
        release ??= audio.duckMusic();
        onStart?.();
      }, options);
      return { done: handle.done.finally(finish) };
    } catch (error) {
      finish();
      throw error;
    }
  }

  private stopSpeech() {
    for (const finish of this.speechStops) finish();
    speech.cancel();
  }

  private setScore(music: Score) {
    this.hushed = music === 'silence';
    if (music === 'none' || music === 'silence') this.endScore(0.6);
    else {
      this.score = music;
      if (audio.bedKind !== music) audio.montage(music);
    }
    this.room();
  }

  /** The underscore stops, fading out over `fade` seconds. */
  private endScore(fade?: number) {
    this.score = null;
    audio.stopBed(fade);
  }

  private async fade(to: number, seconds: number) {
    const from = this.renderer.fade;
    await this.animate(seconds, (u) => { this.renderer.fade = from + (to - from) * u; });
  }

  private async play(item: ShowItem) {
    switch (item.kind) {
      case 'episode-start': {
        // The script chooses a couch exchange or a story scene before the titles.
        this.currentEpisode = item.episode.id;
        this.previousScene = null;
        this.endScore(0.05);
        this.billing = openingCredits();
        this.credits = [];
        this.panel.line('sep', `${item.episode.code} — ${item.episode.title}`);
        this.stage.castGuests(item.guests);
        for (const g of item.guests ?? []) this.panel.line('stage', `Guest star: ${g.name}${g.role ? ` (${g.role})` : ''}.`);
        // the titles show everyone in their usual clothes; the costumes go on in the first scene
        this.episodeWardrobe = item.wardrobe ?? [];
        this.stage.setWardrobe([]);
        if (item.openingScene) {
          this.dress(item.openingScene);
          await this.playScene(item.openingScene, 0);
        } else if (item.coldOpen || item.couch?.length) {
          this.stage.setLocation('future', 'night');
          this.stage.seatKids();
          this.director.fresh();
          this.director.wide(0);
          audio.ambience('none');
          this.renderer.fade = 0;
          await this.fade(1, 0.6);
          this.overlay.year(true);
          await this.wait(0.8);
          if (item.coldOpen) await this.narrate(item.coldOpen);
          for (const b of item.couch ?? []) {
            await this.untilUnpaused();
            await this.beat(b);
          }
          await this.settle(0.3);
        }
        this.stage.setWardrobe([]);
        await this.quiet();
        await this.mainTitles();
        break;
      }
      case 'scene':
        if (item.episode.id !== this.currentEpisode) {
          // Stepped back into an earlier episode past its cold open: bring back its guest stars.
          const start = [...this.history].reverse().find((i) => i.kind === 'episode-start' && i.episode.id === item.episode.id);
          if (start?.kind === 'episode-start') this.stage.castGuests(start.guests);
          this.episodeWardrobe = start?.kind === 'episode-start' ? start.wardrobe ?? [] : [];
          this.currentEpisode = item.episode.id;
        }
        this.dress(item.scene);
        await this.playScene(item.scene, item.index);
        break;
      case 'episode-end':
        await this.endCredits();
        break;
    }
  }

  private dress(scene: Scene) {
    this.wardrobe = mergeWardrobe(this.episodeWardrobe, scene.wardrobe);
    this.stage.setWardrobe(this.wardrobe);
  }

  private async playScene(scene: Scene, index: number) {
    await this.untilUnpaused();
    this.hideCaption();
    this.overlay.hideLocation();
    this.overlay.year(false);
    this.overlay.osd(null);
    this.hushed = false;
    const transition = sceneTransition(scene, this.previousScene, index);
    const reducedMotion = prefersReducedMotion();
    // Ordinary scene changes only play a cue when the script asks for one.
    const cue = () => {
      if (scene.sound && scene.sound !== 'none') audio.cue(scene.sound);
    };
    let firstBeat = 0;
    if ((ESTABLISHING_TRANSITIONS as readonly string[]).includes(transition)) {
      const shot = this.director.current;
      const ambience = this.stage.current.ambience;
      try {
        this.director.establish(this.stage.establish(transition as EstablishingTransition, scene.location, scene.time), !reducedMotion);
        audio.ambience('none');
        this.renderer.fade = 1;
        cue();
        const opening = scene.beats[0];
        if (opening?.type === 'narrate') {
          // Start Ted over the city, then cut inside when his setup lands. Never repeat this beat.
          await Promise.all([this.wait(1.9), this.narrate(opening.line, opening.laugh, opening.over)]);
          firstBeat = 1;
        } else await this.wait(1.9);
      } finally {
        this.stage.endEstablishing();
        this.director.resume(shot);
        audio.ambience(ambience);
      }
    }
    const card = scene.label ? { label: scene.label } : undefined;
    if (transition === 'rewind') {
      if (scene.sound && scene.sound !== 'none') cue();
      else if (!scene.sound) audio.rewind();
      if (!reducedMotion) {
        try {
          await this.animate(0.22, (u) => { this.renderer.rewind = u; });
          this.stageScene(scene, card, scene.strand?.before);
          this.renderer.fade = 1;
          await this.animate(0.28, (u) => { this.renderer.rewind = 1 - u; });
        } finally {
          this.renderer.rewind = 0;
        }
      } else this.stageScene(scene, card, scene.strand?.before);
    } else if (dipsToBlack(scene, this.previousScene, transition)) {
      // same set, a new scene: fade out, swap everyone over in the dark, fade back up
      await this.fade(0, 0.35);
      this.stageScene(scene, card, scene.strand?.before);
      cue();
      await this.wait(0.15);
      await this.fade(1, 0.4);
    } else {
      this.stageScene(scene, card, scene.strand?.before);
      if (transition === 'cut') cue();
    }
    this.renderer.fade = 1;
    this.previousScene = scene;
    void this.rollCredits();
    await this.wait(0.25);

    await this.playBeats(scene.beats.slice(firstBeat), scene.location === 'future');
    await this.settle(0.6);
  }

  private async playBeats(beats: Beat[], onCouch: boolean) {
    for (let i = 0; i < beats.length; i++) {
      await this.untilUnpaused();
      if (onCouch || !isKidBeat(beats[i])) {
        await this.beat(beats[i]);
        continue;
      }
      // the kids chime in: stay on the couch through their lines and Dad's answers
      let j = i + 1;
      while (j < beats.length && (isKidBeat(beats[j]) || ['narrate', 'laugh', 'pause'].includes(beats[j].type))) j++;
      await this.cutaway(beats.slice(i, j));
      i = j - 1;
    }
  }

  /**
   * Leave the scene for a sequence somewhere else (a cutaway, or a replay of an earlier scene or cutaway), then come
   * back to it exactly as we left it. How it looks and sounds is the script's choice, independent of what it is:
   * by default a clean, silent cut, in normal color, with no card.
   */
  private async playSequence(q: Sequence) {
    // the shot we leave has had its moment
    await this.settle();
    const st = this.stage, r = this.renderer;
    const shot = this.director.current;
    const ambience = st.current.ambience;
    const frozen = st.freeze();
    const look = q.look ?? 'plain';
    const reducedMotion = prefersReducedMotion();
    const edit = reducedMotion ? 'cut' : q.transition ?? 'cut';
    const outer = { look: this.look, dream: r.dream, memory: r.memory, video: r.video };
    const costumes = !!q.wardrobe?.length;
    this.hideCaption();
    const what = q.replay ? `Replay (${STYLE_NAME[q.style].toLowerCase()})` : STYLE_NAME[q.style];
    this.panel.line('stage', `${what}${q.label ? `: ${q.label}` : ''}.`);
    try {
      if (q.sound) audio.cue(q.sound);
      // tape being wound back to play it again
      if (q.replay && look === 'video') this.overlay.osd('◀◀ REWIND');
      await this.edit(edit, 'out');
      if (costumes) st.setWardrobe(mergeWardrobe(this.wardrobe, q.wardrobe));
      this.stageScene({ location: q.location, time: q.time, cast: q.cast, beats: q.beats }, { label: q.label, look }, q.before, q.add);
      this.look = look;
      r.dream = look === 'dream' ? 1 : 0;
      r.memory = look === 'memory' ? 1 : 0;
      r.video = look === 'video' ? 1 : 0;
      this.showTape();
      await this.edit(edit, 'in');
      await this.wait(0.2);
      await this.playBeats(q.beats, false);
      await this.settle(0.3);
      this.hideCaption();
      await this.edit(edit, 'out');
    } finally {
      r.ripple = r.rewind = r.whip = 0;
      Object.assign(r, { dream: outer.dream, memory: outer.memory, video: outer.video });
      // the scene's clothes go back on before it's restored
      if (costumes) st.setWardrobe(this.wardrobe);
      st.thaw(frozen);
      this.look = outer.look;
      this.showTape();
      this.room(ambience);
      this.director.resume(shot);
    }
    await this.edit(edit, 'in');
    await this.wait(0.25);
  }

  /** Half of an edit into or out of a sequence: the effect building up ('out'), or settling down ('in'). */
  private async edit(kind: CutawayTransition, half: 'out' | 'in') {
    if (kind === 'cut') return;
    const r = this.renderer;
    const seconds = kind === 'ripple' ? 0.4 : kind === 'whip' ? 0.16 : 0.22;
    try {
      await this.animate(seconds, (u) => {
        const k = half === 'out' ? u : 1 - u;
        if (kind === 'ripple') r.ripple = k;
        else if (kind === 'rewind') r.rewind = k;
        // a whip tears out one way and lands from the other side
        else r.whip = half === 'out' ? u : u - 1;
      });
    } finally {
      if (half === 'in') r.ripple = r.rewind = r.whip = 0;
    }
  }

  private playCutaway(c: CutawayBeat) {
    return this.playSequence({ ...c, before: [] });
  }

  /** Play a scene or cutaway again from where it started, with the same blocking, framing and timing, and the changes made. */
  private playReplay(b: ReplayBeat) {
    const s = b.strand;
    if (!s) return;
    return this.playSequence({
      style: b.style ?? s.style ?? 'flashback', label: b.label, look: b.look, transition: b.transition, sound: b.sound,
      location: s.location, time: s.time, cast: s.cast, wardrobe: [...(s.wardrobe ?? []), ...(b.wardrobe ?? [])],
      before: [...s.before, ...s.beats.slice(0, b.from ?? 0)], add: b.add, beats: replayBeats(s.beats, b), replay: true,
    });
  }

  /**
   * Two or three places on screen at once: each panel's set and people, framed once and held. The beats play
   * across them (a phone call, the same conversation in three places); then back to the scene as it was.
   */
  private async playSplit(b: SplitBeat) {
    // the shot we leave has had its moment
    await this.settle();
    const st = this.stage, r = this.renderer;
    const shot = this.director.current;
    const ambience = st.current.ambience;
    const frozen = st.freeze();
    const groups: CharacterId[][] = [];
    this.hideCaption();
    this.panel.line('stage', `Split screen: ${b.panels.map((p) => st.sets[p.location].name).join(' | ')}.`);
    try {
      if (b.sound) audio.cue(b.sound);
      b.panels.forEach((p, i) => {
        if (i) st.openPanel(p.location, p.time);
        else st.setLocation(p.location, p.time);
        const ids: CharacterId[] = [];
        for (const c of p.cast) {
          if (!inStory(c.character) || groups.flat().includes(c.character)) continue;
          if (i || c.outfit) st.dress(c.character, c.outfit ?? outfitAt(c.character, p.location));
          st.place(c.character, c.mark);
          ids.push(c.character);
        }
        groups.push(ids);
      });
      // frame each panel on its own people, with nobody from the other sets in the way
      const cameras = groups.map((ids, i) => {
        st.focusPanel(b.panels[i].location);
        const others = groups.flat().filter((id) => !ids.includes(id));
        for (const id of others) st.actors[id].root.visible = false;
        // (each panel is framed now, for the snapshot)
        this.director.fresh();
        if (ids.length === 1) this.director.closeup(ids[0]);
        else if (ids.length === 2) this.director.twoShot(ids[0], ids[1]);
        else this.director.coverage(ids, false);
        for (const id of others) st.actors[id].root.visible = true;
        return this.director.snapshot();
      });
      st.focusPanel(b.panels[0].location);
      const sets = b.panels.map((p) => st.sets[p.location]);
      const show = (i: number) => {
        sets.forEach((set, j) => (set.group.visible = j === i));
        groups.forEach((ids, j) => ids.forEach((id) => (st.actors[id].root.visible = j === i)));
      };
      r.panels = cameras.map((camera, i) => ({ camera, show: () => show(i) }));
      r.panelsDone = () => {
        for (const set of sets) set.group.visible = true;
        for (const id of groups.flat()) st.actors[id].root.visible = true;
      };
      this.panelOf = new Map(groups.flatMap((ids, i) => ids.map((id) => [id, i] as const)));
      if (b.label) this.overlay.location(b.label);
      this.room(sets[0].ambience);
      await this.wait(0.3);
      await this.playBeats(b.beats, false);
      await this.wait(0.3);
      this.hideCaption();
    } finally {
      r.panels = r.panelsDone = null;
      this.panelOf = null;
      st.thaw(frozen);
      this.overlay.hideLocation();
      this.room(ambience);
      this.director.resume(shot);
    }
    await this.wait(0.25);
  }

  /**
   * Stage and frame the interior in one synchronous cut, including the midpoint of a flashback. `before` is what
   * already happened there (a scene picked up again, a replay from partway in), staged instantly; `add` is anyone
   * revealed to have been there all along.
   */
  private stageScene(scene: Pick<Scene, 'location' | 'time' | 'cast' | 'beats'>, card?: { label?: string; look?: CutawayLook | 'montage' }, before: Beat[] = [], add: CastPlacement[] = []) {
    this.stage.setLocation(scene.location, scene.time);
    this.room();
    const onCouch = scene.location === 'future';
    if (onCouch) this.stage.seatKids();

    // Anyone who acts in the scene without entering is assumed to already be there.
    // (Except the kids: they're in 2030, and get cut to.)
    const entering = new Set<CharacterId>();
    const present = new Set<CharacterId>();
    // (people a replay reveals go on their own marks, below)
    const revealed = new Set(add.map((c) => c.character));
    for (const c of scene.cast) {
      if (!inStory(c.character) || present.has(c.character)) continue;
      present.add(c.character);
      if (c.outfit) this.stage.dress(c.character, c.outfit);
      this.stage.place(c.character, c.mark);
    }
    for (const b of [...before, ...scene.beats]) {
      if (b.type === 'enter') {
        if (!present.has(b.character) && !isKid(b.character)) entering.add(b.character);
        continue;
      }
      for (const who of participants(b)) {
        if (!inStory(who) || present.has(who) || entering.has(who) || revealed.has(who)) continue;
        present.add(who);
        this.stage.place(who, this.stage.resolveMark(undefined, who));
      }
    }
    this.fastForward(before);
    for (const c of add) {
      if (!inStory(c.character) || this.stage.onStage(c.character)) continue;
      present.add(c.character);
      if (c.outfit) this.stage.dress(c.character, c.outfit);
      this.stage.place(c.character, c.mark);
    }
    for (const bg of this.stage.current.background) {
      if (!present.has(bg.character) && !entering.has(bg.character)) {
        this.stage.place(bg.character, bg.mark);
        this.stage.setBackground(bg.character, true);
      }
    }

    this.director.fresh();
    // (a new scene opens on the master: the whole set, and who's where in it)
    this.director.coverage(this.stage.castIds(), true, true);
    this.overlay.year(onCouch);
    if (card?.label) this.overlay.location(card.label, card.look);
    else this.overlay.hideLocation();
  }

  /** Everything that already happened in a scene we're picking up: entrances, exits, moves and props, all at once. */
  private fastForward(beats: Beat[]) {
    const st = this.stage;
    for (const b of beats) {
      if (!('character' in b) || !inStory(b.character)) continue;
      const who = b.character;
      if (b.type === 'enter') void (st.onStage(who) ? b.to && st.moveTo(who, b.to) : st.enter(who, b.to, true));
      else if (!st.onStage(who)) continue;
      else if (b.type === 'move') void st.moveTo(who, b.to === who ? 'center' : b.to);
      else if (b.type === 'exit') st.leave(who);
      else if (b.type === 'act' && (b.gesture === 'sit' || b.gesture === 'stand')) void (b.gesture === 'sit' ? st.sitDown(who) : st.standUp(who));
      else if (b.type === 'hold') st.actors[who].hold(b.prop === 'none' ? null : b.prop);
      else if (b.type === 'give' && isCharacterId(b.to) && st.onStage(b.to)) {
        const prop = b.prop ?? st.actors[who].prop;
        st.actors[who].hold(null);
        st.actors[b.to].hold(prop);
      }
      for (const id of st.onStageIds()) st.actors[id].arrive();
    }
  }

  /**
   * "And that's how it went for three weeks": hard cuts between quick shots on any set over a music bed,
   * each with its own little card, then back to the scene exactly as we left it.
   */
  private async playMontage(m: MontageBeat) {
    // the shot we leave has had its moment
    await this.settle();
    const st = this.stage;
    const shot = this.director.current;
    const ambience = st.current.ambience;
    const frozen = st.freeze();
    this.hideCaption();
    this.overlay.osd(null);
    this.panel.line('stage', `Montage${m.label ? `: ${m.label}` : ''}.`);
    audio.montage(m.music);
    try {
      for (const [i, s] of m.shots.entries()) {
        await this.untilUnpaused();
        const label = i === 0 && m.label ? m.label + (s.label ? ` · ${s.label}` : '') : s.label ?? '';
        // another year, another look: the shot's own clothes
        st.setWardrobe(s.wardrobe?.length ? mergeWardrobe(this.wardrobe, s.wardrobe) : this.wardrobe);
        this.stageScene({ location: s.location, time: s.time, cast: s.cast, beats: s.beats }, { label, look: 'montage' });
        // the music carries it; no room tone
        audio.ambience('none');
        await this.wait(0.15);
        await Promise.all([this.playBeats(s.beats, false), this.wait(1.6)]);
        await this.settle(0.35);
      }
    } finally {
      audio.stopBed();
      // underscore the montage interrupted picks up again
      if (this.score) audio.montage(this.score);
      st.setWardrobe(this.wardrobe);
      st.thaw(frozen);
      this.overlay.hideLocation();
      this.showTape();
      this.room(ambience);
      this.director.resume(shot);
    }
    await this.wait(0.3);
  }

  /** Future Ted talks over a frozen frame, maybe caught mid-gesture; then it all carries on. */
  private async freeze(b: FreezeBeat) {
    await this.quiet();
    const st = this.stage, r = this.renderer;
    const who = isCharacterId(b.character) && st.onStage(b.character) ? b.character : undefined;
    let rest = 0;
    if (who) {
      st.actors[who].setEmotion(b.emotion);
      const to = this.addressee(who, b.to);
      if (b.shot) this.cam.intent(b.shot, who, to);
      else if (to) this.cam.twoShot(who, to);
      else this.cam.closeup(who);
      const d = b.gesture ? this.gesture(who, b.gesture, to, 0, b.emotion) : 0;
      // caught at the height of it, on the shot asked for (once the one before has had its moment;
      // the freeze itself holds the new one)
      await this.wait(Math.max(d ? d * 0.45 : 0.4, this.director.settling - MIN_SHOT));
      rest = d * 0.55;
    }
    if (b.sound) audio.cue(b.sound);
    // on a tape, a freeze frame is somebody hitting pause
    const tape = this.look === 'video';
    if (tape) this.overlay.osd('❚❚ PAUSE');
    st.frozen = this.director.held = true;
    r.still = 1;
    this.panel.line('stage', tape ? '[paused]' : '[freeze frame]');
    try {
      await this.narrate(b.line, b.laugh);
    } finally {
      st.frozen = this.director.held = false;
      r.still = 0;
      if (tape) this.overlay.osd('▶ PLAY');
    }
    if (rest) await this.wait(rest);
  }

  /** Only the Playbook interrupts the picture. Legacy inserts keep their dialogue and reactions in the room. */
  private async insert(b: InsertBeat) {
    if (b.kind === 'playbook') {
      await this.quiet();
      this.hideCaption();
      this.overlay.insert(b);
      if (b.sound && b.sound !== 'none') audio.cue(b.sound);
      const title = playbookTitle(b);
      this.panel.line('stage', `[Playbook: ${title}]`);
      try {
        await this.wait(clamp(1.2 + title.split(/\s+/).length * 0.28, 2.6, 4));
      } finally {
        this.overlay.insert(null);
      }
    }
    // Explain the play (or read an older insert's line) once we're back with the cast.
    const line = clean(b.line ?? '');
    const reader = inStory(b.character) ? b.character : undefined;
    await this.untilUnpaused();
    if (line && reader) {
      await this.beat({ type: 'say', character: reader, line, react: b.react, laugh: b.laugh });
    } else {
      if (line) await this.narrate(line);
      if (b.react?.length) await this.react(b.react, reader);
      if (b.laugh) await this.laugh(b.laugh);
    }
  }

  /** The listeners' faces once a line lands: one closeup, a two-shot or the whole table. */
  private async react(reactions: Reaction[], speaker?: CharacterId) {
    const st = this.stage;
    const who = reactions.filter((r) => isCharacterId(r.character) && r.character !== speaker && st.onStage(r.character));
    if (!who.length) return;
    let longest = 0;
    // it lands on the first face at once, and on the others a beat apart
    for (const [i, r] of who.entries()) {
      const delay = i ? 0.08 + 0.1 * i + rand(0, 0.08) : 0;
      const a = st.actors[r.character];
      const emotion = r.emotion ?? (r.gesture ? undefined : 'surprised');
      const d = r.gesture ? gestureDuration(r.gesture) : 0;
      a.later(delay, () => {
        a.setEmotion(emotion);
        if (r.gesture) this.gesture(r.character, r.gesture, speaker && st.onStage(speaker) && this.together(speaker, r.character) ? speaker : undefined, 0, r.emotion);
      });
      longest = Math.max(longest, d + delay);
    }
    this.panel.line('stage', `${groupName(who.map((r) => r.character), st.castIds())} ${who.length > 1 ? 'react' : 'reacts'}.`);
    const toward = speaker && st.onStage(speaker) && !this.panelOf ? speaker : undefined;
    const ids = who.map((r) => r.character);
    // a single take cheats out toward the lens, so the face reads
    const take = (id: CharacterId) => {
      if (this.panelOf) return;
      this.director.closeup(id, toward);
      const lens = this.director.current?.pos;
      if (lens) st.actors[id].lookAt = (toward ? st.actors[toward].headWorld : st.actors[id].headWorld).lerp(lens, 0.7);
    };
    const spread = Math.max(0, ...ids.flatMap((a) => ids.map((b) => st.actors[a].position.distanceTo(st.actors[b].position))));
    if (ids.length > 2 && spread > 2.6) {
      // too far apart for one shot: cut from face to face, each held long enough to read
      for (const id of ids.slice(0, 3)) {
        take(id);
        await this.settle(0.6);
      }
      return;
    }
    if (ids.length === 1) take(ids[0]);
    else this.cam.group(ids, toward);
    await this.wait(clamp(longest * 0.8, 0.9, 2.2));
  }

  /** Hard cut to Penny and Luke on the couch in 2030, play their beats, then cut straight back to the story. */
  private async cutaway(beats: Beat[]) {
    // the shot we leave has had its moment
    await this.settle();
    const st = this.stage;
    const shot = this.director.current;
    const ambience = st.current.ambience;
    // 2030 is real: no fantasy haze, old-film grade or tape on the couch, and nothing drawn over it
    const grade = { dream: this.renderer.dream, memory: this.renderer.memory, video: this.renderer.video };
    st.cutToKids();
    audio.ambience('none');
    this.overlay.osd(null);
    this.renderer.dream = this.renderer.memory = this.renderer.video = 0;
    this.director.fresh();
    this.director.wide(0);
    this.overlay.year(true);
    try {
      await this.wait(0.35);
      for (const b of beats) {
        await this.untilUnpaused();
        await this.beat(b);
      }
      await this.settle(0.3);
    } finally {
      st.cutBack();
      this.overlay.year(false);
      Object.assign(this.renderer, grade);
      this.showTape();
      this.room(ambience);
      this.director.resume(shot);
    }
  }

  /** Future Ted. With `over`, he keeps talking while the next beats play; the next person to speak waits. */
  private async narrate(line: string, laugh?: LaughKind, over = false) {
    await this.quiet();
    const text = clean(line);
    if (!text) return;
    this.panel.line('narr', text, 'Future Ted');
    // the kids look back at their dad
    for (const id of KIDS) if (this.stage.onStage(id)) this.stage.actors[id].lookAt = null;
    const h = this.speak(text, FUTURE_TED_VOICE, () => this.overlay.showCaption('Future Ted', '', text, true));
    if (over) {
      const done: Promise<void> = this.race(h.done).then(() => {
        if (this.voiceOver === done) {
          this.voiceOver = null;
          this.overlay.hideCaption();
        }
      }, () => {});
      this.voiceOver = done;
      return;
    }
    await this.race(h.done);
    await this.untilUnpaused();
    this.overlay.hideCaption();
    if (laugh) await this.laugh(laugh);
    await this.wait(0.25);
  }

  private async laugh(kind: LaughKind) {
    const d = audio.laugh(kind);
    // the soundtrack only: who laughs on stage (and who's mortified) is up to the script
    this.panel.line('laugh', `[${kind === 'big' ? 'big laugh' : kind}]`);
    await this.wait(d ? clamp(d * 0.6, 0.8, 2.6) : 0.4);
  }

  private lookAtSpeaker(speaker: CharacterId) {
    const head = this.stage.actors[speaker].headWorld;
    for (const id of this.stage.onStageIds()) {
      if (id === speaker || !this.together(id, speaker)) continue;
      const a = this.stage.actors[id];
      if (!a.isWalking) a.lookAt = head;
    }
  }

  private async beat(b: Beat) {
    // the same beat is covered the same way, so a replay looks like what we saw the first time
    this.director.reseed(beatSeed(b));
    switch (b.type) {
      case 'say':
        await this.say(b);
        break;
      case 'narrate':
        await this.narrate(b.line, b.laugh, b.over);
        break;
      case 'move':
        await this.move(b);
        break;
      case 'enter':
        await this.enter(b);
        break;
      case 'exit':
        await this.exit(b);
        break;
      case 'act':
        await this.act(b);
        break;
      case 'hold':
        await this.hold(b);
        break;
      case 'give':
        await this.give(b);
        break;
      case 'freeze':
        await this.freeze(b);
        break;
      case 'insert':
        await this.insert(b);
        break;
      case 'montage':
        if (!this.stage.inCutaway) await this.playMontage(b);
        break;
      case 'laugh':
        await this.laugh(b.laugh);
        break;
      case 'sound':
        this.panel.line('stage', `[${b.sound}]`);
        audio.cue(b.sound);
        await this.wait(0.15);
        break;
      case 'score':
        this.panel.line('stage', b.music === 'none' ? '[music out]' : b.music === 'silence' ? '[silence]' : `[${b.music} music]`);
        this.setScore(b.music);
        break;
      case 'replay':
        if (!this.stage.inCutaway) await this.playReplay(b);
        break;
      case 'split':
        if (!this.stage.inCutaway && !this.panelOf) await this.playSplit(b);
        break;
      case 'pause':
        await this.wait(clamp(Number(b.seconds) || 1, 0.3, 4));
        break;
      case 'cutaway':
        // the kids' couch is the one place there's no cutting away from
        if (!this.stage.inCutaway) await this.playCutaway(b);
        break;
    }
  }

  /** A line: the speaker framed for it (or heard offscreen), everyone else listening, then any reactions and the laugh. */
  private async say(b: BeatOf<'say'>) {
    const st = this.stage;
    if (!isCharacterId(b.character)) return;
    // the kids' lines were recorded before the series: played the way they were shot
    const take = kidTake(b);
    if (take) b = { ...b, emotion: take.emotion, gesture: take.gesture, delivery: take.delivery };
    await this.quiet();
    if (b.offscreen) {
      await this.offscreen(b);
      return;
    }
    const a = st.actors[b.character];
    if (isKid(b.character) && !st.onStage(b.character)) return;
    st.setBackground(b.character, false);
    if (!st.onStage(b.character)) st.place(b.character, st.resolveMark(undefined, b.character));
    const text = clean(b.line);
    if (!text) return;
    a.setEmotion(b.emotion ?? (b.delivery === 'deadpan' ? 'bored' : undefined));
    const to = this.addressee(b.character, b.to);
    if (to && this.together(to, b.character)) {
      const th = st.actors[to].headWorld;
      a.lookAt = th;
      if (!a.isSitting && !a.isWalking) a.faceTowards(th);
    } else if (isKid(b.character) || to) {
      // talking to Dad, who is where the camera is (or down the line to the other panel)
      a.lookAt = null;
    } else {
      // addressing the room: look at whoever's closest-ish, or the audience
      const others = st.onStageIds().filter((i) => i !== b.character && !b.chorus?.includes(i) && this.together(i, b.character));
      a.lookAt = others.length ? st.actors[pick(others)].headWorld : null;
    }
    this.lookAtSpeaker(b.character);
    // a line said together: everyone in it talks at once, at the same person
    const chorus = (b.chorus ?? []).filter((id) => isCharacterId(id) && id !== b.character && st.onStage(id));
    const voices = [a, ...chorus.map((id) => st.actors[id])];
    for (const id of chorus) {
      st.setBackground(id, false);
      st.actors[id].setEmotion(b.emotion);
      st.actors[id].lookAt = a.lookAt;
    }
    const delivery = b.delivery;
    const cam = this.cam;
    if (isKid(b.character)) chorus.length ? cam.wide(0) : cam.onCouchLine(b.character);
    else if (b.shot) cam.intent(b.shot, b.character, to);
    else if (chorus.length) cam.group([b.character, ...chorus]);
    // a whisper is a two-shot secret; a shout gets the single
    else if (delivery === 'whisper' && to) cam.twoShot(b.character, to);
    else if (delivery === 'shout') cam.closeup(b.character, to);
    else cam.onLine(b.character, to);
    const def = CHARACTERS[b.character];
    const name = chorus.length ? groupName([b.character, ...chorus], st.castIds()) : def.name;
    const color = chorus.length ? '#ffffff' : def.color;
    this.panel.line('say', delivery && delivery !== 'fast' && delivery !== 'slow' ? `(${delivery}) ${text}` : text, name, color);
    const seconds = estimateDuration(text, def.voice.rate * deliveryRate(delivery));
    if (b.gesture && b.gesture !== 'none') this.gesture(b.character, b.gesture, to && this.together(to, b.character) ? to : undefined, seconds, b.emotion);
    const level = delivery === 'shout' ? 1.6 : delivery === 'whisper' ? 0.45 : delivery === 'sing' ? 1.2 : 1;
    // the mouth follows the words: spelled out over the line's length, kept in step by the voice
    const track = lipTrack(text.replace(/[-–—]+$/, ''), seconds * (b.interrupted ? 0.88 : 1));
    const listeners = st.onStageIds().filter((id) => !voices.includes(st.actors[id]));
    for (const id of listeners) st.actors[id].listen(a.emotion);
    const h = this.speak(text, def.voice, () => {
      for (const v of voices) {
        v.talking = true;
        v.talkLevel = level;
        v.speak(track);
      }
      this.overlay.showCaption(name, color, text, false, delivery);
      if (delivery === 'sing' && b.accompanied) audio.serenade(seconds);
    }, { delivery, cutOff: b.interrupted, onWord: (i) => voices.forEach((v) => v.syncWord(i)) });
    try {
      await this.race(h.done);
    } finally {
      for (const v of voices) {
        v.talking = false;
        v.talkLevel = 1;
        v.speak(null);
      }
      for (const id of listeners) st.actors[id].listen(null);
      if (delivery === 'sing' && b.accompanied) audio.stopCue();
    }
    this.overlay.hideCaption();
    if (b.react?.length && !b.interrupted) await this.react(b.react, b.character);
    if (b.laugh) await this.laugh(b.laugh);
    // whoever interrupts jumps straight in
    else if (!b.interrupted) await this.wait(0.18);
  }

  private async move(b: BeatOf<'move'>) {
    if (!inStory(b.character)) return;
    const st = this.stage;
    const target = b.to === b.character ? 'center' : b.to;
    this.panel.line('stage', `${charName(b.character)} moves to ${humanize(target)}.`);
    const p = st.moveTo(b.character, target);
    this.director.coverage(st.castIds());
    await this.untilArrived(p, 2200);
  }

  private async enter(b: BeatOf<'enter'>) {
    if (!inStory(b.character)) return;
    const st = this.stage;
    if (st.onStage(b.character)) {
      if (b.to) await this.beat({ type: 'move', character: b.character, to: b.to });
      return;
    }
    this.panel.line('stage', `${charName(b.character)} enters.`);
    audio.door(st.current.doorSound ?? 'bell');
    const p = st.enter(b.character, b.to);
    this.director.wide(0);
    this.lookAtSpeaker(b.character);
    // (longer through a door they open and shut)
    await this.untilArrived(p, st.current.doors ? 4600 : 2600);
  }

  private async exit(b: BeatOf<'exit'>) {
    const st = this.stage;
    if (!inStory(b.character) || !st.onStage(b.character)) return;
    this.panel.line('stage', `${charName(b.character)} leaves.`);
    const p = st.exit(b.character);
    this.director.wide(0);
    await this.untilArrived(p, st.current.doors ? 4800 : 2400);
  }

  /** A gesture: sitting down or standing up, one done with someone (walking over first if need be), or on their own. */
  private async act(b: BeatOf<'act'>) {
    const st = this.stage;
    if (!isCharacterId(b.character) || !b.gesture || b.gesture === 'none' || !st.onStage(b.character)) return;
    st.actors[b.character].setEmotion(kidTake(b)?.emotion ?? b.emotion);
    const to = this.addressee(b.character, b.to);
    this.panel.line('stage', `${charName(b.character)} ${gestureText(b.gesture, to)}.`);
    const cam = this.cam;
    if (b.gesture === 'sit' || b.gesture === 'stand') {
      const p = b.gesture === 'sit' ? st.sitDown(b.character) : st.standUp(b.character);
      if (b.shot) cam.intent(b.shot, b.character, to);
      else cam.coverage(st.castIds());
      await this.untilArrived(p, 2600);
      return;
    }
    // across a split screen, a gesture is made at the camera
    const at = to && this.together(to, b.character) ? to : undefined;
    if (at && (PAIRED_GESTURES as readonly Gesture[]).includes(b.gesture)) {
      const a = st.actors[b.character], o = st.actors[at];
      const reach = b.gesture === 'kiss' ? 1.1 : 1.4;
      if (a.position.distanceTo(o.position) > reach && !a.isSitting) await this.untilArrived(st.moveTo(b.character, at), 2500);
      if (b.shot) cam.intent(b.shot, b.character, at);
      else cam.twoShot(b.character, at);
    } else if (b.shot) cam.intent(b.shot, b.character, at);
    else if (at) cam.twoShot(b.character, at);
    else if (this.director.random() < 0.6) cam.closeup(b.character);
    const d = this.gesture(b.character, b.gesture, at, 0, b.emotion);
    await this.wait(Math.max(0.6, d * 0.85));
  }

  /** Pick something up, or put it down. */
  private async hold(b: BeatOf<'hold'>) {
    if (!isCharacterId(b.character) || !this.stage.onStage(b.character)) return;
    const a = this.stage.actors[b.character];
    const prop = b.prop === 'none' ? null : b.prop;
    if (a.prop === prop) return;
    const was = a.prop;
    this.panel.line('stage', prop ? `${charName(b.character)} picks up ${PROP_NAME[prop]}.` : `${charName(b.character)} puts ${PROP_NAME[was!].replace(/^an? /, 'the ')} down.`);
    if (b.shot) this.cam.intent(b.shot, b.character);
    else if ((prop && GRIP[prop] !== 'hang') || this.director.random() < 0.5) this.cam.closeup(b.character);
    // reach out, and it's in hand (or gone)
    a.onGestureBeat = () => a.hold(prop);
    const d = a.doGesture('give');
    await this.wait(d * 0.75);
    a.hold(prop);
  }

  /** Hand something over, walking over to them first if they're out of reach. */
  private async give(b: BeatOf<'give'>) {
    const st = this.stage;
    const to = b.to;
    if (!isCharacterId(b.character) || !isCharacterId(to) || to === b.character || !st.onStage(b.character) || !st.onStage(to)) return;
    const a = st.actors[b.character], o = st.actors[to];
    const prop = b.prop ?? a.prop;
    if (!prop) return;
    a.hold(prop);
    this.panel.line('stage', `${charName(b.character)} hands ${charName(to)} ${PROP_NAME[prop]}.`);
    if (a.position.distanceTo(o.position) > 1.3 && !a.isSitting && !st.current.seated) await this.untilArrived(st.moveTo(b.character, to), 2500);
    if (b.shot) this.director.intent(b.shot, b.character, to);
    else this.director.twoShot(b.character, to);
    if (!a.isSitting) a.faceTowards(o.position, 0.1);
    if (!o.isSitting) o.faceTowards(a.position, 0.1);
    a.lookAt = o.headWorld;
    o.lookAt = a.headWorld;
    const handOver = () => {
      if (a.prop !== prop) return;
      a.hold(null);
      o.hold(prop);
    };
    a.onGestureBeat = handOver;
    const d = a.doGesture('give', { target: o });
    o.doGesture('give', { target: a });
    await this.wait(d * 0.8);
    handOver();
  }

  /** A line heard but not seen: down the phone, or from out of shot. The camera stays on whoever's listening. */
  private async offscreen(b: BeatOf<'say'>) {
    const st = this.stage;
    const text = clean(b.line);
    if (!text) return;
    const def = CHARACTERS[b.character];
    const to = isCharacterId(b.to) && st.onStage(b.to) ? b.to : undefined;
    if (to && !st.actors[to].isWalking) this.cam.closeup(to);
    const name = `${def.name} (${b.offscreen === 'phone' ? 'on the phone' : 'offscreen'})`;
    this.panel.line('say', text, name, def.color);
    const listeners = st.onStageIds();
    for (const id of listeners) st.actors[id].listen(b.emotion ?? 'neutral');
    const h = this.speak(text, def.voice, () => this.overlay.showCaption(name, def.color, text, false, b.delivery), { delivery: b.delivery, cutOff: b.interrupted });
    try {
      await this.race(h.done);
    } finally {
      for (const id of listeners) st.actors[id].listen(null);
    }
    this.overlay.hideCaption();
    if (b.react?.length && !b.interrupted) await this.react(b.react);
    if (b.laugh) await this.laugh(b.laugh);
    else if (!b.interrupted) await this.wait(0.18);
  }

  /**
   * Start a gesture (with a partner joining in, for the paired ones); `seconds` holds a phone call for a whole line.
   * Some gestures bring their own face (cracking up, sobbing) unless the beat gave an `emotion`.
   */
  private gesture(id: CharacterId, g: Gesture, to?: CharacterId, seconds = 0, emotion?: Emotion) {
    if (g === 'sit' || g === 'stand') {
      void (g === 'sit' ? this.stage.sitDown(id) : this.stage.standUp(id));
      return 0;
    }
    const a = this.stage.actors[id];
    const implied = emotion ? undefined : impliedEmotion(g);
    const other = to ? this.stage.actors[to] : undefined;
    if (other) {
      if (!a.isSitting) a.faceTowards(other.position, 0.1);
      a.lookAt = other.headWorld;
    }
    a.onGestureBeat = (gg) => {
      if (gg === 'slap') {
        audio.slap();
        other?.react();
        if (other) other.setEmotion('angry');
      } else if (gg === 'high_five' && other) audio.slap();
      else if (gg === 'fist_bump' && other) audio.bump();
      else if (gg === 'cheers') audio.clink();
      else if (gg === 'spit_take') audio.spray();
      else if (gg === 'slow_clap') audio.clap();
    };
    const together = other && JOINED.includes(g);
    if (together) {
      if (!other.isSitting) other.faceTowards(a.position, 0.1);
      other.lookAt = a.headWorld;
      other.doGesture(g, { partner: true, target: a });
    }
    const held = HELD.includes(g) ? seconds : 0;
    const d = a.doGesture(g, { partner: !!together, dur: held, target: other });
    if (implied) a.later(d * implied.at, () => a.setEmotion(implied.emotion));
    return d;
  }
}

/** Strip stage directions like (laughs) or *sighs* from spoken lines. */
function clean(s: string) {
  return String(s ?? '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function humanize(s: string) {
  if (isCharacterId(s)) return charName(s);
  return s.replace(/_/g, ' ');
}

function gestureText(g: Gesture, to?: CharacterId) {
  const t = to ? ` ${charName(to)}` : '';
  const map: Partial<Record<Gesture, string>> = {
    high_five: `high-fives${t}`, hug: `hugs${t}`, slap: `slaps${t}`, point: `points${to ? ' at' + t : ''}`,
    suit_up: 'suits up', facepalm: 'facepalms', arms_crossed: 'crosses arms', thumbs_up: 'gives a thumbs up',
    hands_up: 'throws hands up', shake_head: 'shakes head', cheers: `raises a glass${to ? ' to' + t : ''}`,
    drink: 'takes a sip', think: 'ponders', kiss: to ? `kisses${t}` : 'blows a kiss', phone_call: 'takes a call',
    sit: 'sits down', stand: 'stands up', lean_in: `leans in${to ? ' to' + t : ''}`, jaw_drop: 'gapes',
    fist_bump: `fist-bumps${t}`, spit_take: 'does a spit take',
  };
  return map[g] ?? `${g.replace(/_/g, ' ')}s`;
}

/** "Ted & Marshall", "Ted, Lily & Robin", or "Everyone" when it's the whole room. */
function groupName(ids: CharacterId[], room: CharacterId[]) {
  const names = ids.map(charName);
  if (ids.length >= 3 && room.every((id) => ids.includes(id))) return 'Everyone';
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0] ?? '';
}
