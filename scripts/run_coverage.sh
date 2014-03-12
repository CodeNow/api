#!/bin/bash
jscoverage lib lib-cov
rm -rf lib
mv lib-cov lib
mkdir -p ./coverage
NODE_ENV=testing NODE_PATH=./lib mocha --reporter html-cov > coverage/index.html 2> coverage.log
rm -rf lib
git checkout -- lib
if [ "$CIRCLE_ARTIFACTS" != "" ]; then 
  cp -r coverage $CIRCLE_ARTIFACTS/
fi
