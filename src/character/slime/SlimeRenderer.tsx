import { useEffect, useId, useRef } from 'react';
import type { CharacterState } from './CharacterController';
import { slimeAssets } from './assets';
import { normalizePose, pathString } from './poses';
import { SlimeController } from './SlimeController';
import type { PoseRegistry } from './EmotionTransitionController';
import type { SlimeAppearanceProps } from './SlimeAvatar';
const poses = Object.fromEntries(Object.entries(slimeAssets).map(([name, svg]) => [name, normalizePose(svg)])) as PoseRegistry;
export function SlimeRenderer({ state, size = 48, color = '#f5f5f5', eyeColor = '#000000', animated = true, reducedMotion, alt = `Slime: ${state.emotion}`, className = '' }: SlimeAppearanceProps & { state: CharacterState }) {
  const id = useId();
  const root = useRef<SVGSVGElement>(null);
  const controller = useRef<SlimeController | null>(null);
  const latest = useRef({ state, animated, reducedMotion });
  useEffect(() => { latest.current = { state, animated, reducedMotion }; });
  useEffect(() => {
    const svg = root.current!;
    const body = svg.querySelector<SVGPathElement>('[data-body]')!;
    const silhouette = svg.querySelector<SVGPathElement>('[data-silhouette]')!;
    const eyes = [...svg.querySelectorAll<SVGPathElement>('[data-eye]')];
    const gaze = svg.querySelector<SVGGElement>('[data-gaze]')!;
    const surface = svg.querySelector<SVGGElement>('[data-surface]')!;
    let animations: Animation[] = [];
    let idleKey = '';
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const engine = new SlimeController(poses, latest.current.state, { now: () => performance.now(), request: (callback) => window.requestAnimationFrame(callback), cancel: (id) => window.cancelAnimationFrame(id) }, (frame) => {
      body.setAttribute('d', pathString(frame.pose.body));
      silhouette.setAttribute('d', pathString(frame.pose.body));
      surface.setAttribute('transform', `scale(${frame.scale})`);
      gaze.setAttribute('transform', `translate(${frame.gaze.join(' ')})`);
      eyes.forEach((eye, i) => { eye.setAttribute('d', pathString(frame.pose.eyes[i])); eye.style.transform = `matrix(${frame.pose.matrices[i].join(',')})`; });
      const key = frame.idle ? `${engine.emotions.currentEmotion}:${frame.epoch}` : '';
      if (key !== idleKey) {
        animations.forEach((animation) => animation.cancel()); animations = []; idleKey = key;
        if (frame.idle) {
          const pose = poses[engine.emotions.currentEmotion];
          animations = eyes.map((eye, i) => {
            const animation = eye.animate(pose.tracks[i].map((f) => ({ offset: f.offset, transform: `matrix(${f.matrix.join(',')})` })), { duration: pose.duration, iterations: Infinity, direction: 'alternate', easing: 'linear' });
            animation.startTime = frame.epoch;
            return animation;
          });
        }
      }
    });
    controller.current = engine;
    const update = () => engine.update(latest.current.state, latest.current.reducedMotion ?? media.matches, latest.current.animated);
    update(); media.addEventListener('change', update);
    return () => { engine.dispose(); animations.forEach((a) => a.cancel()); media.removeEventListener('change', update); controller.current = null; };
  }, []);
  useEffect(() => { controller.current?.update(state, reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches, animated); }, [state, animated, reducedMotion]);
  const pixels = Number.isFinite(size) && size > 0 ? size : 48;
  return <svg ref={root} className={`slime ${className}`} width={pixels} height={pixels} viewBox="-125 -125 250 250" role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
    <defs><mask id={id} maskUnits="userSpaceOnUse" x="-158" y="-158" width="316" height="316">
      <path data-body fill="white" /><g data-gaze>{[0, 1].map((i) => <path key={i} data-eye fill="black" style={{ transformOrigin: '0 0', transformBox: 'view-box' }} />)}</g>
    </mask></defs>
    <g data-surface><path data-silhouette fill={eyeColor} /><rect x="-158" y="-158" width="316" height="316" fill={color} mask={`url(#${id})`} /></g>
  </svg>;
}

