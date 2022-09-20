#!/usr/bin/env bash

TARGET_DIR="$DATA_DIR/create-config-grp"

echo "Creating test data directory for testing the createConfigGroup command..."
mkdir -p "$TARGET_DIR/mock-dots"
echo "Done!"

echo "Populating mock-dots directory with some fake config groups..."
MOCK_CONFIG_GRP_NAMES=("npm" "git" "bat" "cava")

for CONFIG_GRP_NAME in "${MOCK_CONFIG_GRP_NAMES[@]}"; do
  mkdir -p "$TARGET_DIR/mock-dots/$CONFIG_GRP_NAME"
done
echo -e "Done!\n"
