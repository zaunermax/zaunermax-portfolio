"""Optional Ubuntu/Debian headless setup. Extract missing Mesa/EGL packages locally, no sudo.

Run with python3. Nothing outside out/runtime is written or installed. build.py
automatically uses this private runtime when previews are requested.
"""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent / "out/runtime"
root.mkdir(parents=True, exist_ok=True)
packages = {"libegl1", "libgl1-mesa-dri"}
result = subprocess.check_output([
    "apt-cache", "depends", "--recurse", "--no-recommends", "--no-suggests",
    "--no-conflicts", "--no-breaks", "--no-replaces", "--no-enhances", *sorted(packages)
], text=True)
for line in result.splitlines():
    if line and not line[0].isspace() and not line.startswith("<"):
        packages.add(line)
missing = []
for package in sorted(packages):
    installed = subprocess.run(["dpkg-query", "-W", "-f=${Status}", package], capture_output=True, text=True)
    if installed.stdout != "install ok installed":
        missing.append(package)
if missing:
    subprocess.run(["apt-get", "download", *missing], cwd=root, check=True)
for package in root.glob("*.deb"):
    subprocess.run(["dpkg-deb", "-x", str(package), str(root)], check=True)
print(f"Local software renderer ready: {root}")
