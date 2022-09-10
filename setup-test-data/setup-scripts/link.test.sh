#!/usr/bin/env bash

TARGET_DIR="$DATA_DIR/link"

echo "Creating test data directory for testing the link command..."
mkdir -p "$TARGET_DIR/mock-dots"
mkdir -p "$TARGET_DIR/valid-mock-dots"

echo "Populating mock-dots directory with fake dots..."
MOCK_CONFIG_GRP_PATHS=("$TARGET_DIR/mock-dots/npm" "$TARGET_DIR/valid-mock-dots/npm" "$TARGET_DIR/mock-dots/git" "$TARGET_DIR/valid-mock-dots/git" "$TARGET_DIR/mock-dots/bat" "$TARGET_DIR/valid-mock-dots/bat" "$TARGET_DIR/mock-dots/neovim" "$TARGET_DIR/valid-mock-dots/neovim" "$TARGET_DIR/mock-dots/withAllIgnored" "$TARGET_DIR/mock-dots/withSomeIgnored" "$TARGET_DIR/mock-dots/withPathIssues" "$TARGET_DIR/mock-dots/withAllDotsToOneLoc" "$TARGET_DIR/mock-dots/tilix" "$TARGET_DIR/valid-mock-dots/tilix" "$TARGET_DIR/mock-dots/withGlobsOnly" "$TARGET_DIR/mock-dots/mcfly" "$TARGET_DIR/mock-dots/withIgnoreGlobs" "$TARGET_DIR/mock-dots/nested" "$TARGET_DIR/mock-dots/deeplyNested" "$TARGET_DIR/mock-dots/nestedIgnore")

for CONFIG_GRP_PATH in "${MOCK_CONFIG_GRP_PATHS[@]}"; do
  CONFIG_GRP_NAME=$(echo "$CONFIG_GRP_PATH" | awk -F "/" '{ print $NF }')

  mkdir -p "$CONFIG_GRP_PATH"
  ln -sf "$rootDir/mock-destination-files/${CONFIG_GRP_NAME}.json" "$CONFIG_GRP_PATH/destinations.json"
done

touch $TARGET_DIR/mock-dots/npm/{.npmrc,npm-config.json}
cp -r -n $TARGET_DIR/mock-dots/npm/. $TARGET_DIR/valid-mock-dots/npm/

touch $TARGET_DIR/mock-dots/git/{.gitconfig,.gitignore}
cp -r -n $TARGET_DIR/mock-dots/git/. $TARGET_DIR/valid-mock-dots/git/

touch $TARGET_DIR/mock-dots/bat/{bat-config.json,.bat-colors}
cp -r -n $TARGET_DIR/mock-dots/bat/. "$TARGET_DIR/valid-mock-dots/bat"

touch $TARGET_DIR/mock-dots/neovim/{config.lua,neovim.user.config.lua}
cp -r -n $TARGET_DIR/mock-dots/neovim/. $TARGET_DIR/valid-mock-dots/neovim/

touch $TARGET_DIR/mock-dots/tilix/{config.json,user.css,themes.txt}
cp -r -n $TARGET_DIR/mock-dots/tilix/. $TARGET_DIR/valid-mock-dots/tilix/

touch $TARGET_DIR/mock-dots/withAllIgnored/{config.txt,sample.json,script.sh}
touch $TARGET_DIR/mock-dots/withSomeIgnored/{navi.config.yaml,navi.sample.json,navi.script.sh,setup.yaml}
touch $TARGET_DIR/mock-dots/withPathIssues/{sample.rs,setup.ts,.configrc}
touch $TARGET_DIR/mock-dots/withAllDotsToOneLoc/{sample.rs,setup.ts,.configrc}
touch $TARGET_DIR/mock-dots/withGlobsOnly/{example.js,special.js,gater.js}
touch $TARGET_DIR/mock-dots/mcfly/{example.js,special.js,gater.js,sample.js,cat.js,index.js}
touch $TARGET_DIR/mock-dots/withIgnoreGlobs/{example.js,special.ts,gater.js,sample.ts,cat.rs,index.py,example.json}
touch $TARGET_DIR/mock-dots/nested/{user.css,sample.ts,config.toml}
touch $TARGET_DIR/mock-dots/deeplyNested/sample.rs
touch $TARGET_DIR/mock-dots/nestedIgnore/{sample.ts,index.css,sample.py}

mkdir -p "$TARGET_DIR/mock-dots/nested/inner"
touch $TARGET_DIR/mock-dots/nested/inner/{user.css,sample.js}

mkdir -p "$TARGET_DIR/mock-dots/deeplyNested/inner/sample/sample"
touch $TARGET_DIR/mock-dots/deeplyNested/inner/sample/sample/sample.rs

mkdir -p "$TARGET_DIR/mock-dots/nestedIgnore/inner"
touch $TARGET_DIR/mock-dots/nestedIgnore/inner/example.js

mkdir -p "$TARGET_DIR/mock-home"
echo -e "Done!\n"
