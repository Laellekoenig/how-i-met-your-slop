import * as THREE from 'three';

// Shared toon materials + low-poly geometry helpers.

let gradient: THREE.DataTexture | null = null;
function gradientMap() {
  if (gradient) return gradient;
  const steps = new Uint8Array([70, 140, 205, 255]);
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.Material>();

export function toon(color: THREE.ColorRepresentation, opts: { map?: THREE.Texture; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; key?: string; side?: THREE.Side } = {}) {
  const key = opts.key ?? (opts.map ? '' : `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.side ?? ''}`);
  if (key && cache.has(key)) return cache.get(key)!;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(),
    map: opts.map ?? null,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    // glowing textures (windows, screens) should glow with their own colors
    emissiveMap: opts.map && opts.emissive ? opts.map : null,
    side: opts.side ?? THREE.FrontSide,
  });
  if (key) cache.set(key, m);
  return m;
}

export function glow(color: THREE.ColorRepresentation, intensity = 1) {
  const key = `glow|${new THREE.Color(color).getHexString()}|${intensity}`;
  if (cache.has(key)) return cache.get(key)!;
  const c = new THREE.Color(color).multiplyScalar(intensity);
  const m = new THREE.MeshBasicMaterial({ color: c });
  cache.set(key, m);
  return m;
}

/** Box with chamfered/rounded edges and flat (faceted) normals. */
export function roundedBox(w: number, h: number, d: number, r = 0.02, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg + 1, seg + 1, seg + 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    const dir = v.clone().sub(inner);
    if (dir.lengthSq() > 1e-9) v.copy(inner).add(dir.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  g.dispose();
  return ng;
}

export function box(w: number, h: number, d: number) {
  return new THREE.BoxGeometry(w, h, d);
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

/** Faceted cylinder (low segment count gives the low-poly look). */
export function cyl(rTop: number, rBot: number, h: number, seg = 8) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

/** Set dressing a single mustn't be framed through or beside: a potted plant, a studio camera. Tags every mesh under
 *  `o`. (All scenery blocks the camera's view anyway; dressing also spoils a single from level with the subject.) */
export function dressing<T extends THREE.Object3D>(o: T): T {
  o.traverse((m) => (m.userData.dressing = true));
  return o;
}

/** Mark meshes that should block the camera's view (for shot selection). */
export function occluder<T extends THREE.Object3D>(o: T): T {
  o.userData.occluder = true;
  return o;
}
