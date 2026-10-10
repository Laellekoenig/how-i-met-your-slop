import { playbookTitle, type CutawayLook, type Delivery, type EpisodeMeta, type InsertBeat } from '../script/types';
import type { PhotoMotion } from '../show/mainTitles';
import type { CreditCard } from '../show/credits';
import { episodeLabel } from './guide';
import { $, el } from './dom';

/** On-screen graphics: captions, title cards, cutaway cards, standby. */
export class Overlay {
  private caption = $('caption');
  private capName = $('caption-name');
  private capText = $('caption-text');
  private titleCard = $('title-card');
  private titlePhoto = this.titleCard.querySelector('.title-photo') as HTMLElement;
  private creditEl = $('credit');
  private closingCredits = $('closing-credits');
  private standbyEl = $('standby');
  private standbyMsg = $('standby-msg');
  private loc = $('loc-label');
  private yearEl = $('year');
  private insertEl = $('insert');
  private osdEl = $('osd');
  /** When the time/place super last went up (it fades out on its own, LABEL_SECONDS later). */
  private labelAt = -Infinity;

  constructor() {
    const resize = new ResizeObserver(() => this.clearCaptionSpace());
    resize.observe(this.caption);
    resize.observe(this.loc.parentElement!);
  }

  showCaption(name: string, color: string, text: string, narration = false, delivery?: Delivery) {
    this.caption.className = '';
    this.caption.classList.toggle('narration', narration);
    if (delivery) this.caption.classList.add(delivery);
    this.capName.textContent = name;
    this.capName.style.color = narration ? '' : color;
    this.capText.textContent = text;
    this.caption.classList.remove('hidden');
    this.clearCaptionSpace();
  }

  /** "2030" low in the frame for a few seconds as we arrive on the couch with the kids. */
  year(on: boolean) {
    const wasOn = !this.yearEl.classList.contains('hidden');
    this.yearEl.classList.toggle('hidden', !on);
    if (!on || wasOn) return;
    this.yearEl.style.bottom = '';
    this.clearCaptionSpace();
  }

  /** Lift time/place supers above subtitles, without bouncing down again between lines in the same shot. */
  private clearCaptionSpace() {
    if (this.caption.classList.contains('hidden')) return;
    // (layout offsets, not client rects: a phone's stand-in fullscreen turns the whole picture sideways)
    const height = this.loc.parentElement!.clientHeight;
    if (!height) return;
    const gap = height * 0.025;
    const need = (height - this.caption.offsetTop + gap) / height * 100;
    for (const label of [this.loc, this.yearEl]) {
      if (label.classList.contains('hidden')) continue;
      const now = (height - label.offsetTop - label.offsetHeight) / height * 100;
      if (need > now) label.style.bottom = `${need}%`;
    }
  }

  hideCaption() {
    this.caption.classList.add('hidden');
  }

  /** Full-bleed still photo. The title belongs to the second photograph, like the show's opening. */
  showTitle(photo: HTMLCanvasElement | null, name = false) {
    this.titleCard.classList.toggle('hidden', !photo);
    this.titleCard.classList.toggle('with-name', !!photo && name);
    this.titlePhoto.replaceChildren(...(photo ? [photo] : []));
    this.titlePhoto.style.transform = '';
    this.titlePhoto.style.filter = '';
  }

  /** Driven by playback time so pauses freeze the pan and reduced motion leaves the print still. */
  moveTitle(u: number, motion: PhotoMotion, reducedMotion: boolean, shutter = 0) {
    const frame = this.titlePhoto;
    if (reducedMotion) {
      frame.style.transform = 'none';
      frame.style.filter = 'none';
      return;
    }
    const drift = u - 0.5;
    const sweep = shutter * shutter;
    frame.style.transform = `translate(${motion.pan[0] * drift + sweep * motion.pan[0] * 5}%, ${motion.pan[1] * drift}%) rotate(${motion.tilt}deg) scale(${1.085 + motion.zoom * drift})`;
    frame.style.filter = shutter > 0 ? `blur(${sweep * 5}px)` : 'none';
  }

  /** An opening credit: a cast name low in the frame, or the creators beside the gang in the main titles. */
  credit(card: { label?: string; name: string } | null, kind: 'cast' | 'creators' = 'cast') {
    this.creditEl.classList.toggle('hidden', !card);
    if (!card) return;
    this.creditEl.className = kind;
    this.creditEl.replaceChildren();
    if (card.label) this.creditEl.append(el('small', '', card.label));
    this.creditEl.append(card.name);
    restartAnimation(this.creditEl);
  }

  /** Static cards: the player owns their timing, pause and skip behavior. */
  closingCredit(cards: CreditCard[] | null) {
    this.closingCredits.classList.toggle('hidden', !cards);
    this.closingCredits.replaceChildren(...(cards ?? []).map((card) => {
      const group = el('div', 'closing-credit');
      if (card.label) group.append(el('small', '', card.label));
      group.append(el('span', '', card.name));
      return group;
    }));
  }

  hideCards() {
    this.titleCard.classList.add('hidden');
    this.closingCredit(null);
    this.creditEl.classList.add('hidden');
  }

  /** The Playbook cuts to a title card; older phone/chart/slide/sign beats stay in the scene. */
  insert(card: InsertBeat | null) {
    const play = card?.kind === 'playbook' ? card : null;
    this.insertEl.className = play ? 'insert-playbook' : 'hidden';
    this.insertEl.replaceChildren(...(play ? [playbookCard(play)] : []));
  }

  /** Time/place supers share the show's lettering across scenes, cutaways and montages. */
  location(text: string, look?: CutawayLook | 'montage') {
    // (the super has the lower third to itself: an opening credit on its way out gives way to it)
    if (this.creditEl.className === 'cast') this.creditEl.classList.add('hidden');
    this.labelAt = performance.now();
    this.loc.className = look ? `cutaway ${look}` : '';
    this.loc.textContent = text;
    this.loc.classList.remove('hidden');
    this.loc.style.bottom = '';
    this.clearCaptionSpace();
    restartAnimation(this.loc);
  }

  hideLocation() {
    this.loc.classList.add('hidden');
  }

  /** A time/place super is on screen: no opening credit goes up over it. */
  get labelShowing() {
    return !this.loc.classList.contains('hidden') && performance.now() - this.labelAt < LABEL_SECONDS * 1000;
  }

  /** The VCR's on-screen display over footage: "▶ PLAY", "❚❚ PAUSE", "◀◀ REWIND". */
  osd(text: string | null) {
    this.osdEl.classList.toggle('hidden', !text);
    this.osdEl.textContent = text ?? '';
  }

  standby(on: boolean, msg?: string) {
    this.standbyEl.classList.toggle('hidden', !on);
    if (msg) this.standbyMsg.textContent = msg;
  }
}

/** How long a time/place super stays up: its fade in, hold and fade out in the stylesheet. */
const LABEL_SECONDS = 3.6;

/** Dev mode's side panel: what's on, and a running transcript. */
export class Panel {
  private transcript = $('transcript');

  nowPlaying(ep: EpisodeMeta, meta: string[]) {
    $('now-code').textContent = episodeLabel(ep.code);
    $('now-title').textContent = ep.title;
    $('now-meta').textContent = meta.join(' · ');
  }

  line(kind: 'say' | 'narr' | 'stage' | 'laugh' | 'sep', text: string, name?: string, color?: string) {
    const li = el('li', kind === 'say' ? '' : kind);
    if (name) {
      const b = el('b', '', name);
      if (color) b.style.color = color;
      li.append(b);
    }
    li.append(text);
    const atBottom = this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 40;
    this.transcript.appendChild(li);
    while (this.transcript.children.length > 300) this.transcript.firstElementChild?.remove();
    if (atBottom) this.transcript.scrollTop = this.transcript.scrollHeight;
  }
}

/** A cream, stepped-border title card, like the plays introduced in the original show. */
function playbookCard(c: InsertBeat): HTMLElement {
  const page = el('div', 'playbook-page');
  const frame = svgEl('svg', { viewBox: '0 0 700 500', preserveAspectRatio: 'none', class: 'playbook-frame', 'aria-hidden': 'true' });
  frame.append(
    svgEl('path', { d: 'M45 4 H655 V36 H696 V464 H655 V496 H45 V464 H4 V36 H45 Z', class: 'outer' }),
    svgEl('path', { d: 'M60 19 H640 V51 H681 V449 H640 V481 H60 V449 H19 V51 H60 Z', class: 'inner' }),
  );
  const title = playbookTitle(c);
  const heading = el('h2', 'playbook-title');
  const prefix = title.match(/^The\s+/i);
  if (prefix) heading.append(el('span', 'playbook-prefix', prefix[0]));
  heading.append(el('span', '', prefix ? title.slice(prefix[0].length) : title));
  page.append(frame, heading);
  return page;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Play an element's CSS animation again from the start. */
function restartAnimation(e: HTMLElement) {
  e.style.animation = 'none';
  void e.offsetWidth;
  e.style.animation = '';
}
