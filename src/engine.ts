import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { activeCamera, isObjectVisible, sampleCamera, sampleObject, type CameraKey, type ObjectKey, type Project, type Vec3 } from './model';

type Callbacks = { select: (id: string, additive: boolean) => void; transform: (id: string, key: ObjectKey | CameraKey) => void; transformGroup: (id: string, move: Vec3, turn: Vec3) => void; error: (message: string) => void; beginEdit?: () => void; endEdit?: () => void };
const deg = THREE.MathUtils.radToDeg;
export class SceneEngine {
  scene = new THREE.Scene();
  editor = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  renderer: THREE.WebGLRenderer;
  preview: THREE.WebGLRenderer;
  orbit: OrbitControls;
  transform: TransformControls;
  helpers = new THREE.Group();
  cameraRig = new THREE.Group();
  groupRig = new THREE.Group();
  frustum: THREE.CameraHelper;
  private helperCamera = new THREE.PerspectiveCamera();
  objects = new Map<string, THREE.Group>();
  pending = new Set<Promise<void>>();
  failures = new Map<string, string>();
  selected = '';
  selectedIds: string[] = [];
  time = 0;
  project!: Project;
  exporting = false;
  showCamera = false;
  hasActiveCamera = true;
  private raf = 0;
  private disposed = false;
  private resize: ResizeObserver;
  private selection = new THREE.BoxHelper(new THREE.Object3D(), 0xe7b57b);
  private secondarySelections = new Map<string, THREE.BoxHelper>();
  private groupDragLast: { position: THREE.Vector3; rotation: THREE.Euler } | null = null;
  constructor(private host: HTMLElement, private previewHost: HTMLElement, private assets: Map<string, string>, private callbacks: Callbacks) {
    this.scene.background = new THREE.Color('#20272b');
    this.scene.fog = new THREE.Fog('#20272b', 35, 95);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.preview = new THREE.WebGLRenderer({ antialias: true });
    for (const renderer of [this.renderer, this.preview]) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      host.setAttribute('data-webgl', 'ready');
    }
    this.renderer.domElement.setAttribute('aria-label', '3D編集ビュー');
    this.preview.domElement.setAttribute('aria-label', '本番カメラプレビュー');
    host.append(this.renderer.domElement); previewHost.append(this.preview.domElement);
    this.editor.position.set(9, 6.5, 11);
    this.orbit = new OrbitControls(this.editor, this.renderer.domElement);
    this.orbit.target.set(0, 1, 0); this.orbit.enableDamping = false;
    this.scene.add(new THREE.HemisphereLight(0xe2efff, 0x55524a, 2.5));
    const sun = new THREE.DirectionalLight(0xffecd5, 3.2); sun.position.set(5, 12, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18 }); sun.shadow.normalBias = 0.03; this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#303a3e', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.025; ground.receiveShadow = true; this.scene.add(ground);
    const grid = new THREE.GridHelper(100, 100, 0x687777, 0x424e52); this.helpers.add(grid, new THREE.AxesHelper(2));
    this.cameraRig.userData.id = 'camera-1';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.4), new THREE.MeshStandardMaterial({ color: '#a6c88a' }));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#738c62' })); lens.rotation.x = Math.PI / 2; lens.position.z = -0.3;
    this.cameraRig.add(body, lens); this.helpers.add(this.cameraRig);
    const groupPivot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), new THREE.MeshBasicMaterial({ color: '#e8b880', depthTest: false }));
    groupPivot.renderOrder = 10; this.groupRig.add(groupPivot); this.groupRig.visible = false; this.helpers.add(this.groupRig);
    this.frustum = new THREE.CameraHelper(this.helperCamera);
    this.frustum.setColors(new THREE.Color('#75876d'), new THREE.Color('#a1b58c'), new THREE.Color('#839777'), new THREE.Color('#637563'), new THREE.Color('#637563'));
    this.helpers.add(this.frustum);
    this.selection.visible = false; this.helpers.add(this.selection); this.scene.add(this.helpers, this.camera);
    this.transform = new TransformControls(this.editor, this.renderer.domElement);
    this.transform.setSize(0.85); this.helpers.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', event => {
      this.orbit.enabled = !event.value;
      if (event.value) {
        if (this.transform.object === this.groupRig) this.groupDragLast = { position: this.groupRig.position.clone(), rotation: this.groupRig.rotation.clone() };
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); this.callbacks.beginEdit?.();
      } else { this.groupDragLast = null; this.callbacks.endEdit?.(); }
    });
    this.transform.addEventListener('objectChange', () => {
      const node = this.transform.object; if (!node || !this.project) return;
      const position = node.position.toArray() as Vec3;
      const selectedGroup = this.project.groups.find(group => group.id === this.selected);
      if (selectedGroup && node === this.groupRig) {
        const previous = this.groupDragLast; if (!previous) return;
        const move = node.position.clone().sub(previous.position).toArray() as Vec3;
        const turn: Vec3 = [deg(node.rotation.x - previous.rotation.x), deg(node.rotation.y - previous.rotation.y), deg(node.rotation.z - previous.rotation.z)];
        this.groupDragLast = { position: node.position.clone(), rotation: node.rotation.clone() };
        this.callbacks.transformGroup(selectedGroup.id, move, turn); return;
      }
      const selectedCamera = this.project.cameras.find(camera => camera.id === this.selected);
      if (selectedCamera) {
        const current = sampleCamera(selectedCamera.keyframes, this.time);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(node.quaternion).multiplyScalar(Math.max(0.1, new THREE.Vector3(...current.position).distanceTo(new THREE.Vector3(...current.target))));
        this.callbacks.transform(selectedCamera.id, { ...current, position, target: direction.add(node.position).toArray() as Vec3 });
      } else {
        const object = this.project.objects.find(o => o.id === this.selected);
        this.callbacks.transform(this.selected, { time: this.time, position, rotation: [deg(node.rotation.x), deg(node.rotation.y), deg(node.rotation.z)], easing: object ? sampleObject(object.keyframes, this.time).easing : 'linear' });
      }
    });
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.resize = new ResizeObserver(() => this.resizeViews()); this.resize.observe(host); this.resize.observe(previewHost);
    const frame = () => { if (this.disposed) return; this.raf = requestAnimationFrame(frame); if (this.exporting) return; this.orbit.update(); this.render(); }; frame();
  }
  private down = { x: 0, y: 0, gizmo: false };
  private pointerDown = (event: PointerEvent) => { this.down = { x: event.clientX, y: event.clientY, gizmo: !!this.transform.axis }; };
  private pointerUp = (event: PointerEvent) => {
    if (this.showCamera || event.button !== 0 || this.down.gizmo || Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 4) return;
    const rect = this.renderer.domElement.getBoundingClientRect(); const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.editor);
    const pickable = [...this.objects.values()].filter(node => node.visible).concat(this.cameraRig);
    if (this.groupRig.visible) pickable.push(this.groupRig);
    const hits = ray.intersectObjects(pickable, true);
    if (hits.length) { let node: THREE.Object3D | null = hits[0].object; while (node && !node.userData.id) node = node.parent; if (node) this.callbacks.select(node.userData.id, event.shiftKey); }
  };
  resizeViews() {
    const { width, height } = this.host.getBoundingClientRect();
    const size = this.renderer.getSize(new THREE.Vector2());
    if (width && height && (size.x !== width || size.y !== height)) { this.renderer.setSize(width, height); this.editor.aspect = width / height; this.editor.updateProjectionMatrix(); }
    const w = this.previewHost.clientWidth, h = w / (this.camera.aspect || 16 / 9), previewSize = this.preview.getSize(new THREE.Vector2());
    if (w && (previewSize.x !== w || previewSize.y !== h)) this.preview.setSize(w, h);
  }
  sync(project: Project, time: number, selected: string, selectedIds: string[], mode: 'translate' | 'rotate', cameraView: boolean) {
    this.project = project; this.time = time; this.selected = selected; this.selectedIds = selectedIds; this.showCamera = cameraView;
    this.orbit.enabled = !cameraView && !this.transform.dragging;
    for (const [id, node] of this.objects) if (!project.objects.some(o => o.id === id && o.asset === node.userData.asset)) { this.transform.detach(); this.scene.remove(node); disposeNode(node); this.objects.delete(id); this.failures.delete(id); }
    for (const object of project.objects) {
      let node = this.objects.get(object.id);
      if (!node) {
        node = new THREE.Group(); node.userData = { id: object.id, asset: object.asset }; this.objects.set(object.id, node); this.scene.add(node);
        if (object.asset.startsWith('primitive:')) node.add(makePrimitive(object.asset));
        else {
          const root = node; const url = this.assets.get(object.asset);
          if (!url) { this.failures.set(object.id, `Missing asset: ${object.asset}`); this.callbacks.error(`Missing asset: ${object.asset}`); root.add(makeMissing()); }
          else {
            let task: Promise<void>;
            task = new GLTFLoader().loadAsync(url).then(gltf => {
              if (this.disposed || this.objects.get(object.id) !== root) { disposeNode(gltf.scene); return; }
              root.add(gltf.scene); colorNode(root, this.project.objects.find(o => o.id === object.id)?.color ?? object.color);
            }).catch(() => { if (this.objects.get(object.id) === root) { const message = `GLBの読み込みに失敗: ${object.asset}`; this.failures.set(object.id, message); root.add(makeMissing()); this.callbacks.error(message); } }).finally(() => this.pending.delete(task));
            this.pending.add(task);
          }
        }
      }
      if (node.userData.color !== object.color) { colorNode(node, object.color); node.userData.color = object.color; }
    }
    this.applyTime(time);
    const selectedCamera = project.cameras.find(camera => camera.id === selected);
    const selectedGroup = project.groups.find(group => group.id === selected);
    this.cameraRig.userData.id = selectedCamera?.id ?? '';
    this.groupRig.userData.id = selectedGroup?.id ?? '';
    const target = selectedGroup ? this.groupRig : selectedCamera ? this.cameraRig : this.objects.get(selected);
    this.transform.setMode(mode);
    if (target?.visible && !cameraView) { if (this.transform.object !== target) this.transform.attach(target); }
    else this.transform.detach();
    this.resizeViews();
  }
  applyTime(time: number) {
    if (!this.project) return;
    for (const object of this.project.objects) {
      const node = this.objects.get(object.id); if (!node) continue;
      node.visible = isObjectVisible(object, time, this.project.duration);
      if (this.transform.dragging && this.transform.object === node && !this.exporting) continue;
      const key = sampleObject(object.keyframes, time); node.position.fromArray(key.position); node.rotation.set(...key.rotation.map(THREE.MathUtils.degToRad) as Vec3); node.scale.fromArray(object.scale.map(value => value * object.uniformScale) as Vec3);
    }
    const liveCamera = activeCamera(this.project, time); this.hasActiveCamera = !!liveCamera;
    if (liveCamera) {
      const key = sampleCamera(liveCamera.keyframes, time);
      this.camera.position.fromArray(key.position); this.camera.lookAt(new THREE.Vector3(...key.target)); this.camera.fov = key.fov; this.camera.aspect = this.project.resolution.width / this.project.resolution.height; this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    }
    const selectedCamera = this.project.cameras.find(camera => camera.id === this.selected);
    this.cameraRig.visible = !!selectedCamera;
    this.frustum.visible = !!selectedCamera;
    if (selectedCamera) {
      const key = sampleCamera(selectedCamera.keyframes, time);
      this.helperCamera.position.fromArray(key.position); this.helperCamera.lookAt(new THREE.Vector3(...key.target)); this.helperCamera.fov = key.fov; this.helperCamera.aspect = this.project.resolution.width / this.project.resolution.height; this.helperCamera.far = 4; this.helperCamera.updateProjectionMatrix(); this.helperCamera.updateMatrixWorld(); this.frustum.update();
      if (!this.transform.dragging || this.transform.object !== this.cameraRig) { this.cameraRig.position.copy(this.helperCamera.position); this.cameraRig.quaternion.copy(this.helperCamera.quaternion); }
    }
    const selectedGroup = this.project.groups.find(group => group.id === this.selected);
    const members = selectedGroup?.objectIds.map(id => this.objects.get(id)).filter((node): node is THREE.Group => !!node?.visible) ?? [];
    this.groupRig.visible = members.length > 0;
    if (members.length && (!this.transform.dragging || this.transform.object !== this.groupRig)) {
      const center = members.reduce((sum, node) => sum.add(node.position), new THREE.Vector3()).multiplyScalar(1 / members.length);
      this.groupRig.position.copy(center); this.groupRig.rotation.set(0, 0, 0);
    }
    const selected = selectedGroup ? this.groupRig : selectedCamera ? this.cameraRig : this.objects.get(this.selected);
    this.selection.visible = !!selected?.visible;
    if (selected) this.selection.setFromObject(selected);
    const secondaryIds = new Set(selectedGroup ? selectedGroup.objectIds : this.selectedIds.slice(1));
    for (const [id, box] of this.secondarySelections) if (!secondaryIds.has(id) || !this.objects.get(id)?.visible) { this.helpers.remove(box); disposeNode(box); this.secondarySelections.delete(id); }
    for (const id of secondaryIds) { const node = this.objects.get(id); if (!node?.visible) continue; let box = this.secondarySelections.get(id); if (!box) { box = new THREE.BoxHelper(node, 0x7db9ce); this.secondarySelections.set(id, box); this.helpers.add(box); } box.setFromObject(node); }
  }
  render() {
    this.helpers.visible = !this.showCamera;
    if (this.showCamera) {
      const size = this.renderer.getSize(new THREE.Vector2()); const w = Math.min(size.x, size.y * this.camera.aspect), h = w / this.camera.aspect;
      this.renderer.setViewport(0, 0, size.x, size.y); this.renderer.setClearColor(0x000000); this.renderer.clear(); this.renderer.setViewport((size.x - w) / 2, (size.y - h) / 2, w, h); if (this.hasActiveCamera) this.renderer.render(this.scene, this.camera); else this.renderer.clear(); this.renderer.setViewport(0, 0, size.x, size.y);
    } else this.renderer.render(this.scene, this.editor);
    this.helpers.visible = false; if (this.hasActiveCamera) this.preview.render(this.scene, this.camera); else { this.preview.setClearColor(0x000000); this.preview.clear(); } this.helpers.visible = true;
  }
  focus() {
    const group = this.project?.groups.find(value => value.id === this.selected), nodes = group?.objectIds.map(id => this.objects.get(id)).filter((node): node is THREE.Group => !!node?.visible) ?? [];
    const node = this.objects.get(this.selected); const target = nodes.length ? nodes.reduce((sum, value) => sum.add(value.position), new THREE.Vector3()).multiplyScalar(1 / nodes.length) : node ? new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 1, 0);
    this.orbit.target.copy(target); this.editor.position.copy(target).add(new THREE.Vector3(7, 5, 8)); this.orbit.update();
  }
  async exportMP4(onProgress: (progress: number) => void, signal: AbortSignal): Promise<Blob> {
    await Promise.all(this.pending);
    if (this.failures.size) throw new Error('読み込めないGLBがあります。アセットを確認してから書き出してください。');
    const { Output, BufferTarget, CanvasSource, Mp4OutputFormat, canEncodeVideo } = await import('mediabunny');
    const { width, height } = this.project.resolution; const fps = this.project.fps;
    if (!await canEncodeVideo('avc', { width, height, bitrate: 6_000_000 })) throw new Error('このブラウザはH.264書き出しに対応していません。最新のChromeまたはEdgeで開いてください。');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(width, height); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const source = new CanvasSource(renderer.domElement, { codec: 'avc', bitrate: 6_000_000 }); output.addVideoTrack(source, { frameRate: fps });
    this.exporting = true;
    try {
      await output.start(); const frames = Math.ceil(this.project.duration * fps);
      for (let frame = 0; frame < frames; frame++) {
        if (signal.aborted) throw new Error('書き出しをキャンセルしました。');
        this.applyTime(frame / fps); this.helpers.visible = false; if (this.hasActiveCamera) renderer.render(this.scene, this.camera); else { renderer.setClearColor(0x000000); renderer.clear(); }
        await source.add(frame / fps, Math.min(1 / fps, this.project.duration - frame / fps));
        onProgress((frame + 1) / frames);
        if (frame % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      await output.finalize(); return new Blob([output.target.buffer!], { type: 'video/mp4' });
    } catch (error) { await output.cancel(); throw error; }
    finally { source.close(); renderer.dispose(); renderer.forceContextLoss(); this.exporting = false; this.helpers.visible = true; this.applyTime(this.time); }
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.resize.disconnect(); this.orbit.dispose(); this.transform.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown); this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
    disposeNode(this.scene); this.renderer.dispose(); this.preview.dispose(); this.renderer.forceContextLoss(); this.preview.forceContextLoss(); this.renderer.domElement.remove(); this.preview.domElement.remove();
  }
}
function colorNode(root: THREE.Object3D, color: string) {
  root.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; if (node.userData.fixedColor) return; for (const material of Array.isArray(node.material) ? node.material : [node.material]) if ('color' in material && material.color instanceof THREE.Color) material.color.set(color); } });
}
function disposeNode(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) { node.geometry?.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); } } }); textures.forEach(t => t.dispose());
}
function makeMissing() { const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff6680', wireframe: true })); mesh.position.y = 0.5; mesh.userData.fixedColor = true; return mesh; }
function makePrimitive(asset: string): THREE.Group {
  const group = new THREE.Group(); const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72 });
  const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  if (asset === 'primitive:box') add(new THREE.BoxGeometry(1.2, 1.2, 1.2), 0, 0.6, 0);
  else if (asset === 'primitive:sphere') add(new THREE.SphereGeometry(0.65, 32, 20), 0, 0.65, 0);
  else if (asset === 'primitive:cylinder') add(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 32), 0, 0.7, 0);
  else if (asset === 'primitive:triangle') {
    const shape = new THREE.Shape(); shape.moveTo(-0.7, 0); shape.lineTo(0.7, 0); shape.lineTo(0, 1.25); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: false }); geometry.translate(0, 0, -0.12); add(geometry, 0, 0, 0);
  }
  else if (asset === 'primitive:tetrahedron') add(new THREE.TetrahedronGeometry(0.85), 0, 0.7, 0);
  else {
    add(new THREE.SphereGeometry(0.23, 24, 16), 0, 1.8, 0);
    add(new THREE.CapsuleGeometry(0.23, 0.45, 8, 16), 0, 1.26, 0).scale.z = 0.7;
    for (const side of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.09, 0.46, 6, 12), side * 0.35, 1.23, 0).rotation.z = side * 0.12;
      add(new THREE.CapsuleGeometry(0.11, 0.63, 6, 12), side * 0.15, 0.5, 0);
      add(new THREE.BoxGeometry(0.2, 0.12, 0.35), side * 0.15, 0.08, 0.065);
    }
    const face = add(new THREE.BoxGeometry(0.18, 0.065, 0.09), 0, 1.82, 0.22); face.material = new THREE.MeshStandardMaterial({ color: '#283136' }); face.userData.fixedColor = true;
    const nose = add(new THREE.ConeGeometry(0.05, 0.15, 3), 0, 1.75, 0.25); nose.rotation.x = Math.PI / 2;
  }
  return group;
}
