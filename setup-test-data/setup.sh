#!/usr/bin/env bash

rootDir=$(dirname "$(realpath "$0")")
DATA_DIR="$(dirname "$rootDir")/tests/test-data"

test -d "$DATA_DIR" && rm -rf "$DATA_DIR"

echo "Seting up test-data directory...."
mkdir "$DATA_DIR"

source "$rootDir/setup-scripts/link.test.sh"
source "$rootDir/setup-scripts/unlink.test.sh"
source "$rootDir/setup-scripts/learning.test.sh"
source "$rootDir/setup-scripts/createConfigGrp.test.sh"
