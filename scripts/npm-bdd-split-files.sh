#!/bin/bash

extra_args=""

all_files=()
for file in $(find ./test -path ./test/fixtures -prune -o -name "*.js" -print | sort)
do
  if [[ "$file" !=   "./test/fixtures" ]]
  then
    all_files+=" $file"
  fi
done

# catch any extra arguments
# check if files were passed, if that's the case, we just use those
args=("$@")
files=()
indexes=""
for i in $*
do
  if [[ -e $i ]]
  then
    files+=" $i"
  else
    if [[ "$i" =~ ^[0-9]+|-i\ ?([0-9]+)?$ ]]
    then
      indexes+=" $i"
    else
      extra_args+=" $i"
    fi
  fi
done
if [[ ${#files[@]} -ne 0 ]]
then
  npm run _bdd -- ${indexes[@]} ${extra_args[@]} ${files[@]}
  exit $?
fi

numTests=$(npm run _bdd -- --dry ${all_files[@]} | tail -6 | perl -n -e '/- (\d+)\)/ && print $1')
echo $numTests to run

if [[ $indexes == "" ]]
then
  indexes=()
  if [[ $CIRCLE_NODE_TOTAL -eq 1 ]]
  then
    echo "local testing"
  else
    indexes=()
    for i in $(seq 1 $numTests)
    do
      if [[ $(($i % $CIRCLE_NODE_TOTAL)) -eq $CIRCLE_NODE_INDEX ]]
      then
        indexes+=" -i $i"
      fi
    done
  fi
fi

npm run _bdd -- ${extra_args[@]} ${indexes[@]} ${all_files[@]}
exit $?
