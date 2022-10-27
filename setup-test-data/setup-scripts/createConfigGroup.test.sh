#!/usr/bin/env bash

TARGET_DIR="$DATA_DIR/create-config-grp"

mkdir -p "$TARGET_DIR/mock-dots"

echo "Populating mock-dots directory with some fake config groups..."
MOCK_CONFIG_GRP_NAMES=("npm" "git" "bat" "cava")

for CONFIG_GRP_NAME in "${MOCK_CONFIG_GRP_NAMES[@]}"; do
  mkdir -p "$TARGET_DIR/mock-dots/$CONFIG_GRP_NAME"
done
