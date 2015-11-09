[![Circle CI](https://circleci.com/gh/CodeNow/api.svg?style=svg&circle-token=15c68bfd7d9ca99637f0c5a6e05505366f5d9fd3)](https://circleci.com/gh/CodeNow/api)
[![lol Travis CI](https://magnum.travis-ci.com/CodeNow/api.svg?token=CEnbe3bPEVFTjYa2MCtJ&branch=master)](https://magnum.travis-ci.com/CodeNow/api)

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Application Components](#application-components)
      - [Express](#express)
      - [Routes](#routes)
      - [Mongo](#mongo)
      - [Tests](#tests)
- [Logs](#logs)
      - [[Guide to Using Log Levels](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Using-Log-Levels)](#guide-to-using-log-levelshttpsgithubcomcodenowdevops-scriptswikiguide-to-using-log-levels)
      - [[Guide to Development CLI Log Tools](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Development-CLI-Log-Tools)](#guide-to-development-cli-log-toolshttpsgithubcomcodenowdevops-scriptswikiguide-to-development-cli-log-tools)
      - [[Guide to Debugging Production API with Logs](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Debugging-production-API-with-Logs)](#guide-to-debugging-production-api-with-logshttpsgithubcomcodenowdevops-scriptswikiguide-to-debugging-production-api-with-logs)
- [Running Tests](#running-tests)
  - [Prerequisites](#prerequisites)
  - [Tests](#tests-1)
  - [Formatting](#formatting)
      - [jshint](#jshint)
      - [eslint](#eslint)
- [Opinions](#opinions)
      - [Restful resource urls](#restful-resource-urls)
      - [Middleware Patterns](#middleware-patterns)
      - [Boom for Http Errors](#boom-for-http-errors)
- [Resource Overview](#resource-overview)
- [Help and Tips](#help-and-tips)
    - [Problems npm installing?](#problems-npm-installing)
    - [Rapid Prototyping with Runnable-Api-Client](#rapid-prototyping-with-runnable-api-client)
  - [](#)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Application Components

#### Express

`/lib/express-app.js`

#### Routes

`/lib/routes/**/*.js`

#### Mongo

- Models: `/lib/models/mongo/*.js`
- Schemas: `/lib/models/mongo/schemas/*.js`

#### Tests

- Behavioral tests (BDD): `/test`
- Unit Tests: `/unit`
- Lab (testing framework): [hapijs/lab](https://github.com/hapijs/lab)

# Logs

#### [Guide to Using Log Levels](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Using-Log-Levels)
#### [Guide to Development CLI Log Tools](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Development-CLI-Log-Tools)
#### [Guide to Debugging Production API with Logs](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Debugging-production-API-with-Logs)

# Running Tests

## Prerequisites

- mongo
  - `brew install mongodb`
  - default configuration (listening on `127.0.0.1:27017`)
  - `mongod`
- redis
  - `brew install redis`
  - default configuration (listening on `127.0.0.1:6379`)
  - `redis-server`
- neo4j
  - `brew install neo4j`
  - disable auth: `sed -ie 's/.*auth_enabled.*/dbms.security.auth_enabled=false/g' /usr/local/Cellar/neo4j/2.2.5/libexec/conf/neo4j-server.properties`
  - `neo4j start`
- ulimit
  - `ulimit -n 10240` (at minimum)

## Tests

Run all tests: `npm test`

Granular:

- BDD: `npm run bdd`
  - Pass additional arguments to BDD: `npm run bdd -- -d`
  - BDD one file: `npm run bdd -- test/path/to/file.js`
  - BDD one test (optional file): `npm run bdd -- -i 3 [test/path/to/file.js]`
  - BDD range of tests (optional file): `npm run bdd -- -i 3-10 [test/path/to/file.js]`
  - BDD Watch: `npm run bdd-watch`
  - BDD Watch w/ one test file: `npm run bdd-watch -- test/path/to/file.js`
- Unit: `npm run unit`
  - (similar options exist to run individual and ranges of tests as BDD)

## Formatting

#### jshint

We rely (and require) that `jshint` passes with flying colors: `npm run lint`.

#### eslint

Additionally, `eslint` is available to help with formatting. It is not a tool that will format code _for you_, but provides suggestions at either a warning or error level. To run `eslint`, simply run `npm run eslint`, or ignore warnings, run `npm run eslint-errors`. These are not required to pass, but can be used as suggestions for formatting. Try it out and we can tweak it as needed, and maybe will require it at some point.

`eslint`'s [rules](http://eslint.org/docs/rules/) are rather extensive, but are fairly well documented.

If you would like to run `eslint` on a single file, run `./node_modules/.bin/eslint path/to/filename.js` (or install it with `npm -g eslint` and run `eslint path/to/filename.js`).

# Opinions

#### Restful resource urls

Create - POST   - /resources
Read   - GET    - /resources/:id
Update - PATCH  - /resources/:id  *PATCH is a partial update, PUT is a full resource update
Delete - DELETE - /resources/:id

#### Middleware Patterns

Request Data validation and Middleware Flow Control -   [tjmehta/dat-middleware](https://github.com/tjmehta/dat-middleware)
Middleware Flow Control - [tjmehta/middleware-flow](https://github.com/tjmehta/middleware-flow)
Middlewares of models are autogenerated for you
* Mongoose Models - /lib/middlewares/mongo/index.js -   [tjmehta/mongooseware](https://github.com/tjmehta/mongooseware)
* Class Models - /lib/middlewares/apis/index.js [tjmehta/middlewarize](https://github.com/tjmehta/middlewarize)
Sharing the request object as a common context between middlewares allows us to make
asynchronous code look synchronous and avoid "callback hell"

#### Boom for Http Errors

Nice Http Error library - [hapijs/boom](https://github.com/hapijs/boom)

# Resource Overview

Mongo Schemas - /lib/models/mongo/schemas/*.js

Context Versions - a snapshot of infrastructure code version and application code version
* Dockerfile v0.1.0 and api-server v0.1.0
* Can be built on unbuilt

Infrastructure Code Versions - build file versions. Ex: Dockerfile@v0.1.0

Builds - groupings of built components component versions
* [frontend v0.1.0, api-server v0.1.0, redis v1.0.0, mongodb v2.7.0]
* Remember component versions are snapshots of BOTH infra and app code.
* This is a grouping of built docker images.

Instances - Running build which consists of running containers for each project component
* This is a grouping on running docker containers for a build's docker images.

# Help and Tips

### Problems npm installing?

This may be because you're getting access denied from npm. Which is trying to clone a private repo (runnable-api-client). Make sure you set up a ssh key with github and ssh-add it. (ssh-add ~/.ssh/github_rsa)
[Your github ssh keys](https://github.com/settings/ssh)

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
 - is the most complex page
 - you can edit build files and create new builds
 - you can rebuild - create a new build from a build
 - shows logs if in progress, shows all logs if complete
 - [launch instance button]

Instance Page - /project/anandkumar/filibuster/master/build/:id (just like our current container pages except supports multiple containers (full instance))
 - create an instance from a build (create containers for all build images (versions))
```
