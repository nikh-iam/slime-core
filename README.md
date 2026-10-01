<div align="center">

<img src="./common/slime-banner.svg" alt="Slime: early development, beta v0.1" width="100%" />

[Get started](#development-windows) · [Architecture](#architecture) · [Manual checks](#manual-checks) · [License](#license)

</div>
<br/>

Slime is an open-source, voice-first desktop assistant. Instead of cluttering your screen with massive text windows, it sits disguised inside your desktop notch, stretching, bouncing, and reacting with fluid animations while it runs system automations and captures your spoken thoughts.

> **Phase Zero:** Tauri 2, React + TypeScript, and Rust. Windows is the only enabled target.
> Startup shows only a tiny top-center notch containing the animated Slime character.
> There is no AI, screen capture/analysis, file automation, or external integration.
> The 16 emotion SVGs in `common/` supply the reusable Slime components; originals are preserved.

## Development (Windows)

Install Node.js 22.13+ LTS, stable Rust (1.90+) with the `x86_64-pc-windows-msvc` toolchain,
Visual Studio Build Tools (Desktop development with C++, including a Windows SDK),
and Microsoft Edge WebView2 Runtime. Reopen your terminal after installing Rust;
`cargo --version` and `rustc --version` must work on PATH.

```powershell
npm ci
npm run tauri dev
```

`npm run dev` serves only the frontend; native operations require the Tauri process.
Vite binds loopback port 1420 with strict port checking, so a conflicting process
causes a clear failure instead of silently changing the desktop URL.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run check:rust
npm run tauri build -- --no-bundle
npm run tauri build
```

`npm run validate` runs lint, character asset tests, TypeScript/frontend build, Rust formatting, Clippy with
warnings denied, Rust tests, and a release executable build. The final command above
also produces an NSIS installer under `src-tauri/target/release/bundle/nsis`.
Commit both dependency lockfiles; generated output and local tooling are ignored.

## Architecture

| Location | Responsibility |
| --- | --- |
| `src/ui` | Composition and an invisible render-error fallback |
| `src/notch` | `NotchWindow`, native state projection, and service contract |
| `src-tauri/src/notch` | Pure `NotchController` state policy and `NotchWindowController` layout coordination |
| `src/character` | Configurable Slime component and 16 SVG-derived emotion subcomponents |
| `src/assistant` | Reserved assistant orchestration boundary |
| `src/platform/contracts.ts` | OS-neutral service interfaces |
| `src/platform/tauri.ts` | IPC transport; contains no Windows assumptions |
| `src/ai`, `src/tools`, `src/permissions`, `src/integrations` | Explicit future module boundaries |
| `src/storage`, `src/shared` | Persistence boundary and shared frontend data types |
| `src-tauri/src/platform` | Native service traits and Windows adapter |
| `src-tauri/src/storage` | App-owned SQLite and settings |
| `src-tauri/src/commands.rs` | Shared semantic action dispatch for IPC, tray, and shortcuts |
| `src-tauri/src/lib.rs` | Composition, logging, single instance, and tray lifecycle |

The UI receives `NotchService`; it does not import Tauri. Rust command handlers
depend on `PlatformService` and its constituent traits. Windows selection occurs
only at native composition. Add an adapter implementing those traits and select it
with target configuration when another OS is actually supported. macOS/Linux builds
are deliberately disabled; no placeholder OS implementations are included.

Window, app lifecycle, scale-factor queries, and the application data directory work
on Windows now. Clipboard, notification delivery, secure secrets, and arbitrary file
access are explicit unavailable boundaries, not pretend implementations. They are
not exposed as native commands. Implement and permission those adapters when needed.
Secure storage has no plaintext fallback.

## Persistence, security, and lifecycle

SQLite initializes `core.sqlite3` in Tauri's app data directory (normally
`%APPDATA%\com.slime.core` on Windows). It uses WAL, a busy timeout, schema
version 1, and a constrained singleton settings row. Existing development settings
and their persistence tests are retained. The notch enforces always-on-top, regardless
of the old test-panel preference; there is no visible settings control.
Invalid databases are reported, never silently replaced. Future schema changes need
versioned migrations. Settings contain no credentials.

Native logging uses the Tauri log plugin with 2 MB rotation; on Windows its default
log directory is under the application's local data directory. Frontend errors also
flow to that logger. Startup/storage failures terminate with an error; command errors
have a code and message. Failures are logged; a render failure hides the overlay
instead of replacing it with an application/error panel. Logs must never contain secrets.

The local notch webview has log and state-event listening permissions. Global shortcut
registration stays native and is not exposed to JavaScript. Custom app commands expose only
the core functions; no shell, filesystem, network, or SQL plugin is installed.
CSP restricts production content to the packaged application and Tauri IPC. Future
integration permissions must be enforced natively, not solely by UI gating.
Development CSP additionally allows the loopback Vite server, HMR WebSocket, and
React's inline refresh preamble; those allowances are not used in release builds.

Close and Hide keep the app in the tray. Left-click the tray icon or choose Show Slime
to restore; Quit exits. A second launch restores the first instance. The single-instance
plugin is registered before storage initialization to prevent competing processes.

Layout dimensions are logical units. `ScreenService` returns the selected monitor's
physical work area and scale factor; the window controller converts each layout once,
rounds to physical pixels, and recomputes X from the work-area center. Negative monitor
origins and top/side taskbars are supported. A Windows-only atomic `SetWindowPos` call
updates position and size together. DPI changes reapply placement; every transition
also queries fresh monitor information. Tauri/WebView2 provide per-monitor DPI awareness.
All page roots remain transparent; only the notch and Slime are painted. There
are no outer webview margins, card, toolbar, labels, or title bar. Rounded corners are
still inside a rectangular native hit region; global click-through is intentionally deferred.
The Windows-only `noRedirectionBitmap` window option prevents an initial white flash;
other-platform window configuration can replace this when its adapter is introduced.

## Notch states and development configuration

`NotchController` is the single native authority. `NotchWindowController` handles
layout and visibility through generic window/screen interfaces, independently of the
future CharacterEngine. React subscribes before reading the initial snapshot and
rejects older revisions, so tray/shortcut actions and IPC responses cannot overwrite
newer state. The native host stays hidden until the first surface is rendered.

| State | Logical native size | Intended future content |
| --- | --- | --- |
| `COLLAPSED` | 90 × 48 | Animated face only |
| `COMPACT` | 220 × 56 | Transient status/notification content |
| `EXPANDED` | 420 × 160 | Prompt/response surface |
| `HIDDEN` | Native window hidden | Tray/background process continues |

Sizes are clamped to the work area. Clicking the placeholder toggles collapsed/compact
(or returns expanded to collapsed). These are temporary validation interactions, with
no real content. **Ctrl+Alt+Shift+F12** invokes the semantic `TOGGLE_ASSISTANT` action:
hidden/collapsed/compact → expanded and focused; expanded → collapsed. This uncommon
development default is configurable because other installed software may reserve it.
Registration conflicts are logged and leave tray controls available.

Configure before launch (no settings window):

```powershell
$env:SLIME_NOTCH_TOP_MARGIN = '12'              # logical pixels, 0–200
$env:SLIME_ASSISTANT_SHORTCUT = 'Ctrl+Alt+Shift+F12'
# Optional: use an exact Windows monitor name instead of the primary monitor.
# $env:SLIME_NOTCH_MONITOR = '\\.\DISPLAY2'
npm run tauri dev
```

For Slime color, size, animation, and emotion props, see [character components](src/character/README.md).

Overrides apply for that process and its children; restart to apply changes. An absent
or disconnected named monitor falls back to the primary monitor. On launch and every
resize, the center anchor is the selected work-area center, never the old window's left
edge. Character SVGs are integrated; AI, notifications, voice, and automation are not implemented.
Future calendar/AI/tool/voice events must request states via the controller/semantic
dispatch path, rather than creating windows. Click-through can later be implemented
inside the platform adapter without changing that state policy.

## Manual checks

1. Start with `npm run tauri dev`; only the tiny face should appear near the top-center
   of the primary work area. Check transparent corners and the absence of any app panel.
2. Click to widen/collapse; verify the native bounds follow the surface, the center stays
   fixed (within rounding), and no white frame flashes.
3. Focus another application and press Ctrl+Alt+Shift+F12; verify expansion/focus, then
   collapse. Use tray Hide and repeat the shortcut to summon from hidden.
4. Verify tray Show, Hide, left-click restore, and Alt+F4 hide without process exit.
5. Launch the built executable twice; verify one process/window remains and restores.
6. Test the monitor override and available 100%, 125%, 150%, and 200% display scaling.
   Check top/side taskbars, negative monitor origins, and work-area alignment.
7. Quit from the tray; confirm normal process termination and check application logs.

Reference: [Tauri configuration](https://v2.tauri.app/reference/config/),
[tray](https://v2.tauri.app/learn/system-tray/),
[single instance](https://v2.tauri.app/plugin/single-instance/),
[logging](https://v2.tauri.app/plugin/logging/).

## License

This project is open-source and available under the [MIT License](LICENSE).
