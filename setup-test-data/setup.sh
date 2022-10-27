#!/usr/bin/env bash

rootDir=$(dirname "$(realpath "$0")")
DATA_DIR="$(dirname "$rootDir")/tests/test-data"

test -d "$DATA_DIR" && rm -rf "$DATA_DIR"

echo -e "Seting up mock data for tests...\n\n"

mkdir "$DATA_DIR"

echo -e "Setting up test-data for the sync command tests...\n"
source "$rootDir/setup-scripts/sync.test.sh"
echo -e "Done!\n\n"

echo "Setting up test-data for the link command tests..."
source "$rootDir/setup-scripts/link.test.sh"
echo -e "Done!\n\n"

echo "Setting up test-data for the unlink command tests..."
source "$rootDir/setup-scripts/unlink.test.sh"
echo -e "Done!\n\n"

echo "Setting up test-data for the learning tests..."
source "$rootDir/setup-scripts/learning.test.sh"
echo -e "Done!\n\n"

echo "Setting up test-data for the createConfigGroup command tests..."
source "$rootDir/setup-scripts/createConfigGroup.test.sh"
echo -e "Done!\n\n"

echo "Setup Complete :)"
