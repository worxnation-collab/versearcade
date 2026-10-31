#!/usr/bin/env bash
# voice-container — make a cloud session able to split and park the
# operator's recordings (scripts/tiktok-voice.mjs) with no browser egress.
#
#   bash scripts/voice-container.sh          # set up (idempotent), then check
#   bash scripts/voice-container.sh --check  # check only
#
# What it puts in place:
#   - node_modules (the image doesn't ship them)
#   - .tiktok-voice/models/ = MODELS_DIR: Whisper base + tiny (the exact
#     files transformers.js asks for: fp32 encoder, QUANTIZED merged decoder),
#     the ONNX runtime wasm, and the Baloo 2 font for renders
#   - .tiktok-voice/env.sh: source it to get MODELS_DIR, PW_CHROMIUM, FFMPEG
#
# It never needs or writes TIKTOK_RUNNER_TOKEN — that comes from the
# environment's settings, not from a file.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
OUT=$ROOT/.tiktok-voice
M=$OUT/models
CHECK_ONLY=${1:-}

say() { printf '%s\n' "$*"; }
bad=0
need() { if [ -s "$1" ]; then :; else say "  missing: ${1#$ROOT/}"; bad=1; fi; }

HF=https://huggingface.co
FILES=(config.json generation_config.json preprocessor_config.json tokenizer.json tokenizer_config.json
       onnx/encoder_model.onnx onnx/decoder_model_merged_quantized.onnx)
REPOS=(onnx-community/whisper-base.en_timestamped onnx-community/whisper-tiny.en_timestamped)

if [ "$CHECK_ONLY" != "--check" ]; then
  [ -d node_modules/@huggingface/transformers ] || { say "npm install…"; npm install --no-audit --no-fund >/dev/null; }

  for repo in "${REPOS[@]}"; do
    for f in "${FILES[@]}"; do
      dst=$M/models/$repo/$f
      [ -s "$dst" ] && continue
      mkdir -p "$(dirname "$dst")"
      say "fetch $repo/$f"
      curl -fsSL --retry 4 --retry-delay 2 -o "$dst.part" "$HF/$repo/resolve/main/$f" && mv "$dst.part" "$dst"
    done
  done

  mkdir -p "$M/ort"
  ORT=node_modules/onnxruntime-web/dist
  [ -d node_modules/@huggingface/transformers/node_modules/onnxruntime-web ] && ORT=node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist
  cp -f "$ORT"/ort-wasm-simd-threaded* "$M/ort/"

  mkdir -p "$M/fonts"
  for w in 700 800; do
    dst=$M/fonts/baloo2-$w.ttf
    [ -s "$dst" ] && continue
    # Google Fonts serves a TTF to a UA it doesn't recognise as modern.
    url=$(curl -fsSL -A 'curl' "https://fonts.googleapis.com/css2?family=Baloo+2:wght@$w" | grep -o 'https://[^)]*\.ttf' | head -1 || true)
    [ -n "$url" ] && curl -fsSL -o "$dst" "$url" || say "  (font $w not fetched — renders fall back to the web font)"
  done
fi

CHROME=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | head -1 || true)
[ -n "$CHROME" ] || CHROME=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1 || true)
mkdir -p "$OUT"
cat > "$OUT/env.sh" <<EOF
export MODELS_DIR="$M"
export PW_CHROMIUM="$CHROME"
export FFMPEG="\${FFMPEG:-ffmpeg}"
EOF

say "check:"
command -v ffmpeg >/dev/null || { say "  missing: ffmpeg"; bad=1; }
[ -x "$CHROME" ] || { say "  missing: a Chromium under /opt/pw-browsers"; bad=1; }
for repo in "${REPOS[@]}"; do for f in "${FILES[@]}"; do need "$M/models/$repo/$f"; done; done
need "$M/ort/ort-wasm-simd-threaded.wasm"
# A setup script can't see the environment's secrets, so a missing token only
# fails --check (run inside a session), never the setup itself.
if [ -z "${TIKTOK_RUNNER_TOKEN:-}" ]; then
  say "  missing: TIKTOK_RUNNER_TOKEN (add it in the environment's settings)"
  [ "$CHECK_ONLY" = "--check" ] && bad=1
fi
if [ $bad = 0 ]; then say "  ready — source .tiktok-voice/env.sh, then: node scripts/tiktok-voice.mjs split <memo> <date> --dry"; fi
exit $bad
