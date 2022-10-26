#!/usr/bin/env bash

TARGET_DIR="$DATA_DIR/sync"

echo "Creating test data directory for testing the sync command..."
mkdir -p "$TARGET_DIR/valid-git-repo-working"
mkdir -p "$TARGET_DIR/valid-git-repo-clean"

echo "Setting up git in mock repos..."
echo "Setting up working mock repo..."
git -C "$TARGET_DIR/valid-git-repo-working" init
touch $TARGET_DIR/valid-git-repo-working/{sample.txt,.gitignore,README.md,index.ts,utils.ts}
git -C "$TARGET_DIR/valid-git-repo-working" add --all
git -C "$TARGET_DIR/valid-git-repo-working" commit -m "init"

echo -e "\nSetting up clean mock repo"
git -C "$TARGET_DIR/valid-git-repo-clean" init
touch $TARGET_DIR/valid-git-repo-clean/{sample.md,.gitignore,index.rs,utils.rs}
git -C "$TARGET_DIR/valid-git-repo-clean" add --all
git -C "$TARGET_DIR/valid-git-repo-clean" commit -m "init"
