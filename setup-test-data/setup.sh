#!/usr/bin/env bash

rootDir=$(dirname "$(realpath "$0")")
DATA_DIR="$(dirname "$rootDir")/tests/mock-env"

test -d "$DATA_DIR" && rm -rf "$DATA_DIR"

echo "Seting up mock-env directory...."
mkdir "$DATA_DIR"

echo "Creating mock-dots directory..."
mkdir -p "$DATA_DIR/mock-dots"

echo "Creating mock-home directory..."
mkdir -p "$DATA_DIR/mock-home"
