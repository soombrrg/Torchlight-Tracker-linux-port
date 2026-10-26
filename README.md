# Torchlight Tracker

Native Linux adaptation of **YiHuo ETor**, based on [Giboork's English translation](https://github.com/Giboork/TLI-tracker-translated), release v1.3.0. This is an independent personal-use derivative; it is not an official project or a GitHub fork-network repository.

The original interface, game-message parser, translations and calculations are preserved. The interface still loads from the original author's website, so an internet connection and that service are required.

## Run on Linux

Requirements: a system Linux Electron runtime and read access to the Torchlight: Infinite log. The launcher recognizes `electron43` through `electron32`, and `electron`. Set `TLI_ELECTRON` to use a specific executable. Wine is not required for the tracker; the game may continue to run through Proton.

```bash
./run-linux.sh
```

Steam libraries are discovered automatically, including additional library locations and Flatpak Steam. To select a log manually:

```bash
./run-linux.sh --log '/path/to/UE_game.log'
```

You can also select a log with **Ctrl+O**. No `npm install` is needed; the required `ws` dependency is bundled with its license.

## Desktop launcher

```bash
./install-desktop.sh
```

On Omarchy, press **Super+Space** and search for **Torchlight Tracker**. The installer requires Python 3; it uses the application icon and creates a launcher that opens without a terminal. Installation is per-user and requires no `sudo`. Paths are resolved locally during installation; rerun the installer if you move the project folder.

## Linux changes

- Native Electron launch with XWayland by default; optional native Wayland through `TLI_OZONE_PLATFORM=wayland`.
- Steam log discovery instead of Windows process inspection and PowerShell.
- Read-only, incremental log collection starting at the end of the file, with complete UTF-8 lines, truncation and rotation handling.
- Queued delivery while the renderer starts or reloads, and recovery of the selected log path when the original worker restarts.
- A narrow compatibility adjustment to the original frontend's existing desktop log-path getter.
- Windows self-updating disabled, arbitrary shell-command execution blocked, and a local connection-error page with manual retry.

Full configuration and verification details: [Linux README](linux/README.md).

## Privacy and repository contents

- Game logs, saves, Steam account data, Electron profiles, cookies and credentials are not included in the source distribution.
- Machine-specific desktop launchers, downloaded Windows releases, local configuration, logs and build archives are excluded from Git.
- Published analysis uses relative paths and excludes personal gameplay statistics. Test records contain synthetic data.
- The original OS-info bridge preserves its API shape but returns empty username and home-directory fields.
- The source archive normalizes file ownership so archive metadata does not contain the packager's local account name.

The application still executes the author's online UI. That UI receives new log lines and the selected log path through the original local bridge. Repository cleanup does not establish what the remote service stores or transmits; its current network behavior has not been audited.

## Verification and limitations

```bash
npm test
npm run test:electron
```

The existing verification includes 25 unit cases and native Electron 43.7.11 smoke tests against synthetic logs and a loopback HTTP fixture. The live upstream UI, a real gameplay session, and Hyprland overlay positioning/click-through remain unverified. See [verification evidence](docs/evidence/linux-verification.json) for the scope of the recorded runs. The smoke test also checks OS-info identity redaction when rerun.

The online service remains an external dependency. This port does not grant additional rights to the original application; original credits and provenance are retained in [NOTICE](linux/NOTICE.md).

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
