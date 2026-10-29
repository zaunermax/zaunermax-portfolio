#!/bin/sh
# Same software-EGL environment build.py uses.
R=$(cd "$(dirname "$0")/.." && pwd)/out/runtime
export VOXKIT_SOFTWARE_READY=1 LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless
export LD_LIBRARY_PATH="$R/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
export __EGL_VENDOR_LIBRARY_FILENAMES="$R/usr/share/glvnd/egl_vendor.d/50_mesa.json"
exec blender -b -P "$(dirname "$0")/render.py" -- "$@"
