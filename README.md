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

error handling
==============

* standard error format is { code: httpcode, message: 'error message' }
* any errors that bubble up from the stack below our repo ie) mongodb, convert to this
* any errors that bubble up from within our repo just propagate upwards
* this error structure is always passed to client as res.json err.code, { message: err.msg }

deployment
==========

* run make image to create a deployment-ready docker image
* this image can then be pushed to any running docker daemon

code coverage
=============

* you can build a code coverage report into ./coverage/index.html
* first build and install this specific version of jscoverage:
  * https://github.com/visionmedia/node-jscoverage.git
* then run make clean, make build, make coverage

api spec
========

* the mocha tests are this api's living specification
*