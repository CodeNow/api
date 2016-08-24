#!/bin/bash

if [ "${CIRCLE_NODE_INDEX}" = "2" ]
then
  exec $@
  exit $?
fi
