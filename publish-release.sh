#!/usr/bin/env bash
set -euo pipefail

tracker_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tracker_repository="$tracker_root"
if ! git -C "$tracker_repository" rev-parse --show-toplevel >/dev/null 2>&1; then
  tracker_repository="${tracker_root}/dist/Torchlight-Tracker"
fi
tracker_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$tracker_root/package.json")"
tracker_name="Torchlight-Tracker-linux-port-v${tracker_version}-arch-x64"
tracker_archive="${tracker_root}/dist/releases/${tracker_name}.tar.gz"
tracker_checksum="${tracker_archive}.sha256"
[[ -f "$tracker_archive" && -f "$tracker_checksum" ]] || {
  printf '%s\n' 'Build the release with python3 build-release.py first.' >&2
  exit 1
}
if [[ -n "$(git -C "$tracker_repository" status --porcelain)" ]]; then
  printf '%s\n' 'Commit the application changes before publishing.' >&2
  exit 1
fi
tracker_origin="$(git -C "$tracker_repository" remote get-url origin)"
tracker_origin="${tracker_origin#https://github.com/}"
tracker_origin="${tracker_origin#git@github.com:}"
tracker_origin="${tracker_origin%.git}"
tracker_commit="$(git -C "$tracker_repository" rev-parse HEAD)"
tracker_notes="$(mktemp)"
trap 'rm -f -- "$tracker_notes"' EXIT
cat > "$tracker_notes" <<'NOTES'
Native Linux release for current Arch Linux / Omarchy, x86_64 (glibc 2.44+).

Download the .tar.gz asset and extract the entire folder. Run Torchlight-Tracker.
Electron and native libraries are included; Electron, Node, npm and Python do not need to be installed separately.
Run install-desktop.sh to add Torchlight Tracker to the desktop menu (Super+Space on Omarchy).

The Chromium sandbox remains enabled. The original author's online interface is still required.
No gameplay logs, credentials, internal reports or tests are included.

This is an experimental Linux port. A live game session and Hyprland overlay behavior remain unverified.
NOTES

(cd -- "$(dirname -- "$tracker_archive")" && sha256sum --check -- "$(basename -- "$tracker_checksum")")
git -C "$tracker_repository" push origin main
gh release create "v${tracker_version}-linux-port" "$tracker_archive" "$tracker_checksum" \
  --repo "$tracker_origin" --target "$tracker_commit" --prerelease \
  --title "Torchlight Tracker ${tracker_version} — Linux port" --notes-file "$tracker_notes"
