[![Status Badge](https://circleci.com/gh/CodeNow/api.png?circle-token=15c68bfd7d9ca99637f0c5a6e05505366f5d9fd3)](https://circleci.com/gh/CodeNow/api) [![Dependency Status](http://david-dm.bryankendall.me/CodeNow/api.svg)](http://david-dm.bryankendall.me/CodeNow/api) [![devDependency Status](http://david-dm.bryankendall.me/CodeNow/api/dev-status.svg)](http://david-dm.bryankendall.me/CodeNow/api#info=devDependencies)

Components
==========

## Express
/lib/app.js

## Routes
/lib/routes.js

Opinions
========
### Restful resource urls
Create - POST   -
Read   - GET    -
Update - PATCH  -
Delete - DELETE -

Routes
======



Schemas
=======

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



Pages:

Build List Page - /anandkumar/filibuster/master
 - has a listing of builds for an environment

Build Page - /anandkumar/filibuster/master/build/:id
 - most complex page
 - you can edit build files and create new builds
 - you can rebuild - create a new build from a build
 - shows logs if in progress, shows all logs if complete
 - [launch instance button]

Instance Page - /instances/:id (just like our current container pages except supports multiple containers (full instance))
 - create an instance from a build (create containers for all build images (versions))



TODO:

builds done in primitive form
bryan is working builds via docker (then queueing and build logs)
authentication (github and works with primus)
tj is hooking up files - maybe anand can wrap this up
mongoose validation plugins
dotenv for containerization
how to use real docker in our tests (mocks for dev, real for integration)
```
