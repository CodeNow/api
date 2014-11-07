[![Status Badge](https://circleci.com/gh/CodeNow/api.png?circle-token=15c68bfd7d9ca99637f0c5a6e05505366f5d9fd3)](https://circleci.com/gh/CodeNow/api) [![Dependency Status](http://david-dm.bryankendall.me/CodeNow/api.svg)](http://david-dm.bryankendall.me/CodeNow/api) [![devDependency Status](http://david-dm.bryankendall.me/CodeNow/api/dev-status.svg)](http://david-dm.bryankendall.me/CodeNow/api#info=devDependencies)

Application Components
==========
#### Express
/lib/app.js

#### Routes
/lib/routes.js

#### Mongo
Models  - /lib/models/mongo/*.js
Schemas - /lib/models/mongo/schemas/*.js

#### Tests
Behavioral tests (BDD) - /test
Unit Tests - /unit
Lab - Testing Framework - [https://github.com/spumko/lab](spumko/lab)



Opinions
========
#### Restful resource urls
Create - POST   - /resources
Read   - GET    - /resources/:id
Update - PATCH  - /resources/:id  *PATCH is a partial update, PUT is a full resource update
Delete - DELETE - /resources/:id

#### Middleware Patterns
Request Data validation and Middleware Flow Control - [tjmehta/dat-middleware](https://github.com/tjmehta/dat-middleware)
Middleware Flow Control - tjmehta/middleware-flow](https://github.com/tjmehta/middleware-flow)
Middlewares of models are autogenerated for you
* Mongoose Models - /lib/middlewares/mongo/index.js - [tjmehta/mongooseware](https://github.com/tjmehta/mongooseware)
* Class Models - /lib/middlewares/apis/index.js [tjmehta/middlewarize](https://github.com/tjmehta/middlewarize) *documentation soon
Sharing the request object as a common context between middlewares allows us to make
asyncronous code look syncronous and avoid "callback hell"

#### Boom for Http Errors
Nice Http Error library - [spumko/boom](https://github.com/spumko/boom)



Resource Overview
=================
Mongo Schemas - /lib/models/mongo/schemas/*.js

Project - full blown code project that potentially includes multiple components. Ex: Runnable.com

Configs - Are a way of forking Infrastructure Code of a Project's Components

Components - are application components. Ex: frontend-server, api-server, database
* Infrastructure code - environment definition code
* Application code - node.js code or etc. (github)

Component Versions - a snapshot of infrastructure code version and application code version
* Dockerfile v0.1.0 and api-server v0.1.0
* Can be built on unbuilt

Infrastructure Code Versions - build file versions. Ex: Dockerfile@v0.1.0

Builds - groupings of built components component versions
* [frontend v0.1.0, api-server v0.1.0, redis v1.0.0, mongodb v2.7.0]
* Remember component versions are snapshots of BOTH infra and app code.
* This is a grouping of built docker images.

Instances - Running build which consists of running containers for each project component
* This is a grouping on running docker containers for a build's docker images.




Help and Tips
=============

### Problems npm installing?

This may be because you're getting access denied from npm - which is trying to clone a private repo (runnable-api-client)
Make sure you set up a ssh key with github and ssh-add it. (ssh-add ~/.ssh/github_rsa)
[https://github.com/settings/ssh](Your github ssh keys)

### Rapid Prototyping with Runnable-Api-Client

If you find yourself working on a feature that constantly involves updating the runnable-api-client, use npm link.
```bash
cd <runnable-api-client-path>
npm link
cd <runnable-api>
npm link runnable
# ... after you've commited some runnable-client changes and updated the version
npm run client-version # this will update the client's version to the latest in the package.json - remember to commit it.
```
```
Models:

projects (full blown project - that has multiple components)
 - environments (subdoc)
  - builds    (collection)
   - versions (collection) [redis v0.7, api v0.8, mongo v2.7]


A context represents a project context (like redis)
A version is a version of a particular context (build files, github commitHash)
 - can be built or unbuilt - built means it has docker image


A build is a grouping built versions (for all contexts of a project)

--

Instances (running builds)
 - containers (subdoc)



Pages
 - see client/config/routes.js of runnable-angular repository

Build List Page - /project/anandkumar/filibuster/master
 - has a listing of builds for an environment

Build Page - /project/anandkumar/filibuster/master/build/:id
 - most complex page
 - you can edit build files and create new builds
 - you can rebuild - create a new build from a build
 - shows logs if in progress, shows all logs if complete
 - [launch instance button]

Instance Page - /project/anandkumar/filibuster/master/build/:id (just like our current container pages except supports multiple containers (full instance))
 - create an instance from a build (create containers for all build images (versions))



TODO:

builds done in primitive form
bryan is working builds via docker (then queueing and build logs)
tj is hooking up files - maybe anand can wrap this up
mongoose validation plugins
dotenv for containerization
how to use real docker in our tests (mocks for dev, real for integration)
```

![Magic](https://s3.amazonaws.com/uploads.hipchat.com/31372/651154/nARA3Q63eW1j5WV/2014-07-04-14-45-39%20%281%29.png)

