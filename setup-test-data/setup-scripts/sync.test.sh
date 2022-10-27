#!/usr/bin/env bash

TARGET_DIR="$DATA_DIR/sync"

mkdir -p "$TARGET_DIR/valid-git-repo-working"
mkdir -p "$TARGET_DIR/valid-git-repo-clean"

echo -e "Setting up mock repo with dirty working tree..."
git -C "$TARGET_DIR/valid-git-repo-working" init
touch $TARGET_DIR/valid-git-repo-working/{sample.txt,.gitignore,README.md,index.ts,utils.ts}

git -C "$TARGET_DIR/valid-git-repo-working" add --all
git -C "$TARGET_DIR/valid-git-repo-working" commit -m "init"

git clone --bare "$TARGET_DIR/valid-git-repo-working" "$TARGET_DIR/valid-git-repo-working-upstream"

git -C "$TARGET_DIR/valid-git-repo-working" remote add origin "$TARGET_DIR/valid-git-repo-working-upstream"
git -C "$TARGET_DIR/valid-git-repo-working" push -u origin HEAD
echo -e "Done!\n"

echo -e "Setting up mock repo with clean working tree..."
git -C "$TARGET_DIR/valid-git-repo-clean" init
touch $TARGET_DIR/valid-git-repo-clean/{sample.md,.gitignore,index.rs,utils.rs}

git -C "$TARGET_DIR/valid-git-repo-clean" add --all
git -C "$TARGET_DIR/valid-git-repo-clean" commit -m "init"

git clone --bare "$TARGET_DIR/valid-git-repo-clean" "$TARGET_DIR/valid-git-repo-clean-upstream"

git -C "$TARGET_DIR/valid-git-repo-clean" remote add origin "$TARGET_DIR/valid-git-repo-clean-upstream"
git -C "$TARGET_DIR/valid-git-repo-clean" push -u origin HEAD
