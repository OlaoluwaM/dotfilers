#!/usr/bin/env bash

echo "Creating test data directory for learning tests..."

echo "For fs-extra..."
mkdir -p "$DATA_DIR/learning/fs-extra/sample"
echo "Done!"

echo "For globby..."
mkdir -p "$DATA_DIR/learning/globby"
touch $DATA_DIR/learning/globby/{sample.ts,cat.txt,sample.rs,test.js,destinations.json}

mkdir -p "$DATA_DIR/learning/globby/inner"
touch $DATA_DIR/learning/globby/inner/{sample.ts,bat.txt,tmp.rs,orange.css}

mkdir -p "$DATA_DIR/learning/globby/inner/inner"
touch $DATA_DIR/learning/globby/inner/{stat.txt,service.html}
echo -e "Done!\n"
