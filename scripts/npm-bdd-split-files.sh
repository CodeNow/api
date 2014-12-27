#!/bin/bash

extra_args=""

# catch any extra arguments
# check if files were passed, if that's the case, we just use those
args=("$@")
files=()
for i in $*
do
  if [[ -e $i ]]
  then
    files+=" $i"
  else
    extra_args+=" $i"
  fi
done
if [[ ${#files[@]} -ne 0 ]]
then
  npm run _bdd -- ${extra_args[@]} ${files[@]}
  exit $?
fi

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

killall node
killall cayley_osx
killall cayley_linux
npm run _bdd -- ${extra_args[@]} ${indexes[@]} ${files[@]}
