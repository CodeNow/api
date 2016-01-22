#!/bin/bash

extra_args=""

all_files=()
for file in $(find ./test -path ./test/functional/fixtures -prune -o -name "*.js" -print | sort)
do
  if [[ "$file" !=   "./test/functional/fixtures" ]]
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
  npm run _bdd -- $indexes ${extra_args[@]} ${files[@]}
  exit $?
fi

numTests=$(npm run _bdd -- --dry ${all_files[@]} | tail -7 | perl -n -e '/- (\d+)\)/ && print $1')
if [[ $numTests == "" ]]; then echo "could not get number of tests"; exit 1; fi
echo $numTests to run

if [[ $indexes == "" ]]
then
  indexes=""
  if [[ $CIRCLE_NODE_TOTAL -eq 1 ]]
  then
    echo "local testing"
  else
    len=$(expr $numTests / $CIRCLE_NODE_TOTAL)
    s=$(expr $len \* $CIRCLE_NODE_INDEX + 1)
    n=$(expr $CIRCLE_NODE_INDEX + 1)
    e=$(expr $len \* $n)
    if [[ $CIRCLE_NODE_TOTAL -eq $n ]]
    then
      e=$numTests
    fi
    indexes="-i 244"
    echo "indexes $indexes"
  fi
fi

LOG_LEVEL_STDOUT=trace npm run _bdd -- --threshold 75 ${extra_args[@]} $indexes ${all_files[@]}
exit $?
