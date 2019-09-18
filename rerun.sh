#!/usr/bin/env bash
node -e "require('child_process').execFileSync('C:/Users/quent/Dropbox/repos/binpub/index.js', JSON.parse(require('fs').readFileSync('./rerun.json'), { stdio: 'inherit' }))"