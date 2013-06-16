api-server
==========

* Serves the core runnable API mounted at http[s]://api.runnable.com
* ssl is handled upstream by another process ie) nginx
* api.runnable.com is accessed exclusively through two app contexts
  * the rendr framework running on the client-side (browser context)
  * the rendr framework running on the server-side (node.js context)
  * rendr seemlessly handles session continuity between contexts out of the box
  * enables the api to uniformly adopt a cookie-based session id
* api deals with strictly json-based data. doesn't know about html
* ability to fully control a user and their runnables via an api call
* primarly a REST api, but web sockets enabled where required

rendr requirements (dictates tests)
===================================

* the api server should handle date requests to support rendr's caching model
* the api server should be able to handle bootstrap requests

error handling
==============

* standard error format is { code: httpcode, message: 'error message' }
* any errors that bubble up from the stack below our repo ie) mongodb, convert to this
* any errors that bubble up from within our repo just propagate upwards
* this error structure is always passed to client as res.json err.code, { message: err.msg }

local development
=================

* the api server depends on a docker daemon and therefore requires a linux kernel
* you can spin up a local enivronment using vagrant + virtual box
* simply run 'vagrant up' from the root of your repo directory

PaaS deployment
===============

* vagrant can also be used to deploy to an ec2 server
* simply setup EC2 as a vagrant provider and then push via vagrant

database mirgration
===================

* this api requires some changes to the way to the database is laid out
* a published project is any project that contains tags
* this means all projects with tags will show up in the tagged list
* this means projects which are forks of published projects do not inheret its tags
* you can figure out which tags the project is derived from by looking at the root tags

* the comment schema includes a pointe to a user instead of gravitar/email directly
* this allows us to associate a real user with the emails here
* it also means if a user is marked as deleted their comments will disappear

* make the tags field more than just a name, give it an id as well
* this allows us to refer to the tag by id in the url, eliminating any constraints on the name field

* we no longer attach a default file list to the project model
* instead, we tag file resources as being default or not

* we no longer track whether a project is edited or not
* if its not edited then we should never created, we should just run the parent
* in the worst case the project can be deleted at the end of session, but not persisted

* simply run scripts/migrate.js to covert your existing database

code coverage
=============

* you can build a code coverage report into ./coverage/index.html
* first build and install this specific version of jscoverage:
  * https://github.com/visionmedia/node-jscoverage.git
* then run make clean, make build, make coverage

api spec
========

* the mocha tests are this api's living specification

using docker.io
===============

* we are using docker.io for spinning up lightweight processes
* we store the persistent state

TODO
====

NEXT: files api
* terminal, image export, image import (admins)
* start/start cmd, state tracking, tail logging
* coalesce data into view-level requests
* try to do as much as possible using http, without websockets
* document the api, separate the tested vs. untested parts