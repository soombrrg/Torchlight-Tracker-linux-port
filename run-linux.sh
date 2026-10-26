#!/usr/bin/env bash
set -euo pipefail

tracker_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tracker_electron="${TLI_ELECTRON:-}"
tracker_app="${tracker_root}/linux/app"
tracker_arguments=()

if [[ -f "${tracker_root}/runtime/resources/app.asar" ]]; then
  tracker_app="${tracker_root}/runtime/resources/app.asar"
fi

if [[ -z "$tracker_electron" && -x "${tracker_root}/runtime/electron" ]]; then
  tracker_electron="${tracker_root}/runtime/electron"
  # Portable archives use the kernel's user-namespace sandbox, without a root-owned helper.
  tracker_arguments+=(--disable-setuid-sandbox)
fi

if [[ -d "${tracker_root}/runtime/lib" ]]; then
  export LD_LIBRARY_PATH="${tracker_root}/runtime/lib:${tracker_root}/runtime${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
fi

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
exec "$tracker_electron" "$tracker_app" "${tracker_arguments[@]}" \
  "--ozone-platform=${TLI_OZONE_PLATFORM:-x11}" \
  --class=etor-linux "$@"
