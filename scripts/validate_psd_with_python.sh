#!/usr/bin/env bash
# Independent third-party PSD interoperability check (brief §30's
# requirement to test the exported PSD in real editing software, adapted to
# what's actually available in a headless build environment with no
# Photoshop/Photopea/Affinity/Krita installed -- see KNOWN_LIMITATIONS.md).
#
# Builds a tiny fixture program that runs the real fallback decomposition
# pipeline and writes a real multi-layer PSD via engine/io/psd_writer.cpp,
# then opens that file with two independent, unrelated third-party Python
# PSD parsers (psd-tools and Pillow's built-in PSD plugin) neither of which
# shares any code with this project. If both can open it, parse its layer
# structure, and composite it, that's real evidence of spec conformance --
# not a substitute for opening it in actual Photoshop-family software, but
# real signal from tools we don't control.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CPP_DIR="$REPO_ROOT/android/app/src/main/cpp"
FIXTURE_SRC="$REPO_ROOT/android/native_host_tests/psd_export_fixture.cpp"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "=== Building PSD export fixture ==="
g++ -std=c++17 -I"$CPP_DIR" "$FIXTURE_SRC" \
  "$CPP_DIR/engine/common/types.cpp" \
  "$CPP_DIR/engine/common/connected_components.cpp" \
  "$CPP_DIR/engine/document/layer.cpp" \
  "$CPP_DIR/engine/document/project.cpp" \
  "$CPP_DIR/engine/io/uf7p_format.cpp" \
  "$CPP_DIR/engine/io/png_writer.cpp" \
  "$CPP_DIR/engine/io/psd_writer.cpp" \
  "$CPP_DIR/engine/fallback/segmentation_fallback.cpp" \
  "$CPP_DIR/engine/fallback/inpaint_fallback.cpp" \
  "$CPP_DIR/engine/api.cpp" \
  "$CPP_DIR/engine/session.cpp" \
  -lz -o "$WORKDIR/psd_export_fixture"

echo "=== Generating PSD from the real fallback pipeline ==="
"$WORKDIR/psd_export_fixture" "$WORKDIR/unflatten_validation.psd"

echo
echo "=== Validating with psd-tools (pip install psd-tools) ==="
python3 -c "
from psd_tools import PSDImage
psd = PSDImage.open('$WORKDIR/unflatten_validation.psd')
print(f'Document size: {psd.width}x{psd.height}, color mode: {psd.color_mode}')
print(f'Layers: {len(psd)}')
assert len(psd) >= 2, 'expected at least background + one object layer'
for layer in psd:
    img = layer.topil()
    assert img is not None, f'layer {layer.name!r} failed to decode pixel data'
    print(f'  - {layer.name!r}: bbox={layer.bbox}, decoded {img.size} {img.mode}')
composite = psd.composite()
composite.save('$WORKDIR/composite_via_psdtools.png')
print(f'Composite rendered OK: {composite.size} {composite.mode}')
print('PASS: psd-tools opened, parsed all layers, and composited the file successfully.')
"

echo
echo "=== Validating with Pillow's built-in PSD plugin ==="
python3 -c "
from PIL import Image
im = Image.open('$WORKDIR/unflatten_validation.psd')
assert im.format == 'PSD'
im.convert('RGB').save('$WORKDIR/flattened_via_pillow.png')
print(f'PASS: Pillow opened the file ({im.size}, {im.mode}) and flattened it successfully.')
"

echo
echo "=== PSD validation complete: both independent third-party parsers succeeded ==="
