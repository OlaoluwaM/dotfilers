#!/usr/bin/env bash

set -o errexit

echo "Fixing up fp-ts, io-ts, and monocle-ts imports..."

if command -v sd &>/dev/null; then
  # These commands patch up the imports of the compiled source to allow
  # these CJS modules to be accessed in an ESM evironment
  grep -rl ./dist -e "fp-ts" | xargs -I _ sd "\b(fp-ts(.*))\b" '$1.js' _
  grep -rl ./dist -e "io-ts" | xargs -I _ sd "\b(io-ts(.*))\b" '$1.js' _
  grep -rl ./dist -e "monocle-ts" | xargs -I _ sd "\b(monocle-ts(.*))\b" '$1.js' _
else
  echo "sd (https://github.com/chmln/sd) is not installed, switching to sed..."
  grep -rl ./dist -e "fp-ts" | xargs -I _ sed -i -E "s#\b(fp-ts(.*))\b#\1.js#g" _
  grep -rl ./dist -e "io-ts" | xargs -I _ sed -i -E "s#\b(io-ts(.*))\b#\1.js#g" _
  grep -rl ./dist -e "monocle-ts" | xargs -I _ sed -i -E "s#\b(monocle-ts(.*))\b#\1.js#g" _
fi

echo "Done!"
