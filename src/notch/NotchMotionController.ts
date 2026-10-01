import type { NotchState } from './types';
export interface Geometry {
  width: number; height: number; anchorX: number; offsetY: number; radius: number;
  contentProgress: number; characterScale: number; characterX: number; characterY: number;
}
export type MotionEvent = 'onRevealStart' | 'onContentReady' | 'onCollapseStart' | 'onSettled';
export interface MotionFrame extends Geometry {
  velocity: Geometry; state: NotchState; settled: boolean; progress: number; stretchX: number; stretchY: number;
}
export const motionTargets: Record<NotchState, Geometry> = {
  COLLAPSED: { width: 90, height: 48, anchorX: 0, offsetY: 0, radius: 24, contentProgress: 0, characterScale: 1, characterX: 0, characterY: 24 },
  COMPACT: { width: 220, height: 56, anchorX: 0, offsetY: 0, radius: 28, contentProgress: 0.45, characterScale: 1, characterX: -72, characterY: 28 },
  EXPANDED: { width: 420, height: 160, anchorX: 0, offsetY: 0, radius: 30, contentProgress: 1, characterScale: 0.94, characterX: -176, characterY: 30 },
  HIDDEN: { width: 36, height: 0, anchorX: 0, offsetY: -8, radius: 18, contentProgress: 0, characterScale: 0.75, characterX: 0, characterY: 10 },
};
const keys = Object.keys(motionTargets.COLLAPSED) as (keyof Geometry)[];
const zero = () => Object.fromEntries(keys.map((k) => [k, 0])) as unknown as Geometry;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
/** Exact critically damped spring step. No timer ownership or platform dependencies. */
export function spring(x: number, v: number, target: number, frequency: number, dt: number): [number, number] {
  const delta = x - target, coefficient = v + frequency * delta, decay = Math.exp(-frequency * dt);
  return [target + (delta + coefficient * dt) * decay, (v - frequency * coefficient * dt) * decay];
}
export class NotchMotionController {
  state: NotchState = 'HIDDEN';
  geometry: Geometry = { ...motionTargets.HIDDEN };
  velocity = zero();
  settled = true;
  reduced = false;
  private hover = false;
  private pressed = false;
  private settledReported = true;
  private revealing = false;
  private initialDistance = 1;
  private revealed = false;
  private contentReady = false;
  constructor(private event: (event: MotionEvent, state: NotchState) => void = () => {}) {}
  request(state: NotchState, reduced = this.reduced) {
    const changedMotion = this.reduced !== reduced;
    this.reduced = reduced;
    if (state === this.state) { if (changedMotion) this.settled = false; return; }
    this.revealing = motionTargets[state].contentProgress > motionTargets[this.state].contentProgress;
    if (motionTargets[state].contentProgress < motionTargets[this.state].contentProgress) this.event('onCollapseStart', state);
    this.state = state;
    this.settledReported = false;
    this.initialDistance = Math.max(1, this.distance());
    this.revealed = false; this.contentReady = false; this.settled = false;
    // Neither geometry nor velocity is reset on reversal.
  }
  interact(hover: boolean, pressed: boolean) {
    if (hover === this.hover && pressed === this.pressed) return;
    this.hover = hover; this.pressed = pressed; this.settled = false;
  }
  target(): Geometry {
    const target = { ...motionTargets[this.state] };
    if (!this.reduced && this.state === 'COLLAPSED') {
      target.width += this.hover ? 2 : 0;
      target.height += this.hover ? 0.5 : 0;
      if (this.pressed) { target.width -= 3; target.height -= 2; target.characterScale = 0.97; }
    }
    return target;
  }
  private distance() {
    const target = this.target();
    return Math.hypot(...keys.map((k) => target[k] - this.geometry[k]));
  }
  preview(seconds: number): MotionFrame {
    const copy = Object.assign(new NotchMotionController(), this);
    copy.geometry = { ...this.geometry }; copy.velocity = { ...this.velocity }; copy.event = () => {};
    return copy.step(seconds);
  }
  step(seconds: number): MotionFrame {
    if (this.settled) return this.snapshot();
    // Bound resumed/background gaps rather than simulating a giant invisible jump.
    const dt = clamp(seconds, 0, 0.032);
    const target = this.target();
    const expanding = target.height > this.geometry.height;
    if (!this.reduced && expanding && this.state === 'EXPANDED') {
      // Widen first, then let the lower edge deepen; no queued animation segments.
      const space = clamp((this.geometry.width - 100) / 180, 0, 1);
      target.height = Math.min(target.height, 56 + 104 * space);
    }
    const enoughSpace = clamp((this.geometry.height - 48) / 95, 0, 1) * clamp((this.geometry.width - 100) / 260, 0, 1);
    if (this.state === 'EXPANDED') target.contentProgress *= enoughSpace;
    if (this.state === 'COMPACT') target.contentProgress *= clamp((this.geometry.width - 90) / 130, 0, 1);
    if (target.height < this.geometry.height && this.geometry.contentProgress > motionTargets[this.state].contentProgress + 0.08 && !this.reduced) {
      // Content retracts before the host starts taking away its space.
      target.height = this.geometry.height;
    }
    for (const key of keys) {
      const rate = this.reduced ? 25 : key === 'contentProgress' ? (target.contentProgress < this.geometry.contentProgress ? 40 : 18) : key === 'width' ? 20 : key === 'height' ? 17 : key.startsWith('character') ? 22 : 20;
      [this.geometry[key], this.velocity[key]] = spring(this.geometry[key], this.velocity[key], target[key], rate, dt);
    }
    this.geometry.width = Math.max(1, this.geometry.width);
    this.geometry.height = Math.max(0, this.geometry.height);
    this.geometry.contentProgress = clamp(this.geometry.contentProgress, 0, 1);
    if (this.revealing && !this.revealed && this.geometry.contentProgress > 0.03 && motionTargets[this.state].contentProgress > 0) {
      this.revealed = true; this.event('onRevealStart', this.state);
    }
    const final = this.target();
    if (!this.contentReady && final.contentProgress > 0 && this.geometry.contentProgress >= final.contentProgress * 0.98 && this.geometry.width >= final.width - 1 && this.geometry.height >= final.height - 1) {
      this.contentReady = true; this.event('onContentReady', this.state);
    }
    if (keys.every((k) => Math.abs(this.geometry[k] - final[k]) < (k === 'contentProgress' || k === 'characterScale' ? 0.001 : 0.04) && Math.abs(this.velocity[k]) < 0.08)) {
      this.geometry = final; this.velocity = zero(); this.settled = true;
      if (!this.settledReported) { this.settledReported = true; this.event('onSettled', this.state); }
    }
    return this.snapshot();
  }
  snapshot(): MotionFrame {
    const deformation = this.reduced ? 0 : clamp((this.velocity.width - this.velocity.height * 1.3) * 0.000025, -0.022, 0.022);
    return { ...this.geometry, velocity: { ...this.velocity }, state: this.state, settled: this.settled,
      progress: this.settled ? 1 : clamp(1 - this.distance() / this.initialDistance, 0, 0.999), stretchX: 1 + deformation, stretchY: 1 - deformation };
  }
}
/** Bounded look-ahead envelope; at most ~48px horizontal/24px vertical transient padding. */
export function hostEnvelope(frame: MotionFrame) {
  if (frame.settled) return { width: Math.ceil(frame.width), height: Math.max(1, Math.ceil(frame.height)) };
  const target = motionTargets[frame.state];
  const predictedWidth = spring(frame.width, frame.velocity.width, target.width, 20, 0.065)[0];
  const predictedHeight = spring(frame.height, frame.velocity.height, target.height, 17, 0.065)[0];
  return {
    width: Math.ceil(frame.width + clamp(Math.max(0, frame.velocity.width * 0.065, predictedWidth - frame.width) + 10, 10, 96)),
    height: Math.ceil(Math.max(1, frame.height + Math.max(0, frame.offsetY)) + clamp(Math.max(0, frame.velocity.height * 0.065, predictedHeight - frame.height) + 6, 6, 48)),
  };
}
