#!/bin/bash

for file in $(find ./test -path ./test/fixtures -prune -o -name "*.js" -print | sort)
do
  if [[ "$file" !=   "./test/fixtures" ]]
  then
    files+=" $file"
  fi
done

numTests=$(npm run _bdd -- -d ${files[@]} | grep -E '[0-9]+ tests complete' | awk '{split($0,r," "); print r[1];}')
echo $numTests to run

indexes=()
for i in $(seq 1 $numTests)
do
  if [[ $(($i % $CIRCLE_NODE_TOTAL)) -eq $CIRCLE_NODE_INDEX ]]
  then
    indexes+=" -i $i"
  fi
done

npm run _bdd -- ${indexes[@]} ${files[@]}
