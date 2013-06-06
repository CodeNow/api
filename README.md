api-server
==========

* Serves the core runnable API mounted at http[s]://api.runnable.com
* ssl is handled upstream by another process ie) nginx
* api.runnable.com is accessed exclusively through a browser context with cookies
* this allows us to defer implementing a token-based management system for api calls
* api deals with strictly json-based data. doesn't know about html
* ability to fully control a user and their runnables via an api call
* primarly a REST api, but web sockets enabled where required

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

* TODO