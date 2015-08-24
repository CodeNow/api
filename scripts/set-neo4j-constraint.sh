#!/bin/bash
set -e

if [ -e nohup.out ]
then
  while [[ $(grep "is ready" nohup.out) = "" ]]
  do
    echo "waiting for neo4j"
    sleep 1
  done
else
  echo "assuming neo4j is up"
fi

constraints=$(curl http://localhost:7474/db/data/schema/constraint/Instance/uniqueness/id -v 2>&1)
lines=$(echo $constraints | awk '/404 Not Found/{print $0}')

if [[ $lines != "" ]]
then
  echo 'Creating constraint'
  curl -X POST -H 'content-type: application/json' -d '{ "property_keys":["id"] }' "http://localhost:7474/db/data/schema/constraint/Instance/uniqueness/"
else
  echo 'Constraint already set.'
fi
