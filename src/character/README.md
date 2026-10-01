# Slime character components

`slime/` renders the 16 original animated SVGs from `common/`. The source files are
imported directly; paths, mask geometry, animation frames, timing, and viewBox are
preserved. Source artwork is not modified or duplicated.

```tsx
import { Slime, Heureux, slimeEmotions } from './character/slime';

<Slime emotion="attentif" size={64} color="#f5f5f5" eyeColor="#000000" />
<Slime.Heureux size={80} color="#ffffff" />
<Heureux size={48} animated={false} />
```

All emotion subcomponents accept the same appearance props:

| Prop | Default | Meaning |
| --- | --- | --- |
| `size` | `48` | Square SVG canvas in CSS pixels; source artwork includes breathing room |
| `color` | `#f5f5f5` | Body color |
| `eyeColor` | `#000000` | Eye color |
| `animated` | `true` | Play source animation, or pause on its first frame |
| `alt` | `Slime: <emotion>` | Accessible text; use `""` inside an already-labeled control |
| `className` | `""` | Optional image class |

Emotion keys follow the source filenames: `attentif`, `blase`, `colere`, `confus`,
`curieux`, `effraye`, `excite`, `fier`, `heureux`, `hilare`, `mefiant`, `neutre`,
`somnolent`, `surpris`, `timide`, `triste`. Subcomponents capitalize those names,
for example `Slime.Somnolent`. `slimeEmotions` exports the keys for future selectors.

Each SVG is an isolated image document, preventing mask IDs, `.oeil0`/`.oeil1`, and
animation keyframes from colliding between characters. Pass literal color values:
CSS variables and `currentColor` from the parent document do not cross image boundaries.
The source's dark masked paint becomes the body color, and the light underlay revealed
by the animated eye holes becomes the eye color. Black/white mask values stay intact.
Reduced-motion preferences pause the animation without losing the emotion's eye transforms.

The notch currently uses `Slime.Neutre` at 44px. Character appearance and emotion are
independent of notch state and native window layout; this is not an AI character engine.
