#!/usr/bin/env bash

rootDir=$(dirname "$(realpath "$0")")
DATA_DIR="$(dirname "$rootDir")/tests/test-data"

test -d "$DATA_DIR" && rm -rf "$DATA_DIR"

echo "Seting up test-data directory...."
mkdir "$DATA_DIR"

echo "Creating test data directory for testing link command..."
mkdir -p "$DATA_DIR/link/mock-dots"
mkdir -p "$DATA_DIR/link/valid-mock-dots"

echo "Populating mock-dots directory with fake dots..."
MOCK_CONFIG_GRP_PATHS=("$DATA_DIR/link/mock-dots/npm" "$DATA_DIR/link/valid-mock-dots/npm" "$DATA_DIR/link/mock-dots/git" "$DATA_DIR/link/valid-mock-dots/git" "$DATA_DIR/link/mock-dots/bat" "$DATA_DIR/link/valid-mock-dots/bat" "$DATA_DIR/link/mock-dots/neovim" "$DATA_DIR/link/valid-mock-dots/neovim" "$DATA_DIR/link/mock-dots/withAllIgnored" "$DATA_DIR/link/mock-dots/withSomeIgnored" "$DATA_DIR/link/mock-dots/withPathIssues" "$DATA_DIR/link/mock-dots/withAllDotsToOneLoc" "$DATA_DIR/link/mock-dots/tilix" "$DATA_DIR/link/valid-mock-dots/tilix")

for CONFIG_GRP_PATH in "${MOCK_CONFIG_GRP_PATHS[@]}"; do
  CONFIG_GRP_NAME=$(echo "$CONFIG_GRP_PATH" | awk -F "/" '{ print $NF }')

  mkdir -p "$CONFIG_GRP_PATH"
  ln -sf "$rootDir/mock-destination-files/${CONFIG_GRP_NAME}.destinations.json" "$CONFIG_GRP_PATH/destinations.json"
done

touch $DATA_DIR/link/mock-dots/npm/{.npmrc,npm-config.json}
cp -r -n $DATA_DIR/link/mock-dots/npm/. $DATA_DIR/link/valid-mock-dots/npm/

touch $DATA_DIR/link/mock-dots/git/{.gitconfig,.gitignore}
cp -r -n $DATA_DIR/link/mock-dots/git/. $DATA_DIR/link/valid-mock-dots/git/

touch $DATA_DIR/link/mock-dots/bat/{bat-config.json,.bat-colors}
cp -r -n $DATA_DIR/link/mock-dots/bat/. "$DATA_DIR/link/valid-mock-dots/bat"

touch $DATA_DIR/link/mock-dots/neovim/{config.lua,neovim.user.config.lua}
cp -r -n $DATA_DIR/link/mock-dots/neovim/. $DATA_DIR/link/valid-mock-dots/neovim/

touch $DATA_DIR/link/mock-dots/tilix/{config.json,user.css,themes.txt}
cp -r -n $DATA_DIR/link/mock-dots/tilix/. $DATA_DIR/link/valid-mock-dots/tilix/

touch $DATA_DIR/link/mock-dots/withAllIgnored/{config.txt,sample.json,script.sh}
touch $DATA_DIR/link/mock-dots/withSomeIgnored/{navi.config.yaml,navi.sample.json,navi.script.sh,setup.yaml}
touch $DATA_DIR/link/mock-dots/withPathIssues/{sample.rs,setup.ts,.configrc}
touch $DATA_DIR/link/mock-dots/withAllDotsToOneLoc/{sample.rs,setup.ts,.configrc}

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
