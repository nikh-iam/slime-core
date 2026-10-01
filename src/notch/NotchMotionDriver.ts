import { NotchMotionController, hostEnvelope } from './NotchMotionController';
import type { MotionEvent, MotionFrame } from './NotchMotionController';
import type { NotchService, NotchSnapshot } from './types';
export interface MotionScheduler { now(): number; request(callback: (time: number) => void): number; cancel(id: number): void }
export const DEFAULT_RESIZE_INTERVAL_MS = 32;
/** Single frame chain plus one coalesced IPC operation. No animation queues. */
export class NotchMotionDriver {
  readonly engine: NotchMotionController;
  private frame: number | undefined;
  private last = 0;
  private sentAt = -Infinity;
  private inFlight = false;
  private stopped = false;
  private revision = -1;
  private sent = '';
  private host = { width: 36, height: 1 };
  private painted: MotionFrame;
  private holdStarted: number | undefined;
  onDiagnostics?: (metrics: NotchMotionDriver['metrics']) => void;
  readonly metrics = { frames: 0, resizes: 0, maxIpcMs: 0, blockedFrames: 0, maxHoldMs: 0, heldWhileMoving: 0, frameIntervalMs: 0, latencyMs: 0, skipped: 0, held: false, active: false,
    requested: { width: 36, height: 1 }, acknowledged: { width: 36, height: 1 } };
  constructor(private service: Pick<NotchService, 'motion'>, private scheduler: MotionScheduler, private paint: (frame: MotionFrame) => void,
    event?: (event: MotionEvent, state: MotionFrame['state']) => void, private error: (error: unknown) => void = () => {}, readonly resizeIntervalMs = DEFAULT_RESIZE_INTERVAL_MS) {
    this.engine = new NotchMotionController(event); this.painted = this.engine.snapshot();
  }
  request(snapshot: NotchSnapshot, reduced: boolean) {
    if (snapshot.revision < this.revision || this.stopped) return;
    this.revision = snapshot.revision; this.engine.request(snapshot.state, reduced);
    this.wake();
  }
  interact(hover: boolean, pressed: boolean) { this.engine.interact(hover, pressed); this.wake(); }
  layout(height: number) { this.engine.setChatHeight(height); if (this.revision >= 0) this.wake(); }
  private wake() {
    if (this.stopped || this.frame !== undefined) return;
    this.last = this.scheduler.now(); this.frame = this.scheduler.request(this.tick); this.metrics.active = true;
  }
  private tick = (now: number) => {
    this.frame = undefined;
    if (this.stopped) return;
    this.metrics.frameIntervalMs = now - this.last;
    const dt = (now - this.last) / 1000;
    const candidate = this.engine.preview(dt);
    const fits = candidate.width <= this.host.width && candidate.height <= this.host.height;
    // Pause physical time under backpressure as well as paint: no catch-up jump on acknowledgement.
    const frame = fits ? this.engine.step(dt) : this.engine.snapshot(); this.last = now;
    const envelope = hostEnvelope(frame);
    const key = `${this.revision}:${envelope.width}:${envelope.height}:${frame.settled}`;
    // Hold the last safe visual frame under unusually slow IPC, never clip an expanding surface.
    this.metrics.held = !fits;
    if (!fits) {
      this.holdStarted ??= now;
      this.metrics.maxHoldMs = Math.max(this.metrics.maxHoldMs, now - this.holdStarted);
      if (Math.abs(frame.velocity.width) > 1 || Math.abs(frame.velocity.height) > 1) this.metrics.heldWhileMoving++;
    } else this.holdStarted = undefined;
    if (!this.metrics.held) {
      this.paint(frame); this.painted = frame; this.metrics.frames++;
    } else this.metrics.blockedFrames++;
    if (key !== this.sent && (this.inFlight || now - this.sentAt < this.resizeIntervalMs)) this.metrics.skipped++;
    if (!this.inFlight && key !== this.sent && (frame.settled || now - this.sentAt >= this.resizeIntervalMs)) {
      this.inFlight = true; this.sentAt = now;
      const revision = this.revision;
      // A shrinking host must still contain the last committed DOM frame.
      const width = Math.max(envelope.width, Math.ceil(this.painted.width));
      const height = Math.max(envelope.height, Math.ceil(this.painted.height), 1);
      // Until acknowledgement, either the old or the pending native bounds may be active.
      this.host = { width: Math.min(this.host.width, width), height: Math.min(this.host.height, height) };
      this.metrics.resizes++;
      this.metrics.requested = { width, height };
      void this.service.motion({ width, height, revision, settled: frame.settled }).then((host) => {
        if (this.stopped) return;
        this.metrics.latencyMs = this.scheduler.now() - now;
        this.metrics.maxIpcMs = Math.max(this.metrics.maxIpcMs, this.metrics.latencyMs);
        if (revision === this.revision) { this.host = host; this.metrics.acknowledged = host; this.sent = key; }
      }).catch((error: unknown) => { this.error(error); this.dispose(); }).finally(() => {
        this.inFlight = false;
        if (!this.stopped) this.wake();
      });
    }
    if (!frame.settled || key !== this.sent) this.frame = this.scheduler.request(this.tick);
    this.metrics.active = this.frame !== undefined || this.inFlight;
    this.onDiagnostics?.(structuredClone(this.metrics));
  };
  dispose() { this.stopped = true; if (this.frame !== undefined) this.scheduler.cancel(this.frame); this.frame = undefined; this.metrics.active = false; }
}
