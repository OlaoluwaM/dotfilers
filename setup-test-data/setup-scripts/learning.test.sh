#!/usr/bin/env bash

echo "For fs-extra..."
mkdir -p "$DATA_DIR/learning/fs-extra/sample"

echo "For readdirp..."
mkdir -p "$DATA_DIR/learning/readdirp/dirOne"
touch $DATA_DIR/learning/readdirp/dirOne/{destinations.json,sample.js,example.css,index.ts}

mkdir -p "$DATA_DIR/learning/readdirp/dirOne/inner"
touch $DATA_DIR/learning/readdirp/dirOne/inner/{destinations.json,config.json}

mkdir -p "$DATA_DIR/learning/readdirp/dirOne/innerTwo"
touch $DATA_DIR/learning/readdirp/dirOne/innerTwo/{example.ts,farrow.rs}

mkdir -p "$DATA_DIR/learning/readdirp/dirOne/innerThree"
touch $DATA_DIR/learning/readdirp/dirOne/innerThree/{example.py,farrow.cc}

mkdir -p "$DATA_DIR/learning/readdirp/dirOne/innerFour"
touch $DATA_DIR/learning/readdirp/dirOne/innerFour/{destinations.json,farrow.cc}

mkdir -p "$DATA_DIR/learning/readdirp/dirOne/inner/innerTwo"
touch $DATA_DIR/learning/readdirp/dirOne/inner/innerTwo/{destinations.json,farrow.ts}

echo "For globby..."
mkdir -p "$DATA_DIR/learning/globby"
touch $DATA_DIR/learning/globby/{sample.ts,cat.txt,sample.rs,test.js,destinations.json}

mkdir -p "$DATA_DIR/learning/globby/inner"
touch $DATA_DIR/learning/globby/inner/{sample.ts,bat.txt,tmp.rs,orange.css}

mkdir -p "$DATA_DIR/learning/globby/inner/inner"
touch $DATA_DIR/learning/globby/inner/{stat.txt,service.html}
