#!/usr/bin/env bash

if ! command -v sd &>/dev/null; then
  echo "sd (https://github.com/chmln/sd) is required to run this script. Please install it"
  exit 1
fi

set -o errexit

# These commands patch up the imports of the compiled source to allow
# these CJS modules to be accessed in an ESM evironment
echo "Fixing up fp-ts, io-ts, and monocle-ts imports..."
grep -rl ./dist -e "fp-ts" | xargs -I _ sd "\b(fp-ts(.*))\b" '$1.js' _
grep -rl ./dist -e "io-ts" | xargs -I _ sd "\b(io-ts(.*))\b" '$1.js' _
grep -rl ./dist -e "monocle-ts" | xargs -I _ sd "\b(monocle-ts(.*))\b" '$1.js' _
echo "Done!"
