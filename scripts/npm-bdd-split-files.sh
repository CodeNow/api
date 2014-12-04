#!/bin/bash

i=0
files=()
for file in $(find ./test -path ./test/fixtures -prune -o -name "*.js" -print | sort)
do
  if [[ "$file" !=   "./test/fixtures" && $(($i % $CIRCLE_NODE_TOTAL)) -eq $CIRCLE_NODE_INDEX ]]
  then
    files+=" $file"
  fi
  ((i++))
done

npm run _bdd -- ${files[@]}
