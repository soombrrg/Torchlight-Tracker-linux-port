# Linux feasibility

The original release uses Electron, a JavaScript file reader and a remotely loaded interface. A native Linux adaptation can retain the interface, translations and calculation logic while replacing platform-specific discovery and launch code.

The original file reader was exercised only against disposable, synthetic logs. Its handling of partial writes, truncation and rotation required fixes; the Linux port has a replacement reader with the same delivery contracts. Original-reader findings are recorded in [original-log-reader.json](evidence/original-log-reader.json).

The Linux implementation is in `linux/`, with startup through `./run-linux.sh`. See the [Linux README](../linux/README.md), [release analysis](release-analysis.md) and [architecture decision](adr/0001-port-original-online-application.md).

## Portable discovery

Torchlight: Infinite uses Steam app ID `1974050`. The port checks Steam metadata and known Steam roots, including additional libraries and Flatpak Steam, for:

```text
steamapps/common/<installation directory>/UE_game/TorchLight/Saved/Logs/UE_game.log
```

An explicit path or native file picker is available when automatic discovery does not find a readable log. No broad filesystem scan or game-process inspection is required.

## Verification boundary

The recorded checks cover unit cases, a native Electron window using a loopback fixture and synthetic logs, and a local connection-error page. The upstream UI, live gameplay and Hyprland overlay behavior remain unverified. See [verification evidence](evidence/linux-verification.json).

Personal installation paths, real game-log excerpts, gameplay timestamps, session counts and game-account data are intentionally absent from this document and the source distribution.
