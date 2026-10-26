# Torchlight Tracker — Linux port

Experimental native Linux adaptation of **YiHuo ETor**, based on [Giboork's English translation](https://github.com/Giboork/TLI-tracker-translated), release v1.3.0. This is an independent, unofficial project.

## What is included

**The application code is in [`linux/app/`](linux/app/).** This repository contains the Linux Electron backend, native file handling, preload bridge, translations and icon.

The original application loads its interface from the author's website, and this port preserves that architecture. The hosted frontend, its game-message parser/worker and calculations are loaded at runtime; they are not bundled in this repository. The program requires the author's service and an internet connection.

| File | Purpose |
| --- | --- |
| [`linux/app/main.js`](linux/app/main.js) | Application entry point, windows, native actions and log delivery |
| [`linux/app/preload.js`](linux/app/preload.js) | Bridge between the interface and native application |
| [`linux/app/log-reader.js`](linux/app/log-reader.js) | Read-only incremental game-log collection |
| [`linux/app/linux-paths.js`](linux/app/linux-paths.js) | Steam library and game-log discovery |
| [`linux/app/renderer-compat.js`](linux/app/renderer-compat.js) | Compatibility adjustment for the original desktop log-path getter |
| [`linux/app/security.js`](linux/app/security.js) | IPC authorization and window navigation policy |
| [`linux/app/safe-temp.js`](linux/app/safe-temp.js) | Private temporary exports |
| [`linux/app/window-options.js`](linux/app/window-options.js) | Window-bounds validation |
| [`linux/app/translate.js`](linux/app/translate.js), [`translations.json`](linux/app/translations.json) | Original English translation script and dictionary |
| [`run-linux.sh`](run-linux.sh), [`install-desktop.sh`](install-desktop.sh) | Native startup and desktop-menu installation |

## Run

A system Linux Electron runtime is required; it is not bundled. The launcher recognizes `electron43` through `electron32`, and `electron`. Set `TLI_ELECTRON` to select a specific executable. No `npm install` is needed. Wine is not required for the tracker; the game can continue to use Proton.

```bash
./run-linux.sh
```

Steam libraries are detected automatically, including additional library locations and Flatpak Steam. To select a log manually:

```bash
./run-linux.sh --log '/path/to/UE_game.log'
```

You can also use **Ctrl+O** in the application. The web interface can restart collection for a native-selected path; changing the path requires Steam discovery, `--log`/`TLI_LOG_PATH`, or **Ctrl+O**.

## Desktop menu

The installer requires Python 3:

```bash
./install-desktop.sh
```

On Omarchy, press **Super+Space** and search for **Torchlight Tracker**. The launcher uses the application icon and opens without a terminal. Installation is per-user, without `sudo`. Paths are generated locally; rerun the installer if you move the project folder.

## What the Linux port changes

- Runs the Electron backend natively instead of using the Windows executable.
- Replaces Windows process discovery and PowerShell with Steam metadata and native file selection.
- Collects new log entries from EOF, preserving complete UTF-8 lines and handling truncation and rotation.
- Pauses reads until queued data reaches the interface, preserving ordering across startup and reloads.
- Adapts the original frontend's existing log-path getter so its worker can restart collection on desktop Linux.
- Disables the Windows updater and arbitrary shell execution, validates IPC senders, and guards main/secondary-window navigation.
- Uses private temporary files and closes secondary windows when application exit is confirmed.

The game installation, configuration and process are not modified.

## Configuration

| Variable | Purpose |
| --- | --- |
| `TLI_ELECTRON` | Linux Electron executable path/name |
| `TLI_LOG_PATH` | Explicit game-log path |
| `TLI_USER_DATA_DIR` | Application-data directory; defaults to Electron user data for `etor-linux` |
| `TLI_OZONE_PLATFORM` | `x11` by default for XWayland; `wayland` selects native Wayland |
| `TLI_DEBUG=1` | Diagnostic output; does not replay old log entries |

## Privacy and limitations

Game logs, saves, Steam account data, profiles, credentials and machine-specific desktop entries are excluded from Git. The OS-info API returns empty username and home-directory fields. Internal research and local verification files are not part of the published source tree.

During use, the author's UI receives new log lines and the selected path through the local bridge. Its current network behavior and server-side storage have not been audited. The live upstream UI, a real gameplay session, and Hyprland overlay positioning/click-through remain unverified.

Original attribution, provenance and licensing information: [NOTICE](linux/NOTICE.md). No additional license grant is asserted for upstream-owned code.

---

## Original English translation project

The original translation project's description and attribution are retained below. Its Windows installation instructions apply to the upstream release.

## 🌍 Translation Disclaimer

**This is NOT my original work.**

I have merely translated the user interface from Chinese to English to make this excellent Torchlight: Infinite tracking tool accessible to the international community.

All credit for the development, design, and functionality of this application belongs to the original creators of **易火-ETor (YiHuo ETor)**.

---

## 📦 What This Is

YiHuo ETor is a comprehensive tracking and analysis tool for **Torchlight: Infinite** that helps players:
- Monitor farming efficiency in real-time
- Track item pickups and loot history
- Analyze profit per minute and cost effectiveness
- Record detailed statistics across multiple maps and sessions
- Optimize farming strategies with data-driven insights

---

## 📥 Installation

1. Go to the [Releases](https://github.com/Giboork/TLI-tracker-translated/releases) page
2. Download the latest `TLI-tracker-translated.zip` file
3. Extract the ZIP file to a folder of your choice
4. Run `易火-ETor.exe` to start the application

That's it! The app will run in English.

---

## 🔧 What I Did

This English version includes:
- ✅ Fully translated user interface
- ✅ Translated system dialogs and notifications
- ✅ Pattern-based translation for dynamic content
- ✅ Localized category labels and item names
- ✅ Auto-updating translation system via AppData

**Translation by:** GIBOo_

---

## ⚠️ Important Notes

- This is an **unofficial translation** - not endorsed by the original developers
- If the translated version doesn't work correctly, please revert to the original Chinese version
- All feedback regarding core functionality should be directed to the original creators
- Translation issues can be reported, but I cannot fix bugs in the base application

---

## 🙏 Credits

All credit goes to the original YiHuo ETor development team for creating this powerful tool.

*This translation exists solely to help the global Torchlight: Infinite community.*

---

## 📄 License

The original application's license applies. This translation is provided as-is with no warranties.

If you're the original developer and want this translation removed or modified, please contact me.
