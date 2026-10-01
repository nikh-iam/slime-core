# Notch motion architecture and validation

Semantic states are destinations, not animation frames. Intermediate logical widths and heights are expected.

## Ownership

1. Rust `NotchController` owns the requested semantic state and its revision. Alt+S, tray actions, pointer actions, and future integrations use the same dispatch path.
2. TypeScript `NotchMotionController` owns continuous physical geometry and velocity. Critically damped springs preserve position and velocity on interruption. Width leads height; content reveal follows available space; collapse withdraws content before reducing height.
3. `NotchMotionDriver` owns one animation-frame chain and one native resize request in flight. It coalesces requests, rejects stale acknowledgements, constrains painting against pending shrink bounds, and stops when both geometry and host have settled.
4. Rust `NotchWindowController` owns DPI-aware host bounds and work-area placement. `NotchRuntime` coordinates it with semantic state and lifecycle. Renderer readiness advances the revision to invalidate previous-page requests.

The renderer paints a clipped dark surface and a physically attached character. Character emotion and internal SVG animation remain independent of notch geometry. No product content is implemented.

## Host strategy

The host follows a bounded, temporary look-ahead envelope rather than retaining expanded bounds. Predictions include spring acceleration and velocity, capped at 96 logical pixels of extra width and 48 of extra height. Native resize cadence has one internal default and development overrides of 16/24/32/40ms. Requests are serialized; no backlog is queued. The settled host contracts to the visible geometry plus physical-pixel rounding.

Native width parity matches the work-area width so changing host dimensions does not alternate the anchor by half a physical pixel. The top anchor is fixed at the configured margin; only the entrance/exit surface moves inside it. Very small work areas clamp host dimensions.

Hide is a semantic target first. The process and native window survive while the surface retracts. Only a completion with the current revision hides the host. Restoration prepares the small host before showing it. Closing the window follows this same lifecycle.

## Development diagnostics

Run `npm run tauri dev`. The browser-only lab is `http://127.0.0.1:1420/?notch-motion-lab`; its outline represents the host and does not prove native performance.

For an actual development WebView2 measurement, launch with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`, then load the development URL with `?motion-diagnostics&resize-interval=32` in that WebView. The opt-in `window.__notchDiagnostics` provides bounded samples and current driver state without putting diagnostics on the normal overlay. It is absent from production.

Samples include semantic state, current/target geometry, spring velocity, frame interval, requested/acknowledged bounds, resize latency, coalescing count, safety holds, content progress, settled state, actual viewport, and DPI. Change cadence only between test runs.

`onRevealStart`, `onContentReady`, `onCollapseStart`, and `onSettled` synchronize future consumers. Interrupted targets do not produce a false completion. Hover settling does not repeat semantic completion. Real content can stay mounted inside `.notch-content`; it is clipped and inert until ready.

## Known hit-region limitation

Windows/WebView2 still exposes a rectangular native hit region. Transparent rounded corners and temporary look-ahead padding can intercept desktop clicks. This phase does not add global click-through. Padding is bounded during motion and removed at rest; a collapsed notch never retains the full expanded hit region.

## Validation status

See the accompanying runtime evidence report for measured intervals, physical DPI coverage, and outstanding visual acceptance. Automated geometry tests at multiple DPI values are not a substitute for physically changing Windows display scaling. Phase 1B must not be called complete without visual acceptance in the native runtime.
