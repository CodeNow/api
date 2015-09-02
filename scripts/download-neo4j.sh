#!/bin/bash
set -e

if [[ ! -e /tmp/downloads/neo4j-community-2.1.8-unix.tar.gz ]]; then
  echo "Downloading neo4j"
  mkdir -p /tmp/downloads
  wget http://neo4j.com/artifact.php?name=neo4j-community-2.1.8-unix.tar.gz -O /tmp/downloads/neo4j-community-2.1.8-unix.tar.gz
else
  echo "Neo4j tarball exists!"
  ls -l /tmp/downloads
fi

rm -rf /tmp/neo4j-community-2.1.8
tar -C /tmp -xzf /tmp/downloads/neo4j-community-2.1.8-unix.tar.gz;
