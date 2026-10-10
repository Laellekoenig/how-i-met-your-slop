import type { Stage } from '../show/stage';
import type { Director } from '../show/director';
import { NYC_TRANSITIONS, type CharacterId, type LocationId } from '../script/types';
import { el } from './dom';

const previews = {
  maclarens: [
    ['marshall', 'booth_left_front'],
    ['lily', 'booth_left_back'],
    ['ted', 'booth_end'],
    ['robin', 'booth_right_front'],
    ['barney', 'booth_right_back'],
  ],
  restaurant: [
    ['ted', 'table_left'],
    ['robin', 'table_right'],
    ['lily', 'booth_left'],
    ['marshall', 'booth_middle'],
    ['barney', 'booth_right'],
  ],
  car: [
    ['marshall', 'driver'],
    ['ted', 'front_passenger'],
    ['lily', 'back_middle'],
    ['robin', 'back_left'],
    ['barney', 'back_right'],
  ],
  taxi: [
    ['ted', 'back_left'],
    ['robin', 'back_right'],
    ['lily', 'back_middle'],
    ['barney', 'front_passenger'],
    ['ranjit', 'driver'],
  ],
  limo: [
    ['barney', 'rear_seat_left'],
    ['robin', 'rear_seat_right'],
    ['ted', 'bench_1'],
    ['lily', 'bench_2'],
    ['marshall', 'bench_3'],
    ['ranjit', 'driver'],
  ],
  maclarens_sidewalk: [
    ['ted', 'pub'],
    ['robin', 'friend'],
    ['marshall', 'stoop'],
    ['lily', 'stoop_friend'],
    ['barney', 'curb'],
  ],
  hoser_hut: [
    ['robin', 'table_left'],
    ['marshall', 'table_right'],
    ['lily', 'friend'],
    ['barney', 'bar_stool'],
  ],
  courtroom: [
    ['marshall', 'counsel'],
    ['lily', 'client'],
    ['brad', 'opposing_counsel'],
    ['ted', 'gallery_left'],
    ['barney', 'gallery_right'],
  ],
  atlantic_city_casino: [
    ['barney', 'player_center'],
    ['marshall', 'player_left'],
    ['lily', 'player_right'],
    ['ted', 'table_left'],
    ['robin', 'table_right'],
  ],
  elevator: [
    ['ted', 'center'],
    ['robin', 'buttons'],
    ['barney', 'left'],
  ],
  lusty_leopard: [
    ['barney', 'table_left'],
    ['quinn', 'table_right'],
    ['ted', 'friend'],
  ],
  barneys: [
    ['barney', 'couch_right'],
    ['marshall', 'center'],
    ['ted', 'window'],
    ['robin', 'kitchen_stool_1'],
  ],
  barneys_office: [
    ['barney', 'desk_chair'],
    ['marshall', 'guest_chair_left'],
    ['ted', 'guest_chair_right'],
  ],
  rooftop: [
    ['ted', 'lawn_chair_left'],
    ['marshall', 'lawn_chair_middle'],
    ['lily', 'lawn_chair_right'],
    ['robin', 'ledge_lookout'],
    ['barney', 'grill'],
  ],
  metro_news_one: [
    ['robin', 'anchor_left'],
    ['ted', 'anchor_right'],
    ['lily', 'camera_operator'],
    ['barney', 'desk_side'],
  ],
  store: [
    ['marshall', 'checkout'],
    ['lily', 'cashier'],
    ['ted', 'queue'],
  ],
  lecture_hall: [
    ['ted', 'lectern'],
    ['robin', 'student_1_3'],
    ['marshall', 'student_2_2'],
  ],
  hospital: [
    ['ted', 'reception'],
    ['lily', 'receptionist'],
    ['marshall', 'seat_left'],
  ],
  canadian_mall: [
    ['robin', 'stage'],
    ['ted', 'audience'],
    ['barney', 'friend'],
  ],
} as const satisfies Partial<Record<LocationId, readonly (readonly [CharacterId, string])[]>>;
const cityPreviews = {
  flatiron: 'NYC · Flatiron Building', washington_square: 'NYC · Washington Square',
  central_park: 'NYC · Central Park', brooklyn_bridge: 'NYC · Brooklyn Bridge',
};
type CityPreviewId = (typeof NYC_TRANSITIONS)[number];
type PreviewId = keyof typeof previews | 'atlantic_city' | CityPreviewId;
const isCity = (id: PreviewId): id is CityPreviewId => Object.hasOwn(cityPreviews, id);

/** Optional, silent set tour. Episodes continue to use the normal player and show guide. */
export function setPreview(stage: Stage, director: Director) {
  const params = new URLSearchParams(location.search);
  const requested = params.get('set');
  if (!requested || (!Object.hasOwn(previews, requested) && !Object.hasOwn(cityPreviews, requested) && requested !== 'atlantic_city')) return false;
  let current = requested as PreviewId;
  let time: 'day' | 'night' = params.get('time') === 'day' ? 'day' : 'night';
  const bar = el('div', 'set-preview');
  bar.setAttribute('aria-label', 'Set preview');
  const places = el('select');
  places.setAttribute('aria-label', 'Location');
  for (const id of [...Object.keys(previews), 'atlantic_city', ...NYC_TRANSITIONS] as PreviewId[]) {
    places.append(option(id, id === 'atlantic_city' ? 'Atlantic City · Arrival' : isCity(id) ? cityPreviews[id] : stage.sets[id].name));
  }
  places.value = current;
  const shots = el('select');
  shots.setAttribute('aria-label', 'Camera angle');
  const daylight = el('button');
  daylight.type = 'button';
  const guide = el('a', '', 'TV guide');
  guide.href = `/${params.has('mute') ? '?mute' : ''}`;
  bar.append(el('span', '', 'ON LOCATION'), places, shots, daylight, guide);
  document.body.append(bar);
  const updateShot = () => {
    stage.endEstablishing();
    director.fresh();
    if (current === 'atlantic_city') {
      director.establish(stage.establish('atlantic_city', 'atlantic_city_casino', time), true);
      return;
    }
    if (isCity(current)) {
      director.establish(stage.establish(current, 'maclarens', time, Number(shots.value)), true);
      return;
    }
    const [kind, value] = shots.value.split(':');
    const cast = previews[current];
    if (kind === 'wide') director.wide(Number(value), 0);
    else if (kind === 'close') director.closeup(value as CharacterId);
    else {
      const [a, b] = value === 'reverse' ? [cast[1][0], cast[0][0]] : [cast[0][0], cast[1][0]];
      if (kind === 'two') director.twoShot(a, b);
      else director.overShoulder(a, b);
    }
  };
  const show = () => {
    const url = new URL(location.href);
    url.searchParams.set('set', current);
    url.searchParams.set('time', time);
    history.replaceState(null, '', url);
    daylight.textContent = time === 'night' ? 'Night · Switch to day' : 'Day · Switch to night';
    const previous = shots.value;
    shots.replaceChildren();
    if (current === 'atlantic_city') {
      shots.append(el('option', '', 'Boardwalk arrival'));
      shots.disabled = true;
    } else if (isCity(current)) {
      shots.disabled = false;
      shots.append(option('0', 'Landmark wide'), option('1', 'Reverse landmark wide'));
      shots.value = previous === '1' ? '1' : '0';
    } else {
      shots.disabled = false;
      stage.setLocation(current, time);
      for (const [id, mark] of previews[current]) stage.place(id, mark);
      const options: [string, string][] = [
        ...stage.sets[current].wides.map((w, i): [string, string] => [
          `wide:${i}`,
          w.label ?? (i === 0 ? 'Master wide' : i === 1 ? 'Conversation wide' : `Reverse wide ${i - 1}`),
        ]),
        ...previews[current].map(([id]): [string, string] => [`close:${id}`, `${stage.actors[id].def.name} · Close-up`]),
        ['two:forward', 'Two-shot'],
        ['two:reverse', 'Reverse two-shot'],
        ['shoulder:forward', 'Over the shoulder'],
        ['shoulder:reverse', 'Reverse shoulder'],
      ];
      for (const [value, name] of options) shots.append(option(value, name));
      if (options.some(([value]) => value === previous)) shots.value = previous;
    }
    updateShot();
  };
  places.addEventListener('change', () => {
    current = places.value as PreviewId;
    show();
  });
  shots.addEventListener('change', updateShot);
  daylight.addEventListener('click', () => {
    time = time === 'night' ? 'day' : 'night';
    show();
  });
  show();
  return true;
}

function option(value: string, text: string) {
  const o = el('option', '', text);
  o.value = value;
  return o;
}
