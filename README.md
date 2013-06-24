![Alt text](https://circleci.com/gh/CodeNow/api-server.png?circle-token=f2016db7bc53765c63d03a92fcfdf20330233a1f)

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


forking model
=============

* no forking. there is a single create function that takes a runnable id to fork from
* runnable to be forked from (parent) must have an image associated with it, if not error
* new runnable does not have an image set initially defined
* save will create an image from the runnable's container
  * if image exists, it will overwrite it, otherwise it will create a new one
* runnables without an image, that were not accessed within N days (configurable timeout) are deleted
  * access includes a file operation, start/stop/restart operation.

rendr is the client
===================

user who has never visited the site before does a full page load
rendr generates a session and attaches it to the page load request
session does not contain an api access token, therefore most api requests will fail at this point
most api requests only make sense in the context of a particular user who is referenced
we need to make sure that the application logic gracefully handles this condition
it needs to check for 401 unauthorized access and respond by creating (posting) a new user
and waiting for a successful response before continuiing forward
at this point the server will have returned an access token for the new user and stored it in the
session associated with the page load request (and fetched from redis on subsequent requests)
our application logic can then safely make api requests (via model changes) and expect a successful response

application responsibilities:

1) get a request for /users/me (store the user_id)
2) if response is 401 unauthorized, post a new anonymous user first
3) wait for successful response, which includes the users id
4) continue to load the application as normal

is there a restful approach to performing this auth/user creation flow?
the way to do it is define the user model without requiring the id (DONE)
access it as if it exists and if it fails, post to /users/me to create a new one
user = new User() // initialize a singleton user
user.isNew = false // it already lives on the server, dont POST it
user.fetch() // try and GET it first (to valid access token)
if (failed) {
  user.isNew = true; // this is actually a new model that doesn't live on the server yet
  user.save() // post the user model there
}

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
