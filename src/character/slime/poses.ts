export interface Path { template: string; values: number[] }
export interface Frame { offset: number; matrix: number[] }
export interface Pose { body: Path; eyes: Path[]; tracks: Frame[][]; duration: number }
const number = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
export function parsePath(d: string): Path {
  return { template: d.replace(number, '#'), values: (d.match(number) ?? []).map(Number) };
}
export function pathString(path: Path): string {
  let index = 0;
  return path.template.replace(/#/g, () => String(path.values[index++]));
}
export function mix(a: number[], b: number[], t: number) { return a.map((v, i) => v + (b[i] - v) * t); }
export function morph(a: Path, b: Path, t: number): Path {
  if (a.template !== b.template) throw new Error('Incompatible Slime topology: prepare source before registering');
  return { template: a.template, values: mix(a.values, b.values, t) };
}
/** Source assets are trusted build inputs, never user-provided markup. */
export function normalizePose(svg: string): Pose {
  if (!svg.includes('viewBox="-125 -125 250 250"') || !svg.includes('transform-origin:0 0')) throw new Error('Unsupported coordinate system');
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => parsePath(m[1]));
  if (paths.length !== 4 || pathString(paths[0]) !== pathString(paths[3])) throw new Error('Unsupported Slime layers');
  const tracks = [0, 1].map((i) => {
    const block = svg.split(`@keyframes oeil${i}{`)[1]?.split('@keyframes')[0];
    const frames = [...(block ?? '').matchAll(/([\d.]+)%\{transform:matrix\(([^)]+)\)/g)]
      .map((m) => ({ offset: Number(m[1]) / 100, matrix: m[2].split(',').map(Number) }));
    if (frames.length < 2 || frames.some((f) => f.matrix.length !== 6)) throw new Error('Invalid eye track');
    return frames;
  });
  return { body: paths[0], eyes: paths.slice(1, 3), tracks, duration: Number(svg.match(/animation-duration:([\d.]+)s/)?.[1]) * 1000 };
}
export function sampleTrack(track: Frame[], elapsed: number, duration: number): number[] {
  const cycle = Math.max(0, elapsed) / duration;
  const fraction = cycle % 1;
  const offset = Math.floor(cycle) % 2 ? 1 - fraction : fraction;
  const right = track.findIndex((frame) => frame.offset >= offset);
  if (right <= 0) return track[0].matrix;
  const a = track[right - 1], b = track[right];
  return mix(a.matrix, b.matrix, (offset - a.offset) / (b.offset - a.offset));
}
