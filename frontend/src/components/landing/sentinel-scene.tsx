"use client";

/**
 * "Sentinel": the 3D robot behind the /welcome page. Loaded with next/dynamic (ssr: false) from
 * landing-page.tsx, so three.js is downloaded on /welcome only.
 *
 * - Decorative: the host is aria-hidden; every meaning (verdicts, scenario outcomes) is in the HTML.
 * - Camera follows scroll between three states (intro, product close-up, scenarios), eased by
 *   lib/landing/camera.ts and damped per frame. Pointer parallax, idle bob, head sway and blink.
 * - Reduced motion: fixed intro camera, static pose, no idle motion; it renders only when something changes.
 * - Rendering pauses while the tab is hidden or the landing sections are off screen.
 * - Pixel ratio capped at 2 (1.5 at 900 px and below).
 * - Unmount disposes every geometry, material, texture, the environment map and the renderer, and removes
 *   its own canvas, so a Strict Mode double mount leaves nothing behind.
 * - Colours come from the Graphite CSS tokens, re-read when the theme changes.
 */
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { blendCamera, damp, frameCamera, normalisedPointer, stageProgress, type CameraState } from "@/lib/landing/camera";
import { CAMERA_HOLD, NARROW_CAMERA_STATES, NARROW_MAX_WIDTH, WIDE_CAMERA_STATES } from "@/lib/landing/camera-states";
import type { FaceMode } from "@/lib/landing/content";

interface SentinelSceneProps {
  faceMode: FaceMode;
  reducedMotion: boolean;
  /** Called once if WebGL cannot be started, so the page can show its static fallback. */
  onUnavailable: () => void;
}

const NARROW_QUERY = `(max-width: ${NARROW_MAX_WIDTH}px)`;

interface Palette {
  accent: THREE.Color;
  accent2: THREE.Color;
  success: string;
  warning: string;
  danger: string;
  accentCss: string;
  accent2Css: string;
  dark: boolean;
}

/** Resolves a CSS custom property to sRGB through a 1×1 canvas, so any CSS colour syntax (oklch) works. */
function readCssColor(variable: string, probe: HTMLElement, ctx: CanvasRenderingContext2D): string {
  probe.style.color = `var(${variable})`;
  const computed = getComputedStyle(probe).color;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function readPalette(): Palette {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const read = (name: string, fallback: string) => (ctx ? readCssColor(name, probe, ctx) : fallback);
  const accentCss = read("--primary", "rgb(79, 70, 229)");
  const accent2Css = read("--brand-sky", "rgb(96, 165, 250)");
  const palette: Palette = {
    accentCss,
    accent2Css,
    accent: new THREE.Color(accentCss),
    accent2: new THREE.Color(accent2Css),
    success: read("--success-text", "rgb(22, 163, 74)"),
    warning: read("--warning-text", "rgb(202, 138, 4)"),
    danger: read("--danger-text", "rgb(220, 38, 38)"),
    dark: document.documentElement.classList.contains("dark"),
  };
  probe.remove();
  return palette;
}

/* ---------------------------------------------------------------------------------------------- */
/* Face screen                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

const FACE_W = 512;
const FACE_H = 320;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

/** Draws the face for a mode. `blink` 0 = open, 1 = closed (idle only). `look` shifts idle eyes, -1..1. */
function drawFace(ctx: CanvasRenderingContext2D, mode: FaceMode, palette: Palette, blink: number, look: number) {
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  const cx = FACE_W / 2;
  const cy = FACE_H / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = 28;

  if (mode === "idle") {
    ctx.fillStyle = palette.accent2Css;
    ctx.shadowColor = palette.accent2Css;
    const eyeW = 74;
    const eyeH = Math.max(8, 96 * (1 - blink));
    for (const side of [-1, 1]) {
      const x = cx + side * 92 - eyeW / 2 + look * 18;
      roundedRect(ctx, x, cy - eyeH / 2, eyeW, eyeH, 26);
      ctx.fill();
    }
    return;
  }

  if (mode === "check") {
    ctx.strokeStyle = palette.success;
    ctx.shadowColor = palette.success;
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(cx - 92, cy + 2);
    ctx.lineTo(cx - 24, cy + 70);
    ctx.lineTo(cx + 104, cy - 70);
    ctx.stroke();
    return;
  }

  if (mode === "eye") {
    ctx.strokeStyle = palette.warning;
    ctx.fillStyle = palette.warning;
    ctx.shadowColor = palette.warning;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(cx - 150, cy);
    ctx.quadraticCurveTo(cx, cy - 130, cx + 150, cy);
    ctx.quadraticCurveTo(cx, cy + 130, cx - 150, cy);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // barred circle
  ctx.strokeStyle = palette.danger;
  ctx.shadowColor = palette.danger;
  ctx.lineWidth = 24;
  const r = 100;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy + r * 0.7);
  ctx.lineTo(cx + r * 0.7, cy - r * 0.7);
  ctx.stroke();
}

function drawGradient(ctx: CanvasRenderingContext2D, palette: Palette) {
  const { width, height } = ctx.canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, palette.accentCss);
  gradient.addColorStop(0.55, palette.accent2Css);
  gradient.addColorStop(1, palette.accentCss);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/* ---------------------------------------------------------------------------------------------- */
/* Scene                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

interface SceneHandle {
  setFaceMode: (mode: FaceMode) => void;
  applyTheme: () => void;
  dispose: () => void;
}

function createScene(host: HTMLElement, reducedMotion: boolean, initialFace: FaceMode): SceneHandle {
  const canvas = document.createElement("canvas");
  canvas.className = "block size-full";
  host.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTexture = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.75;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  /* Lights */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.7);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -2;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(-5, 4, -4);
  scene.add(rim);

  /* Textures (canvas) */
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = FACE_W;
  faceCanvas.height = FACE_H;
  const faceCtx = faceCanvas.getContext("2d");
  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;

  const gradientCanvas = document.createElement("canvas");
  gradientCanvas.width = 256;
  gradientCanvas.height = 64;
  const gradientCtx = gradientCanvas.getContext("2d");
  const gradientTexture = new THREE.CanvasTexture(gradientCanvas);
  gradientTexture.colorSpace = THREE.SRGBColorSpace;

  /* Materials */
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xf2f3f6,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  });
  const joint = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.48, metalness: 0.35 });
  const screen = new THREE.MeshPhysicalMaterial({
    color: 0x05060a,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const ringMaterial = new THREE.MeshPhysicalMaterial({
    map: gradientTexture,
    emissiveMap: gradientTexture,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    clearcoat: 1,
  });
  const faceMaterial = new THREE.MeshBasicMaterial({
    map: faceTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const accentGlow = new THREE.MeshBasicMaterial({ color: 0x6366f1, toneMapped: false });
  const scanMaterial = new THREE.MeshBasicMaterial({
    color: 0x6366f1,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.16 });

  const box = (w: number, h: number, d: number, r: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const sphere = (radius: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
    mesh.castShadow = true;
    return mesh;
  };

  /* Ground, pedestal and checkpoint gate */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), shadowMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.32, 0.34, 72), ceramic);
  pedestal.position.y = 0.17;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);
  const pedestalBand = new THREE.Mesh(new THREE.CylinderGeometry(1.215, 1.215, 0.035, 72), joint);
  pedestalBand.position.y = 0.3;
  scene.add(pedestalBand);

  const gateRing = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.012, 8, 180), accentGlow);
  gateRing.rotation.x = -Math.PI / 2;
  gateRing.position.y = 0.04;
  scene.add(gateRing);
  const scanner = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.034, 8, 64, Math.PI * 0.32), scanMaterial);
  scanner.rotation.x = -Math.PI / 2;
  scanner.position.y = 0.045;
  scene.add(scanner);

  /* Robot */
  const robot = new THREE.Group();
  robot.position.y = 0.34;
  scene.add(robot);

  const pelvis = box(0.86, 0.28, 0.6, 0.12, joint);
  pelvis.position.y = 0.3;
  robot.add(pelvis);
  const torso = box(1.3, 1.08, 0.86, 0.22, ceramic);
  torso.position.y = 0.98;
  robot.add(torso);
  const chestLight = box(0.46, 0.06, 0.04, 0.02, accentGlow);
  chestLight.position.set(0, 1.12, 0.44);
  chestLight.castShadow = false;
  robot.add(chestLight);

  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.82, 1.36, 0);
    const shoulder = sphere(0.19, joint);
    arm.add(shoulder);
    const upper = box(0.32, 0.6, 0.36, 0.12, ceramic);
    upper.position.y = -0.36;
    arm.add(upper);
    const elbow = sphere(0.13, joint);
    elbow.position.y = -0.72;
    arm.add(elbow);
    const fore = box(0.3, 0.48, 0.34, 0.12, ceramic);
    fore.position.set(0, -0.98, 0.06);
    fore.rotation.x = -0.18;
    arm.add(fore);
    arm.rotation.z = side * 0.08;
    robot.add(arm);
    arms.push(arm);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.24, 24), joint);
  neck.position.y = 1.62;
  neck.castShadow = true;
  robot.add(neck);

  const head = new THREE.Group();
  head.position.y = 2.12;
  robot.add(head);
  const shell = box(1.28, 0.96, 0.96, 0.26, ceramic);
  head.add(shell);
  const faceRing = box(1.06, 0.76, 0.08, 0.16, ringMaterial);
  faceRing.position.z = 0.46;
  head.add(faceRing);
  const faceScreen = box(0.94, 0.64, 0.08, 0.12, screen);
  faceScreen.position.z = 0.49;
  head.add(faceScreen);
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.54), faceMaterial);
  facePlane.position.z = 0.535;
  head.add(facePlane);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 32), joint);
    ear.rotation.z = Math.PI / 2;
    ear.position.x = side * 0.67;
    ear.castShadow = true;
    head.add(ear);
    const earCap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 40), accentGlow);
    earCap.rotation.y = Math.PI / 2;
    earCap.position.x = side * 0.725;
    head.add(earCap);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 12), joint);
  antenna.position.y = 0.6;
  head.add(antenna);
  const antennaTip = sphere(0.05, accentGlow);
  antennaTip.position.y = 0.75;
  head.add(antennaTip);

  /* State */
  let palette = readPalette();
  let faceMode: FaceMode = initialFace;
  let blink = 0;
  let nextBlinkAt = 2.5;
  let lastFaceKey = "";
  const pointer = { x: 0, y: 0 };
  const smoothPointer = { x: 0, y: 0 };
  let states: readonly CameraState[] = WIDE_CAMERA_STATES;
  /** Scroll positions at which each section is centred in the viewport: where its camera state is reached. */
  let anchors: number[] = [];
  let aspect = 1;
  /** The damped camera actually rendered; it chases the scroll-blended goal each frame. */
  const current = { position: [0, 0, 0], target: [0, 0, 0], fov: 34 };
  const lookTarget = new THREE.Vector3();

  function redrawFace(look: number) {
    if (!faceCtx) return;
    const key = `${faceMode}:${blink.toFixed(2)}:${look.toFixed(2)}`;
    if (key === lastFaceKey) return;
    lastFaceKey = key;
    drawFace(faceCtx, faceMode, palette, blink, look);
    faceTexture.needsUpdate = true;
  }

  function applyPalette() {
    palette = readPalette();
    if (gradientCtx) drawGradient(gradientCtx, palette);
    gradientTexture.needsUpdate = true;
    accentGlow.color.copy(palette.accent);
    scanMaterial.color.copy(palette.accent2);
    ceramic.color.set(palette.dark ? 0xd9dce4 : 0xf3f4f7);
    shadowMaterial.opacity = palette.dark ? 0.32 : 0.14;
    hemi.intensity = palette.dark ? 0.55 : 0.75;
    lastFaceKey = "";
    redrawFace(0);
  }

  function measure() {
    const narrow = window.matchMedia(NARROW_QUERY).matches;
    states = narrow ? NARROW_CAMERA_STATES : WIDE_CAMERA_STATES;
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2));
    renderer.setSize(width, height, false);
    aspect = width / Math.max(1, height);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const viewport = window.innerHeight;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewport);
    anchors = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-section]")).map((element) => {
      const rect = element.getBoundingClientRect();
      const centred = rect.top + window.scrollY + rect.height / 2 - viewport / 2;
      return Math.min(maxScroll, Math.max(0, centred));
    });
  }

  function applyCamera(state: { position: readonly number[]; target: readonly number[]; fov: number }) {
    camera.position.set(state.position[0], state.position[1], state.position[2]);
    lookTarget.set(state.target[0], state.target[1], state.target[2]);
    camera.lookAt(lookTarget);
    if (Math.abs(camera.fov - state.fov) > 1e-3) {
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
    }
  }

  /** The framed camera for the current scroll position (stage 0 under reduced motion: no camera travel). */
  function goalCamera(): CameraState {
    const progress = reducedMotion ? 0 : stageProgress(window.scrollY, anchors, CAMERA_HOLD);
    return frameCamera(blendCamera(states, progress), aspect);
  }

  function renderOnce() {
    applyCamera(goalCamera());
    redrawFace(0);
    renderer.render(scene, camera);
  }

  /* Loop */
  const clock = new THREE.Clock();
  let frame = 0;
  let pageVisible = document.visibilityState === "visible";
  let onScreen = true;

  function tick() {
    frame = 0;
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    const goal = goalCamera();
    smoothPointer.x = damp(smoothPointer.x, pointer.x, 3, dt);
    smoothPointer.y = damp(smoothPointer.y, pointer.y, 3, dt);
    for (let i = 0; i < 3; i += 1) {
      current.position[i] = damp(current.position[i], goal.position[i], 5, dt);
      current.target[i] = damp(current.target[i], goal.target[i], 5, dt);
    }
    current.fov = damp(current.fov, goal.fov, 5, dt);
    applyCamera({
      position: [current.position[0] + smoothPointer.x * 0.35, current.position[1] + smoothPointer.y * 0.2, current.position[2]],
      target: current.target,
      fov: current.fov,
    });

    // Idle: bob, head sway that follows the pointer a little, arm sway, blink.
    robot.position.y = 0.34 + Math.sin(t * 1.4) * 0.035;
    head.rotation.y = Math.sin(t * 0.55) * 0.12 + smoothPointer.x * 0.28;
    head.rotation.x = -smoothPointer.y * 0.12 + Math.sin(t * 0.8) * 0.025;
    head.rotation.z = Math.sin(t * 0.45) * 0.03;
    arms[0].rotation.x = Math.sin(t * 1.1) * 0.05;
    arms[1].rotation.x = -Math.sin(t * 1.1) * 0.05;
    scanner.rotation.z = t * 0.5;

    if (t >= nextBlinkAt) {
      const since = t - nextBlinkAt;
      blink = since < 0.07 ? since / 0.07 : since < 0.14 ? 1 - (since - 0.07) / 0.07 : 0;
      if (since >= 0.14) nextBlinkAt = t + 2.8 + Math.random() * 2.6;
    }
    redrawFace(faceMode === "idle" ? smoothPointer.x : 0);

    renderer.render(scene, camera);
    schedule();
  }

  function schedule() {
    if (reducedMotion || frame !== 0 || !pageVisible || !onScreen) return;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  }

  /* Events */
  const onResize = () => {
    measure();
    if (reducedMotion) renderOnce();
  };
  const onPointer = (event: PointerEvent) => {
    const next = normalisedPointer(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
    pointer.x = next.x;
    pointer.y = next.y;
  };
  const onVisibility = () => {
    pageVisible = document.visibilityState === "visible";
    if (pageVisible) {
      clock.getDelta();
      schedule();
    } else stop();
  };

  const stage = document.getElementById("landing-stage");
  const observer = stage
    ? new IntersectionObserver(([entry]) => {
        onScreen = entry?.isIntersecting ?? true;
        host.style.visibility = onScreen ? "visible" : "hidden";
        if (onScreen) {
          clock.getDelta();
          schedule();
        } else stop();
      })
    : null;
  if (stage && observer) observer.observe(stage);
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(document.body);

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  if (!reducedMotion) window.addEventListener("pointermove", onPointer, { passive: true });

  measure();
  applyPalette();
  // Start where the page already is (a reload mid-page), so the first frame does not sweep in.
  const initial = goalCamera();
  current.position = [...initial.position];
  current.target = [...initial.target];
  current.fov = initial.fov;
  applyCamera(initial);
  if (reducedMotion) renderOnce();
  else schedule();

  return {
    setFaceMode(mode) {
      faceMode = mode;
      blink = 0;
      if (reducedMotion) renderOnce();
    },
    applyTheme() {
      applyPalette();
      if (reducedMotion) renderOnce();
    },
    dispose() {
      stop();
      observer?.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);

      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const list = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of list) materials.add(material);
        }
      });
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
      faceTexture.dispose();
      gradientTexture.dispose();
      envTexture.dispose();
      room.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
        }
      });
      pmrem.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export default function SentinelScene({ faceMode, reducedMotion, onUnavailable }: SentinelSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const faceRef = useRef(faceMode);
  const unavailableRef = useRef(onUnavailable);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    faceRef.current = faceMode;
    unavailableRef.current = onUnavailable;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let handle: SceneHandle;
    try {
      handle = createScene(host, reducedMotion, faceRef.current);
    } catch {
      unavailableRef.current();
      return;
    }
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, [reducedMotion]);

  useEffect(() => {
    handleRef.current?.setFaceMode(faceMode);
  }, [faceMode]);

  // One frame later, so next-themes has already switched the class on <html> that the tokens hang on.
  useEffect(() => {
    const id = requestAnimationFrame(() => handleRef.current?.applyTheme());
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);

  return <div ref={hostRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
