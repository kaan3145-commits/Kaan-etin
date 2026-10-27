import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildModelGroup, disposeGroup, type SolidObject } from '../../render/sceneBuilder';
import { useModel } from '../../state/derived';
import { type ViewPreset, useStore } from '../../state/store';
import { blurFormFocus } from '../util/download';

const VIEW_DIRS: Record<ViewPreset, { dir: THREE.Vector3; up: THREE.Vector3 }> = {
  // true isometric: equal angles to X, Y and Z, seen from front-right-above
  iso: { dir: new THREE.Vector3(1, -1, 1).normalize(), up: new THREE.Vector3(0, 0, 1) },
  front: { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  top: { dir: new THREE.Vector3(0, -1e-4, 1).normalize(), up: new THREE.Vector3(0, 0, 1) },
  right: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
};

const SELECT_COLOR = new THREE.Color('#ff8a00');
const HOVER_EMISSIVE = new THREE.Color('#2a3b55');

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  group: THREE.Group | null;
  objects: SolidObject[];
  frustum: number;
  render: () => void;
}

export function Viewer3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<Ctx | null>(null);
  const model = useModel();
  const selection = useStore((s) => s.selection);
  const hover = useStore((s) => s.hover);
  const viewPreset = useStore((s) => s.viewPreset);
  const fittedFacade = useRef<string | null>(null);

  // one-time renderer setup
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x1d2024);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3000, -5000, 6000);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-4000, -2000, 1000);
    scene.add(fill);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;

    const ctx: Ctx = {
      renderer,
      scene,
      camera,
      controls,
      group: null,
      objects: [],
      frustum: 6000,
      render: () => renderer.render(scene, camera),
    };
    ctxRef.current = ctx;
    controls.addEventListener('change', ctx.render);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h);
      const aspect = w / h;
      camera.left = (-ctx.frustum * aspect) / 2;
      camera.right = (ctx.frustum * aspect) / 2;
      camera.top = ctx.frustum / 2;
      camera.bottom = -ctx.frustum / 2;
      camera.updateProjectionMatrix();
      ctx.render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // click-to-select (ignores drags)
    let down: { x: number; y: number } | null = null;
    const ray = new THREE.Raycaster();
    const pick = (ev: PointerEvent): SolidObject | undefined => {
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(ctx.objects.map((o) => o.mesh), false);
      return ctx.objects.find((o) => o.mesh === hits[0]?.object);
    };
    const onDown = (ev: PointerEvent) => {
      blurFormFocus();
      down = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 4) return;
      const hit = pick(ev);
      const { select } = useStore.getState();
      if (!hit) select(null);
      else if (hit.solid.semantic === 'wall') select({ kind: 'facade', id: hit.solid.facadeId });
      else select({ kind: 'solid', id: hit.solid.id, regionId: hit.solid.regionId });
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons) return;
      const hit = pick(ev);
      const id = hit && hit.solid.semantic !== 'wall' ? hit.solid.id : null;
      if (useStore.getState().hover !== id) useStore.getState().setHover(id);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);

    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      if (ctx.group) disposeGroup(ctx.group);
      renderer.dispose();
      renderer.domElement.remove();
      ctxRef.current = null;
    };
  }, []);

  const applyView = (preset: ViewPreset) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const f = model.facade;
    const center = new THREE.Vector3(f.origin.x + f.width / 2, f.origin.y, f.origin.z + f.height / 2);
    const radius = Math.hypot(f.width, f.height, f.wallThickness + 600) / 2;
    const { dir, up } = VIEW_DIRS[preset];
    ctx.camera.up.copy(up);
    ctx.camera.position.copy(center.clone().add(dir.clone().multiplyScalar(radius * 6)));
    ctx.camera.near = 1;
    ctx.camera.far = radius * 20;
    ctx.frustum = radius * 2.3;
    ctx.camera.zoom = 1;
    ctx.controls.target.copy(center);
    const host = hostRef.current!;
    const aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
    ctx.camera.left = (-ctx.frustum * aspect) / 2;
    ctx.camera.right = (ctx.frustum * aspect) / 2;
    ctx.camera.top = ctx.frustum / 2;
    ctx.camera.bottom = -ctx.frustum / 2;
    ctx.camera.updateProjectionMatrix();
    ctx.controls.update();
    ctx.render();
  };

  // rebuild scene objects whenever the derived model changes
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.group) {
      ctx.scene.remove(ctx.group);
      disposeGroup(ctx.group);
    }
    const { group, objects } = buildModelGroup(model);
    ctx.scene.add(group);
    ctx.group = group;
    ctx.objects = objects;
    if (fittedFacade.current !== model.facade.id) {
      fittedFacade.current = model.facade.id;
      applyView(useStore.getState().viewPreset.preset);
    }
    ctx.render();
  }, [model]);

  // highlight
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    for (const o of ctx.objects) {
      const mat = o.mesh.material as THREE.MeshStandardMaterial;
      const edgeMat = o.edges.material as THREE.LineBasicMaterial;
      const selected =
        (selection?.kind === 'solid' && selection.id === o.solid.id) ||
        (selection?.kind === 'region' && selection.id === o.solid.regionId) ||
        (selection?.kind === 'facade' && o.solid.semantic === 'wall' && selection.id === o.solid.facadeId);
      mat.emissive.copy(selected ? SELECT_COLOR.clone().multiplyScalar(0.35) : hover === o.solid.id ? HOVER_EMISSIVE : new THREE.Color(0));
      edgeMat.color.set(selected ? SELECT_COLOR : o.solid.semantic === 'wall' ? 0x777777 : 0x2a2a2a);
    }
    ctx.render();
  }, [selection, hover, model]);

  useEffect(() => {
    applyView(viewPreset.preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPreset]);

  return <div ref={hostRef} className="viewer3d" data-testid="viewer3d" />;
}
