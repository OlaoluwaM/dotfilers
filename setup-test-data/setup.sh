#!/usr/bin/env bash

rootDir=$(dirname "$(realpath "$0")")
DATA_DIR="$(dirname "$rootDir")/tests/test-data"

test -d "$DATA_DIR" && rm -rf "$DATA_DIR"

echo "Seting up test-data directory...."
mkdir "$DATA_DIR"

echo "Creating test data directory for testing link command..."
mkdir -p "$DATA_DIR/link/mock-dots"
mkdir -p "$DATA_DIR/link/mock-home"
echo -e "Done!\n"

echo "Creating test data directory for learning tests..."

echo "For globby..."
mkdir -p "$DATA_DIR/learning/globby"
touch $DATA_DIR/learning/globby/{sample.ts,cat.txt,sample.rs,test.js,destinations.json}

mkdir -p "$DATA_DIR/learning/globby/inner"
touch $DATA_DIR/learning/globby/inner/{sample.ts,bat.txt,tmp.rs,orange.css}

mkdir -p "$DATA_DIR/learning/globby/inner/inner"
touch $DATA_DIR/learning/globby/inner/{stat.txt,service.html}
echo -e "Done!\n"
