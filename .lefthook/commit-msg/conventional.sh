#!/bin/sh
# Conventional Commits, subject of 72 characters at most; merge commits pass (docs/conventions/git-and-pr.md).
pattern='^(Merge |(feat|fix|docs|style|chore|refactor|test|perf|build|ci|revert)(\([a-z0-9-]+\))?!?: .{1,72}$)'
head -1 "$1" | grep -Eq "$pattern" && exit 0
echo "Commit message does not follow Conventional Commits (see docs/conventions/git-and-pr.md)"
exit 1
