#!/bin/sh

COUNTER=1
while npm run _bdd test/bdd-instance-dependencies.js
do
  sleep 1
  killall cayley_osx || :;
  COUNTER=$COUNTER + 1
done
echo "Failed after $COUNTER runs.\n"
