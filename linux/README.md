# Torchlight Tracker on Linux

Native Linux adaptation of YiHuo ETor, based on the v1.3.0 English translation. The interface, game-message parser and calculations remain upstream code, loaded from the original author's website. Wine is not required for the tracker; the game can continue to run through Proton.

## Start

From the project root:

```bash
./run-linux.sh
```

The launcher recognizes `electron43` through `electron32`, and `electron`. Use `TLI_ELECTRON` to select another executable. The application uses Electron and Node's built-in modules; no dependency download or `npm install` is needed.

To add the application to the desktop menu:

```bash
./install-desktop.sh
```

On Omarchy, press **Super+Space** and search for **Torchlight Tracker**. The installer requires Python 3; it uses the application icon and creates a launcher that opens without a terminal. Installation is per-user, without `sudo`. Paths are generated on the local machine during installation. If you move the project, run the installer again.

Steam logs are located through `appmanifest_1974050.acf` and `libraryfolders.vdf`, including additional libraries, XDG locations and Flatpak Steam. An explicit path takes priority:

```bash
./run-linux.sh --log '/path/to/UE_game.log'
```

`TLI_LOG_PATH` is also supported. Use **Ctrl+O** to select another log in the running application; the interface reloads and connects to that file.

The web interface can restart collection for the native-selected path. Changing to a different path requires Steam discovery, `--log`/`TLI_LOG_PATH`, or **Ctrl+O**; a website-provided path alone does not authorize local file access.

If game logging is disabled, enable it through the game's normal settings. As with the original application, selecting the character again and sorting the relevant inventory tabs may be necessary to populate initial character/inventory state. The port does not change game settings or files.

## Changes

- System Linux Electron replaces the Windows executable.
- Steam metadata replaces `tasklist`, PowerShell and game-process inspection.
- Read-only UTF-8 collection handles incomplete writes, truncation and rotation. Only new entries are read at startup, even with `NODE_ENV=development`.
- The selected path is available to the original UI when its worker restarts. A narrow frontend adjustment enables the existing desktop `getGameLogPath` fallback.
- The original IPC API is retained; queued data survives renderer startup and reloads. The unused WebSocket transport and its dependency were removed; `getWssPort()` returns `null` for compatibility.
- Further reads pause until the current chunk drains, including small appends, so an unavailable interface cannot accumulate successive queued chunks in memory.
- The Windows updater is disabled. The web interface cannot execute arbitrary shell commands; external HTTP(S) links use Electron's API.
- A local error page offers manual retry when the upstream UI is unavailable, without automatic retry loops.
- OS-info responses return empty username and home-directory fields while preserving the original API shape.
- Every IPC request checks its registered window, main frame and exact origin. Main and secondary windows share navigation, redirect and popup guards; the local error page can only retry, close, or obtain its window ID.
- Preload subscriptions never expose IPC event objects or return `ipcRenderer`. Web permissions are denied, and arbitrary webviews cannot attach.
- Temporary exports use unique private directories and exclusive owner-only files. Window bounds accept zero coordinates, restoration is tracked per window, and confirmed main-window exit closes secondary windows.

The author's website is required. This is not a standalone copy of the service. Current service availability, prices and live gameplay results have not been verified.

## Environment

| Variable | Purpose |
| --- | --- |
| `TLI_ELECTRON` | Path/name of a Linux Electron executable |
| `TLI_LOG_PATH` | Explicit game-log path |
| `TLI_USER_DATA_DIR` | Separate application-data directory; defaults to Electron `userData` for `etor-linux` |
| `TLI_OZONE_PLATFORM` | Defaults to `x11` for XWayland and original overlay APIs; `wayland` selects native Wayland |
| `TLI_DEBUG=1` | Diagnostic output; does not replay historical log entries |

Overlay positioning and click-through need verification in a real Hyprland session. The launcher does not change Hyprland or Omarchy configuration.

## Privacy

The repository and source archive exclude game logs, Steam account data, profiles, credentials and generated desktop entries. Analysis records use relative paths and contain no personal gameplay statistics. Test fixtures are synthetic.

During use, the upstream UI receives new game-log lines and the selected path through the original local bridge. Its current server-side storage and network behavior have not been audited. Redacting the OS-info fields does not hide information already present in the log path or game messages.

## Checks

```bash
npm test
npm run test:electron
```

The Electron test requires Xvfb and Electron. It uses `--no-sandbox` only inside the test virtual display; the normal launcher does not pass that flag. It uses a local HTTP fixture, a synthetic log and an isolated profile, without contacting the author's website or launching the game.

Recorded verification: 36 unit cases and native Electron 43.7.11 smoke tests, covering automatic collection, 1,205 ordered lines, UTF-8 and partial writes, renderer startup/reload queues, original-worker path recovery, shell-command rejection, unauthorized paths, stop and restart. The native test additionally verifies identity redaction, safe preload listener returns, disabled loopback transport, secondary-window navigation blocking and confirmed-exit cleanup. Report: [linux-electron-smoke.json](../docs/evidence/linux-electron-smoke.json). Review and resolved findings: [code-review.md](../docs/code-review.md).

The recorded native tests used REA process capture on a virtual display because the terminal sandbox blocks Chromium startup. They exited successfully and verified cleanup of their own processes. They did not load the live upstream interface or use a real gameplay session.

The local connection-error page was tested separately. Scope and evidence IDs: [linux-verification.json](../docs/evidence/linux-verification.json).

The frontend getter adjustment uses [Electron protocol.handle](https://www.electronjs.org/docs/latest/api/protocol), forwarding the original request with [net.fetch and bypassCustomProtocolHandlers](https://www.electronjs.org/docs/latest/api/net#netfetchinput-init). TLS and certificate validation remain enabled; the adjustment does not introduce an extra request.

Original-file provenance and licensing: [NOTICE.md](NOTICE.md). Architecture decision: [ADR](../docs/adr/0001-port-original-online-application.md).
