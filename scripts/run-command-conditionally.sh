#!/bin/bash

if [ "${CIRCLE_NODE_INDEX}" = "0" ]
then
  exec $@
  exit $?
fi
