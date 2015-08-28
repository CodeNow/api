#!/bin/bash
set -e

if [[ ! -d /tmp/neo4j-community-2.1.8/bin ]]; then
  echo "Downloading neo4j"
  wget http://neo4j.com/artifact.php?name=neo4j-community-2.1.8-unix.tar.gz -O /tmp/neo4j-community-2.1.8-unix.tar.gz
  cd /tmp; tar -xzvf neo4j-community-2.1.8-unix.tar.gz; cd -;
else
  echo "Neo4j exists!"
  ls -l /tmp/neo4j-community-2.1.8
fi
