function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}

/** Recolor only the artwork paints; black/white mask values must remain intact. */
export function themeSlimeSvg(source: string, color: string, eyeColor: string, animated: boolean): string {
  // The originals paint a dark masked rectangle over a light silhouette.
  // The animated eye holes reveal that silhouette, so its paint is the eye color.
  const paints: Record<string, string> = { '#0a0a0c': color, '#f9f9f9': eyeColor };
  const themed = source.replace(/fill="(#0a0a0c|#f9f9f9)"/g,
    (_match, paint: string) => `fill="${escapeAttribute(paints[paint])}"`);
  const pause = '.oeil0,.oeil1{animation-play-state:paused!important}';
  // Pause rather than remove animations: the first-frame eye transforms define the emotion.
  const motion = animated ? `@media(prefers-reduced-motion:reduce){${pause}}` : pause;
  return themed.replace('</svg>', `<style>${motion}</style></svg>`);
}
