# Publication code review

Scope: the complete initial Linux port (`7f1e04a`) against the empty tree, followed by review of the publication fixes. The requirements are the native-port decision, Linux README, and the requested desktop launch, portable paths and source privacy. This review covers the supplied application code and local test fixtures; it does not audit the live upstream service.

## Standards

No hard violations of the supplied repository rules were found. Three maintainability heuristics were raised:

1. **Divergent Change:** the main process combined translation injection, window lifecycle, persistence and two transports. The security inconsistency was addressed with a shared `security.js` policy, private exports in `safe-temp.js`, and removal of the unused transport. The inherited translation integration remains in the main process.
2. **Duplicated Code:** repeated window lookup/close handlers remain a small compatibility seam. Their security decisions are now centralized; both legacy close channel names are retained.
3. **Speculative Generality:** the WebSocket listener was not used by the supplied desktop frontend. It and the vendored dependency were removed rather than expanded.

Concrete fixes from this axis also cover valid zero window coordinates, per-window restoration state, safe return values from every preload subscription/removal method, and closing secondary windows when main-window exit is confirmed.

Standards result: **0 hard violations; 3 heuristics addressed in the security/transport changes, with some inherited window-handler duplication retained.** No additional proven P1/P2 defect remained after review and the lifecycle fix.

## Spec

Three concrete original findings were confirmed:

1. **Unbounded queue with an unavailable UI.** Small EOF appends could continue accumulating without acknowledgements. The consumer now pauses collection for each queued chunk, and collection resumes after IPC drains. A regression test proves additional appends stay on disk while paused.
2. **Unauthenticated loopback receiver.** Any accepted WebSocket client could take over log delivery. The unused listener was removed; the application uses Electron IPC with registered-window, main-frame and exact-origin checks.
3. **Unacknowledged WebSocket batch loss.** The old transport removed batches before acknowledgement and could clear a newer client from an older disconnect callback. Removing that unused transport removes both failure paths.

Additional hardening restricts renderer-started collection to a native-selected path, blocks foreign navigation/redirects in secondary windows, limits the local error page to retry/close/window ID, prevents preload exposure in child frames, and creates exports in private directories without following a predictable shared temporary filename.

Spec result: **3 original code findings resolved; 0 remaining proven P1/P2 code findings in the reviewed scope.**

## Verification

- 36 unit cases pass, including flow control, frame/origin authorization, preload boundaries, private exports and window bounds.
- Native Electron 43.7.11 smoke test passes with a loopback renderer and synthetic game log. It creates three windows across navigation and exit scenarios, verifies 1,205 ordered log lines, UTF-8, reload/restart, safe listener returns, selected-path enforcement and secondary-window cleanup.
- The local connection-error scenario passes separately. Both native captures exit with code 0 and verified cleanup of their own processes.
- Evidence IDs and summaries: [linux-verification.json](evidence/linux-verification.json).

The live upstream UI, a real game session, and Hyprland overlay placement/click-through remain unverified. The upstream service's data collection and the application's redistribution licensing are separate unresolved questions; provenance and the available notices are recorded in [NOTICE](../linux/NOTICE.md).
