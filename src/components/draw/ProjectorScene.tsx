"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useEventStatePolling } from "@/lib/polling/useEventStatePolling";

import {
  createProjectorState,
  restoreProjectorState,
  type ScreenSnapshot,
} from "./projector-state";

export function ProjectorScene({ initialSnapshot }: { initialSnapshot: ScreenSnapshot }) {
  const [state, setState] = useState(() => restoreProjectorState(createProjectorState(initialSnapshot.settings), initialSnapshot));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
    camera.position.z = 7;
    const positions = new Float32Array(180 * 3);
    for (let index = 0; index < 180; index += 1) {
      positions[index * 3] = ((index * 47) % 101) / 9 - 5.6;
      positions[index * 3 + 1] = ((index * 71) % 83) / 8 - 5.1;
      positions[index * 3 + 2] = -((index * 13) % 25) / 10;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xe7c897, size: 0.035, transparent: true, opacity: 0.62 }));
    scene.add(points);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    }
    let frame = 0;
    function render() {
      resize();
      if (!reducedMotion) points.rotation.z += 0.00035;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    }
    render();
    return () => { cancelAnimationFrame(frame); geometry.dispose(); (points.material as THREE.Material).dispose(); renderer.dispose(); };
  }, []);

  const { state: snapshot } = useEventStatePolling<ScreenSnapshot>({ url: "/api/screen", initialState: initialSnapshot });

  useEffect(() => {
    if (!snapshot) return;
    const update = window.setTimeout(() => setState((current) => restoreProjectorState(current, snapshot)), 0);
    return () => window.clearTimeout(update);
  }, [snapshot]);

  const backgroundStyle = useMemo(() => state.settings.screenBackgroundPath ? { backgroundImage: `url(${state.settings.screenBackgroundPath})` } : undefined, [state.settings.screenBackgroundPath]);

  return (
    <main className={`projector phase-${state.phase}`}>
      <div className="projector-backdrop" aria-hidden="true" style={backgroundStyle} />
      <div className="projector-shade" aria-hidden="true" />
      <canvas ref={canvasRef} aria-hidden="true" />
      <header><p>Wedding Celebration</p><h1>{state.settings.screenTitle}</h1></header>
      {state.phase === "idle" ? <section className="projector-idle"><span>宾客抽奖</span><h2>静候仪式开始</h2></section> : null}
      {state.phase === "rolling" ? (
        <section className="candidate-field" aria-label="候选宾客滚动中">
          <div className="projector-round-label"><span>{state.prizeName}</span><strong>{state.groupName}</strong></div>
          {state.candidates.slice(0, 42).map((name, index) => <i key={`${name}-${index}`} style={{ left: `${8 + ((index * 29) % 84)}%`, top: `${16 + ((index * 37) % 68)}%`, animationDelay: `${-(index % 8) * 0.45}s` }}>{name}</i>)}
        </section>
      ) : null}
      {state.phase === "revealed" || state.phase === "published" ? (
        <section className="winner-reveal" aria-live="polite">
          <p>{state.phase === "published" ? "获奖名单" : "恭喜"}</p>
          <div>{state.winners.map((winner) => <h2 key={winner.id}>{winner.name}</h2>)}</div>
          <span>{state.prizeName} · {state.groupName}</span>
        </section>
      ) : null}
      <footer>{state.settings.screenBackgroundPath ? "" : "请在后台设置中上传婚礼背景照片"}</footer>
    </main>
  );
}
