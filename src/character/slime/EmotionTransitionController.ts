import type { SlimeEmotion } from './assets';
import { mix, morph, sampleTrack } from './poses';
import type { Path, Pose } from './poses';
export interface VisualPose { body: Path; eyes: Path[]; matrices: number[][] }
export type PoseRegistry = Record<SlimeEmotion, Pose>;
/** Optional sparse routing policy; compatible supplied assets use direct transitions. */
export type BridgePolicy = (from: SlimeEmotion, to: SlimeEmotion) => SlimeEmotion | undefined;
export function normalizeEmotion(value: unknown, poses: PoseRegistry): SlimeEmotion {
  return typeof value === 'string' && Object.hasOwn(poses, value) ? value as SlimeEmotion : 'neutre';
}
const ease = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
export class EmotionTransitionController {
  currentEmotion: SlimeEmotion;
  targetEmotion: SlimeEmotion;
  progress = 1;
  interruptions = 0;
  completed = true;
  visual: VisualPose;
  private from: VisualPose;
  private start = 0;
  settledAt = 0;
  private waypoint: SlimeEmotion;
  constructor(readonly poses: PoseRegistry, emotion: unknown = 'neutre', private bridge?: BridgePolicy) {
    this.currentEmotion = this.targetEmotion = normalizeEmotion(emotion, poses);
    this.waypoint = this.targetEmotion;
    this.visual = this.from = this.pose(this.targetEmotion);
  }
  private pose(emotion: SlimeEmotion): VisualPose {
    const p = this.poses[emotion];
    return { body: p.body, eyes: p.eyes, matrices: p.tracks.map((t) => t[0].matrix) };
  }
  request(emotion: unknown, now: number, immediate = false, animateIdle = true) {
    const target = normalizeEmotion(emotion, this.poses);
    if (target === this.targetEmotion && !immediate) return;
    if (!this.completed) { this.sample(now); this.interruptions++; }
    else if (animateIdle) {
      const p = this.poses[this.currentEmotion];
      this.visual = { ...this.visual, matrices: p.tracks.map((t) => sampleTrack(t, now - this.settledAt, p.duration)) };
    }
    this.from = this.visual;
    this.targetEmotion = target;
    this.waypoint = immediate ? target : this.bridge?.(this.currentEmotion, target) ?? target;
    this.start = now;
    this.progress = 0;
    this.completed = false;
    if (immediate) this.finish(now);
  }
  private finish(now: number) {
    this.visual = this.pose(this.targetEmotion);
    this.currentEmotion = this.targetEmotion;
    this.progress = 1;
    this.completed = true;
    this.settledAt = now;
    this.waypoint = this.targetEmotion;
  }
  sample(now: number): VisualPose {
    if (this.completed) return this.visual;
    const elapsed = Math.max(0, now - this.start);
    if (elapsed >= 460) {
      if (this.waypoint !== this.targetEmotion) {
        this.visual = this.from = this.pose(this.waypoint);
        this.waypoint = this.targetEmotion;
        this.start = now;
        return this.visual;
      }
      this.finish(now); return this.visual;
    }
    const to = this.pose(this.waypoint);
    this.progress = elapsed / 460;
    this.visual = {
      body: morph(this.from.body, to.body, ease(elapsed / 460)),
      eyes: this.from.eyes.map((p, i) => morph(p, to.eyes[i], ease(elapsed / 280))),
      matrices: this.from.matrices.map((m, i) => mix(m, to.matrices[i], ease(elapsed / 220))),
    };
    return this.visual;
  }
}
