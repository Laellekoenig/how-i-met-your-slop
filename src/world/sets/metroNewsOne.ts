import * as THREE from 'three';
import { box, cyl, dressing, glow, mesh, occluder, roundedBox, toon } from '../../engine/materials';
import { metroNewsBackdrop, metroNewsLogo, monitorScreen, tiles, veneer } from '../../engine/textures';
import { door, fillLight, keyLight, mark, nodes, plant, room, type StageSet, v3 } from './common';
import { chair, label, mug } from './furnishings';

// Reference: Robin's desk in "Come On" (S01E22): sunset Manhattan, wood trim,
// black desktop, red Metro News 1 mugs. Original procedural scenery; see README.
export function buildMetroNewsOne(): StageSet {
  const g = new THREE.Group();
  g.name = 'metro_news_one';
  const wood = toon('#ffffff', { map: veneer('#87512f', [4, 1]) });
  const black = toon('#222630');
  const steel = toon('#b1bac0');
  // A broadcast studio is lit flat and bright: a grey floor and mid-blue flats, not a dark stage.
  room(g, { w: 13, d: 8, h: 3.8, floor: toon('#ffffff', { map: tiles('#4b535e', '#434b56', [10, 8]) }), back: toon('#2a4262'), ceiling: '#252d38' });

  // The printed skyline stays at dusk even during daytime broadcasts.
  g.add(mesh(box(8.5, 2.85, 0.12), wood, -0.65, 2.05, -3.92, false));
  g.add(mesh(new THREE.PlaneGeometry(8.2, 2.55), new THREE.MeshBasicMaterial({ map: metroNewsBackdrop() }), -0.65, 2.12, -3.845, false));
  for (const x of [-4.85, 3.55]) g.add(mesh(box(0.15, 3.25, 0.2), wood, x, 1.7, -3.79, false));
  g.add(mesh(box(8.5, 0.12, 0.28), wood, -0.65, 0.78, -3.75, false));
  for (const x of [-4.2, -2.5, 1.7, 3.0]) plant(g, x, -3.58, 0.65);

  // Two-anchor desk, with a dark top and broad wood fascia.
  g.add(occluder(mesh(roundedBox(4.8, 0.68, 1.15, 0.14), wood, -0.65, 0.38, -1.9)));
  g.add(occluder(mesh(roundedBox(5.05, 0.1, 1.35, 0.1), black, -0.65, 0.77, -1.9)));
  g.add(mesh(box(4.65, 0.055, 0.03), steel, -0.65, 0.67, -1.31, false));
  g.add(mesh(box(4.3, 0.35, 0.03), toon('#233b61'), -0.65, 0.4, -1.31, false));
  g.add(mesh(new THREE.PlaneGeometry(1.65, 0.4), new THREE.MeshBasicMaterial({ map: metroNewsLogo() }), -0.65, 0.4, -1.285, false));
  for (const x of [-1.85, 0.55]) {
    chair(g, x, -2.85, 0, '#222831');
    mug(g, x + 0.5, 0.83, -2.12);
    g.add(mesh(box(0.4, 0.012, 0.3), toon('#f8f3df'), x, 0.834, -1.95, false).rotateY(-0.12));
  }

  // A side monitor, crew entrance and red ON AIR practical.
  g.add(mesh(box(1.55, 0.72, 0.14), black, 5.05, 2.85, -3.8));
  g.add(mesh(new THREE.PlaneGeometry(1.4, 0.58), new THREE.MeshBasicMaterial({ map: metroNewsLogo() }), 5.05, 2.85, -3.72, false));
  const front = door(g, 5.05, -3.92, 0, '#4b5460', { frameColor: '#858b94', hinge: 1 });
  label(g, 'ON AIR', 5.05, 3.43, -3.8, 1.3, 0.28, '#fff1dd', '#ad292b', 'bold 46px Helvetica');
  label(g, 'STUDIO A', 5.05, 1.7, -3.79, 0.68, 0.17);

  // Studio cameras stay outside the central aisle and the anchors' sightlines.
  for (const [x, z, rot] of [[-4.7, 0.6, -0.45], [3.85, 0.7, 0.5]]) {
    const c = new THREE.Group();
    c.position.set(x, 0, z); c.rotation.y = rot;
    c.add(mesh(cyl(0.07, 0.09, 1.25), steel, 0, 0.67, 0, false));
    for (const angle of [0, 2.1, 4.2])
      c.add(mesh(box(0.055, 0.06, 0.85), black, Math.sin(angle) * 0.25, 0.09, Math.cos(angle) * 0.25, false).rotateY(angle));
    c.add(occluder(mesh(box(0.48, 0.38, 0.65), black, 0, 1.5, 0)));
    c.add(mesh(cyl(0.12, 0.14, 0.25), black, 0, 1.52, -0.43, false).rotateX(Math.PI / 2));
    c.add(mesh(box(0.62, 0.36, 0.06), black, 0, 1.2, -0.47, false));
    c.add(mesh(new THREE.PlaneGeometry(0.37, 0.25), toon('#ffffff', { map: monitorScreen(152), emissive: '#ffffff', emissiveIntensity: 0.4 }), 0, 1.52, 0.331, false));
    c.add(mesh(box(0.1, 0.045, 0.06), glow('#f74c40'), 0, 1.72, -0.1, false));
    g.add(dressing(c));
  }
  // The lighting grid: soft boxes over the desk and the floor, all on for the broadcast.
  for (const [x, z] of [[-3.7, -0.6], [0, -0.6], [3.7, -0.6], [-2.2, 2.2], [2.2, 2.2]]) {
    g.add(mesh(box(0.7, 0.18, 0.48), black, x, 3.55, z, false));
    g.add(mesh(box(0.59, 0.025, 0.36), glow('#fff0d5'), x, 3.45, z, false));
    const l = new THREE.PointLight('#fff2de', 1.3, 7, 1.4);
    l.position.set(x, 3.3, z);
    g.add(l);
  }
  const hemi = new THREE.HemisphereLight('#f0f3ff', '#5e5250', 1.8); g.add(hemi);
  keyLight(g, '#fff3e2', 2.6, [0.5, 6.5, 5], [-0.6, 1, -2.4]);
  // A fill from the upstage grid for anyone turned toward the desk (the camera operators), and the anchors' backlight.
  fillLight(g, '#e2eaff', 1.1, [0.5, 5, -7], [0, 1, 2]);
  const N = nodes({ door: [5.05, -3.3], right: [3, -3.42], behind: [-0.65, -3.42], left: [-3.5, -3.42], left_front: [-3.5, -0.5], center: [0, 0], right_front: [2.8, -0.3], camera_side: [4.8, -0.3], camera: [4.8, 1.65] });
  return {
    id: 'metro_news_one', name: 'Metro News One', group: g, nodes: N,
    edges: [['door', 'right'], ['right', 'behind'], ['behind', 'left'], ['left', 'left_front'], ['left_front', 'center'], ['center', 'right_front'], ['right_front', 'right'], ['right_front', 'camera_side'], ['camera_side', 'camera']],
    door: 'door',
    doors: { door: front }, reserved: ['camera_operator'],
    marks: {
      anchor_left: mark(-1.85, -2.8, 0, 'behind', "Robin's anchor chair behind the news desk", { seat: 0.47, approach: [-1.85, -3.42] }),
      anchor_right: mark(0.55, -2.8, 0, 'behind', 'co-anchor or interview guest at the news desk', { seat: 0.47, approach: [0.55, -3.42] }),
      desk_side: mark(-3.55, -1.8, 0.5, 'left', 'standing beside the anchor desk'),
      monitor: mark(3.1, -2.5, -0.3, 'right', 'presenting beside the studio monitor'),
      center: mark(0, 0, 0, 'center', 'open studio floor in front of the cameras'),
      camera_operator: mark(4.4, 1.65, Math.PI, 'camera', 'operating the studio camera'),
      door: mark(5.05, -3.5, 0, 'door', 'crew entrance beside the ON AIR sign'),
    },
    wides: [
      { pos: v3(2.5, 2.0, 8.5), target: v3(0.9, 1.5, -2.2), fov: 34 },
      { pos: v3(-0.65, 1.75, 3.5), target: v3(-0.65, 1.2, -2.5), fov: 46 },
      { pos: v3(-2.5, 1.9, 4.5), target: v3(2.1, 1.35, -2.5), fov: 48 },
    ],
    ambience: 'office', background: [], doorSound: 'none',
    setTime(t) { hemi.intensity = t === 'day' ? 1.9 : 1.8; },
  };
}
