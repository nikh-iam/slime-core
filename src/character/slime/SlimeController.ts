import type { CharacterState } from './CharacterController';
import { EmotionTransitionController } from './EmotionTransitionController';
import type { PoseRegistry, VisualPose } from './EmotionTransitionController';
export interface Scheduler { now(): number; request(callback: (time: number) => void): number; cancel(id: number): void }
export interface RenderFrame { pose: VisualPose; gaze: number[]; scale: number; idle: boolean; epoch: number }
/** Owns one cancellable frame chain. Idle source animation is delegated to the renderer's WAAPI tracks. */
export class SlimeController {
  readonly emotions: EmotionTransitionController;
  private frame: number | undefined;
  private gaze = [0, 0];
  private targetGaze = [0, 0];
  private scale = 1;
  private targetScale = 1;
  private velocity = 0;
  private last: number;
  private reduced = false;
  private animated = true;
  constructor(poses: PoseRegistry, state: CharacterState, private scheduler: Scheduler, private render: (frame: RenderFrame) => void) {
    this.emotions = new EmotionTransitionController(poses, state.emotion);
    this.last = this.emotions.settledAt = scheduler.now();
  }
  update(state: CharacterState, reduced: boolean, animated: boolean) {
    const now = this.scheduler.now();
    this.emotions.request(state.emotion, now, reduced || !animated, this.animated && !this.reduced);
    if (this.emotions.completed && animated && !reduced && (!this.animated || this.reduced)) this.emotions.settledAt = now;
    this.reduced = reduced; this.animated = animated;
    this.targetGaze = [state.gaze.x, state.gaze.y].map((v) => Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) * 9 : 0);
    this.targetScale = state.pressed || state.dragging ? 0.94 : state.hover ? 1.035 : 1;
    if (reduced || !animated) { this.gaze = [...this.targetGaze]; this.scale = this.targetScale; this.velocity = 0; }
    if (this.frame !== undefined) this.scheduler.cancel(this.frame);
    this.frame = undefined;
    this.tick(now);
  }
  private tick = (now: number) => {
    this.frame = undefined;
    const dt = Math.min(0.032, Math.max(0.001, (now - this.last) / 1000)); this.last = now;
    this.gaze = this.gaze.map((v, i) => v + (this.targetGaze[i] - v) * (1 - Math.exp(-dt * 25)));
    this.velocity += ((this.targetScale - this.scale) * 240 - this.velocity * 22) * dt;
    this.scale += this.velocity * dt;
    const moving = this.gaze.some((v, i) => Math.abs(v - this.targetGaze[i]) > 0.01) || Math.abs(this.scale - this.targetScale) > 0.0001 || Math.abs(this.velocity) > 0.001;
    if (!moving) { this.gaze = [...this.targetGaze]; this.scale = this.targetScale; this.velocity = 0; }
    const pose = this.emotions.sample(now);
    this.render({ pose, gaze: this.gaze, scale: this.scale, idle: this.emotions.completed && this.animated && !this.reduced, epoch: this.emotions.settledAt });
    if (!this.emotions.completed || moving) this.frame = this.scheduler.request(this.tick);
  };
  dispose() { if (this.frame !== undefined) this.scheduler.cancel(this.frame); this.frame = undefined; }
}
