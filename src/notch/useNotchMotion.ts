import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { NotchMotionDriver, DEFAULT_RESIZE_INTERVAL_MS } from './NotchMotionDriver';
import type { MotionFrame } from './NotchMotionController';
import type { NotchService, NotchSnapshot } from './types';
import { reportError } from '../shared/logging';
export function paintNotch(element: HTMLElement, frame: MotionFrame) {
  element.style.width = `${frame.width}px`; element.style.height = `${frame.height}px`;
  element.style.transform = `translateX(-50%) translateY(${frame.offsetY}px)`;
  element.style.borderRadius = `${frame.radius}px`;
  element.style.visibility = frame.height < 0.1 ? 'hidden' : 'visible';
  element.dataset.settled = String(frame.settled);
  const character = element.querySelector<HTMLElement>('.notch-character');
  if (character) character.style.transform = `translate3d(${frame.characterX - 22}px, ${frame.characterY - 22}px, 0) scale(${frame.characterScale})`;
  const deformation = element.querySelector<HTMLElement>('.notch-character-deformation');
  if (deformation) deformation.style.transform = `scale(${frame.stretchX}, ${frame.stretchY})`;
  const content = element.querySelector<HTMLElement>('.notch-content');
  if (content) {
    content.style.clipPath = `inset(0 0 ${(1 - frame.contentProgress) * 100}% 0)`;
    content.inert = frame.contentProgress < 0.98;
  }
}
export function useNotchMotion(surface: RefObject<HTMLDivElement | null>, service: NotchService, snapshot: NotchSnapshot, ready: boolean, chatHeight = 220) {
  const driver = useRef<NotchMotionDriver | null>(null);
  const latest = useRef({ snapshot, ready });
  useEffect(() => { latest.current = { snapshot, ready }; });
  useEffect(() => {
    const element = surface.current!;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const params = new URLSearchParams(location.search);
    const diagnostics = import.meta.env.DEV && params.has('motion-diagnostics');
    const candidate = Number(params.get('resize-interval'));
    const interval = diagnostics && [16, 24, 32, 40].includes(candidate) ? candidate : DEFAULT_RESIZE_INTERVAL_MS;
    const samples: unknown[] = [];
    const motion = new NotchMotionDriver(service, { now: () => performance.now(), request: (callback) => window.requestAnimationFrame(callback), cancel: (id) => window.cancelAnimationFrame(id) },
      (frame) => {
        paintNotch(element, frame);
        if (diagnostics) {
          samples.push({ time: performance.now(), frame, target: motion.engine.target(), metrics: structuredClone(motion.metrics), viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio });
          if (samples.length > 10000) samples.shift();
        }
      }, (event, state) => element.dispatchEvent(new CustomEvent(event, { bubbles: true, detail: { state } })), reportError, interval);
    if (diagnostics) Object.assign(window, { __notchDiagnostics: { motion, samples } });
    driver.current = motion;
    const update = () => { if (latest.current.ready) motion.request(latest.current.snapshot, media.matches); };
    update(); media.addEventListener('change', update);
    return () => { motion.dispose(); media.removeEventListener('change', update); driver.current = null; if (diagnostics) Reflect.deleteProperty(window, '__notchDiagnostics'); };
  }, [service, surface]);
  useEffect(() => { if (ready) driver.current?.request(snapshot, matchMedia('(prefers-reduced-motion: reduce)').matches); }, [snapshot, ready]);
  useEffect(() => { driver.current?.layout(chatHeight); }, [chatHeight]);
  return (hover: boolean, pressed: boolean) => driver.current?.interact(hover, pressed);
}

