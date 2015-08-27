#!/bin/bash
set -e

if [[ ! -e /tmp/neo4j-community-2.1.8 ]]; then
  wget http://neo4j.com/artifact.php?name=neo4j-community-2.1.8-unix.tar.gz -O /tmp/neo4j-community-2.1.8-unix.tar.gz
  cd /tmp; tar -xzvf neo4j-community-2.1.8-unix.tar.gz; cd -;
fi
