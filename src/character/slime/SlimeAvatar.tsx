import { useMemo } from 'react';
import { slimeAssets } from './assets';
import type { SlimeEmotion } from './assets';
import { themeSlimeSvg } from './svg';
import './slime.css';

export interface SlimeAppearanceProps {
  /** SVG canvas size in CSS pixels, including the source artwork's breathing room. */
  size?: number;
  /** Literal SVG/CSS body color (hex, rgb(), or named color). */
  color?: string;
  eyeColor?: string;
  animated?: boolean;
  /** Use an empty string when the surrounding control already has an accessible label. */
  alt?: string;
  className?: string;
}

export interface SlimeProps extends SlimeAppearanceProps { emotion?: SlimeEmotion }

export function SlimeAvatar({
  emotion = 'neutre', size = 48, color = '#f5f5f5', eyeColor = '#000000',
  animated = true, alt = `Slime: ${emotion}`, className = '',
}: SlimeProps) {
  const src = useMemo(() => {
    const svg = themeSlimeSvg(slimeAssets[emotion], color, eyeColor, animated);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [emotion, color, eyeColor, animated]);
  const pixels = Number.isFinite(size) && size > 0 ? size : 48;
  // Each image owns its SVG document: identical mask IDs and keyframe names cannot collide.
  return <img className={`slime ${className}`.trim()} data-emotion={emotion}
    src={src} width={pixels} height={pixels} alt={alt} draggable={false} />;
}
