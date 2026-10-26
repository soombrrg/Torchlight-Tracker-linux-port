#!/usr/bin/env bash
set -euo pipefail

tracker_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tracker_electron="${TLI_ELECTRON:-}"

if [[ -z "$tracker_electron" ]]; then
  for tracker_candidate in electron43 electron42 electron41 electron40 electron39 electron38 electron37 electron36 electron35 electron34 electron33 electron32 electron; do
    if command -v "$tracker_candidate" >/dev/null 2>&1; then
      tracker_electron="$(command -v "$tracker_candidate")"
      break
    fi
  done
fi

if [[ -z "$tracker_electron" ]]; then
  printf '%s\n' 'Electron is required. Set TLI_ELECTRON to its executable path.' >&2
  exit 1
fi

# XWayland supports the original overlay positioning and click-through APIs.
# Opt into native Wayland with TLI_OZONE_PLATFORM=wayland.
unset ELECTRON_RUN_AS_NODE
exec "$tracker_electron" "${tracker_root}/linux/app" \
  "--ozone-platform=${TLI_OZONE_PLATFORM:-x11}" \
  --class=etor-linux "$@"
