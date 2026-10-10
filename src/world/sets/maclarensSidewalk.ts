import * as THREE from 'three';
import { box, mesh, toon } from '../../engine/materials';
import { facade, road, skyGradient, tiles } from '../../engine/textures';
import { fillLight, keyLight, mark, nodes, type StageSet, v3 } from './common';
import { buildWalkupExterior } from './walkupExterior';

/** Playable sidewalk in front of the same basement pub / raised apartment entrance. */
export function buildMaclarensSidewalk(): StageSet {
  const g = new THREE.Group();
  g.name = 'maclarens_sidewalk';
  const swaps: { m: THREE.Mesh; day: THREE.Material; night: THREE.Material }[] = [];
  const lights: [THREE.Light, number][] = [];
  const dn = (m: THREE.Mesh, day: THREE.Material, night: THREE.Material) => {
    swaps.push({ m, day, night });
    return m;
  };
  buildWalkupExterior(g, dn, lights, -3.2, 2.4);
  // Neighbouring facades and the opposite block are needed for actual reverse dialogue shots.
  // Overlap the corners of the block: separated flat cards expose strips of sky
  // all the way down to the pavement in oblique and reverse angles.
  for (const [x, z, w, rot] of [
    [-14, -4.4, 17, 0],
    [14, -4.4, 17, 0],
    [0, 17, 45, Math.PI],
    [-22, 6.3, 22, Math.PI / 2],
    [22, 6.3, 22, -Math.PI / 2],
  ]) {
    const day = toon('#ffffff', { map: facade(false, '#847768', 23 + Math.abs(x), Math.round(w), 7) });
    const night = toon('#ffffff', {
      map: facade(true, '#605850', 23 + Math.abs(x), Math.round(w), 7),
      emissive: '#d6b482',
      emissiveIntensity: 0.3,
    });
    const p = dn(mesh(new THREE.PlaneGeometry(w, 17), day, x, 8.5, z, false).rotateY(rot), day, night);
    g.add(p);
  }
  for (const x of [-13.5, 13.5])
    g.add(mesh(box(16, 0.16, 6.8), toon('#ffffff', { map: tiles('#929087', '#74756e', [8, 4]) }), x, 0.08, -1));
  g.add(mesh(new THREE.PlaneGeometry(46, 20), toon('#ffffff', { map: road() }), 0, -0.02, 12, false).rotateX(-Math.PI / 2));
  g.add(mesh(box(46, 0.16, 2.8), toon('#939086'), 0, 0.08, 15.6));
  for (let x = -20; x < 23; x += 5) g.add(mesh(box(2.4, 0.008, 0.1), toon('#b9aa70'), x, -0.009, 8.4));
  // A full sky dome supports upward angles without a flat black void.
  const skyDay = new THREE.MeshBasicMaterial({ map: skyGradient(false), side: THREE.BackSide });
  const skyNight = new THREE.MeshBasicMaterial({ map: skyGradient(true), side: THREE.BackSide });
  // An enclosing sky is a camera backdrop, never a navigation obstacle.
  const sky = dn(mesh(new THREE.SphereGeometry(48, 24, 12), skyDay, 0, 0, 0, false), skyDay, skyNight);
  sky.userData.cameraBackdrop = true;
  g.add(sky);
  const hemi = new THREE.HemisphereLight('#c4d9e5', '#67604e', 2);
  g.add(hemi);
  const sun = keyLight(g, '#ffdeb4', 2.5, [-8, 14, 10], [0, 1, -2]);
  // Faces turned toward the buildings: lit by the windows, the pub sign and the stoop lamps at night, and the
  // sunlit street bouncing back off the brick by day.
  const glowFill = fillLight(g, '#ffd9a8', 0, [1, 5, -9], [0, 1, 2]);
  return {
    id: 'maclarens_sidewalk',
    name: 'MacLaren’s Sidewalk',
    group: g,
    nodes: nodes({
      door: [-0.55, -1.35],
      pub: [-2.1, -0.7],
      left: [-3.8, 0.55],
      center: [0, 0.8],
      stoop: [1.3, 0.15],
      right: [3.7, 0.55],
      curb: [1.3, 1.9],
    }),
    edges: [
      ['door', 'pub'],
      ['pub', 'left'],
      ['pub', 'center'],
      ['center', 'stoop'],
      ['center', 'right'],
      ['center', 'curb'],
      ['right', 'curb'],
    ],
    door: 'door',
    floorAt() {
      return 0.16;
    },
    marks: {
      pub: mark(-2.1, -0.7, 0.25, 'pub', 'outside the basement pub rail'),
      friend: mark(-0.95, 0.15, -0.6, 'center', 'talking outside MacLaren’s'),
      stoop: mark(1.3, -0.4, 0, 'stoop', 'at the foot of the apartment steps'),
      stoop_friend: mark(2.25, 0.4, -0.8, 'right', 'beside the apartment stoop'),
      curb: mark(1.3, 1.9, Math.PI, 'curb', 'hailing a cab from the curb'),
      tree: mark(-3.8, 0.55, 0.4, 'left', 'beside the street tree and parking meter'),
      right: mark(3.7, 0.55, -0.4, 'right', 'coming down the block past the bins'),
      door: mark(-0.55, -1.35, 0, 'door', 'at the top of the pub’s descending stairs'),
    },
    wides: [
      { pos: v3(-0.5, 2.65, 10.3), target: v3(-0.25, 1.8, -2.2), fov: 50 },
      { pos: v3(-4.2, 2.1, 5), target: v3(0.5, 1.5, -0.5), fov: 51 },
      { pos: v3(-0.1, 2.15, -1.1), target: v3(1.2, 1.3, 2.6), fov: 56 },
    ],
    ambience: 'city',
    background: [],
    maxTwoShotDistance: 5,
    doorSound: 'none',
    setTime(t) {
      const night = t === 'night';
      for (const s of swaps) s.m.material = night ? s.night : s.day;
      for (const [l, i] of lights) l.intensity = night ? i : 0;
      hemi.intensity = night ? 1.5 : 2;
      hemi.color.set(night ? '#8c9bc4' : '#c4d9e5');
      sun.intensity = night ? 1.2 : 2.5;
      glowFill.intensity = night ? 1.1 : 0.8;
    },
  };
}
