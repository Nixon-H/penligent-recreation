#!/usr/bin/env bash
#
# Re-fetch the vendored tools.
#
# The reference ships xray, crawlergo and chrome-headless-shell inside
# `resources/depency/`. Those binaries are what the scanner and the crawler
# run, so they are part of the reconstruction's behaviour rather than an
# optional extra.
#
# Rather than depending on a 248 MB blob sitting in the working tree, this
# script restores them from the authoritative source — the original package —
# and verifies them against the manifest. The original package is never
# modified; it is only read.
#
#   ./scripts/fetch-dependencies.sh [path-to-deb]
#
# The default path is the one the analysis used.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEB_PATH="${1:-/home/nixon/penligent.kali_amd64_2.1.6.deb}"
MANIFEST="$PROJECT_DIR/resources/depency/MANIFEST.json"
TARGET="$PROJECT_DIR/resources/depency"

if [ ! -f "$DEB_PATH" ]; then
  echo "error: the original package is not at $DEB_PATH" >&2
  echo "       pass the path as the first argument" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "reading $DEB_PATH"
ar p "$DEB_PATH" data.tar.xz > "$WORK/data.tar.xz" 2>/dev/null \
  || ar p "$DEB_PATH" data.tar.gz > "$WORK/data.tar.xz"
tar -xf "$WORK/data.tar.xz" -C "$WORK" 2>/dev/null || \
  tar -xzf "$WORK/data.tar.xz" -C "$WORK" 2>/dev/null || \
  { gzip -dc "$WORK/data.tar.xz" | tar -xf - -C "$WORK"; }

SOURCE="$(find "$WORK" -type d -name depency -path '*resources*' | head -1)"
if [ -z "$SOURCE" ]; then
  echo "error: no resources/depency directory inside the package" >&2
  exit 1
fi

echo "restoring $SOURCE -> $TARGET"
mkdir -p "$TARGET"
# Apple's resource forks are build artefacts of the original packaging; the
# recreation does not need them.
rsync -a --exclude '._*' "$SOURCE/" "$TARGET/"

if [ -f "$MANIFEST" ]; then
  echo "verifying against the manifest"
  python3 - "$MANIFEST" "$TARGET" <<'PY'
import hashlib, json, os, sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
root = sys.argv[2]
missing, changed = [], []
for entry in manifest["files"]:
    path = os.path.join(root, entry["path"])
    if not os.path.isfile(path):
        missing.append(entry["path"])
        continue
    digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
    if digest != entry["sha256"]:
        changed.append(entry["path"])
if missing:
    print("missing:", *missing, sep="\n  ")
if changed:
    print("checksum differs:", *changed, sep="\n  ")
if missing or changed:
    sys.exit(1)
print(f"all {len(manifest['files'])} files match the manifest")
PY
fi

echo "done"
