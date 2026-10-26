# Original files and Linux changes

This port uses the YiHuo ETor application distributed in Giboork's English translation release v1.3.0. Development and design of the original application belong to its original authors; the English translation belongs to Giboork.

Source distribution: https://github.com/Giboork/TLI-tracker-translated/releases/tag/v1.3.0

Source `app.asar` SHA-256: `5b908d0f3c0c6043ec9f0d781fdfbc66feb135a16b345e63a5ac61a8f5ef370c`.

- `app/main.js` and `app/preload.js` derive from the **active** `build/obf-app/` entry points, with Linux integration changes.
- `app/translate.js`, `app/translations.json` and `app/etor.png` are copied unchanged from the release.
- `app/node_modules/ws/` is copied from the release, including its license and package metadata.
- `app/log-reader.js` and `app/linux-paths.js` implement Linux file watching and discovery. They do not parse game messages or replace the original UI/calculations.

The original distribution is not included in the Linux source repository or archive. If it is present locally in `TLI-tracker-translated-v1.3.0/`, it is left untouched and excluded from Git. The application still loads the original author's online UI and APIs. This document records provenance and does not grant additional rights to the original application or translation.
