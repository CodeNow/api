[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
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
      - [[Guide to Development & Production CLI Log Tools](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Development-CLI-Log-Tools)](#guide-to-development-&-production-cli-log-toolshttpsgithubcomcodenowdevops-scriptswikiguide-to-development-cli-log-tools)
      - [[Guide to Debugging Production API with Logs](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Debugging-production-API-with-Logs)](#guide-to-debugging-production-api-with-logshttpsgithubcomcodenowdevops-scriptswikiguide-to-debugging-production-api-with-logs)
- [Shrinkwrap](#shrinkwrap)
- [Running Tests](#running-tests)
  - [Prerequisites](#prerequisites)
  - [Tests](#tests-1)
  - [Formatting](#formatting)
- [Opinions](#opinions)
      - [Restful resource urls](#restful-resource-urls)
      - [Middleware Patterns](#middleware-patterns)
      - [Boom for Http Errors](#boom-for-http-errors)
- [Resource Overview](#resource-overview)
- [Help and Tips](#help-and-tips)
    - [Problems npm installing?](#problems-npm-installing)
    - [Rapid Prototyping with Runnable-Api-Client](#rapid-prototyping-with-runnable-api-client)

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
#### [Guide to Development & Production CLI Log Tools](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Development-CLI-Log-Tools)
#### [Guide to Debugging Production API with Logs](https://github.com/CodeNow/devops-scripts/wiki/Guide-to-Debugging-production-API-with-Logs)

# Shrinkwrap

A quick informational blurb about `shrinkwrap`.

In order to keep our tests running and consistently installing the same thing for everyone, we are going to be using shrinkwrap. If you are not changing dependencies, you will not need to do anything in particular; `npm install` will follow the rules in `npm-shrinkwrap.json` and everyone will be happy.

If you _are_ interested in changing dependencies, you must have the following installed as a prerequisite:

```bash
npm install -g npm-shrinkwrap
```

This installs Uber's awesome shrinkwrap utility. It has a few more bells and whistles than `npm`'s.

When you are adding a dependency, do your `npm install --save(-dev)` as you normally would. Then, when everything is confirmed to be working, run `npm run shrinkwrap` to generate a new `npm-shrinkwrap.json`. This will shrinkwrap all your dependencies and dev dependencies, updating `npm-shrinkwrap.json`.

Protip: if you want to see the difference in a nice format, use `npm-shrinkwrap diff` with a dirty `npm-shrinkwrap.json` and it'll show you what changed.

Commit the new `npm-shrinkwrap.json` along with your changes. You _may_ want to run some tests locally after doing a clean `npm install` to verify it's validity. Also, feel free to destroy all the [Travis CI caches](https://travis-ci.com/CodeNow/api/caches) to ensure that `npm-shrinkwrap.json` is working properly.

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

This repository is formatted using the Standard JS rules.

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

Some helpful tips:

- `npm run lint` runs the standard linter, and will not format your code
- `npm run format` will run the standard formatter, attempting to fix various issues that are found
- [standard's README](https://github.com/feross/standard/blob/master/README.md) has some good information about various [text editor plugins](https://github.com/feross/standard/blob/master/README.md#text-editor-plugins) as well, to make your life easier

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

```
cd <runnable-api-client-path>
npm link
cd <runnable-api>
npm link runnable
# ... after you've commited some runnable-client changes and updated the version
npm run client-version # this will update the client's version to the latest in the package.json - remember to commit it.
```

Models:

- A context represents a project context (like redis)
- A version is a version of a particular context (build files, github commitHash)
  - can be built or unbuilt - built means it has docker image
- A build is a grouping built versions (for all contexts of a project)

- Instances (running builds)
 - containers (subdoc)

- Pages
 - see client/config/routes.js of runnable-angular repository

- Build List Page - /project/anandkumar/filibuster/master
 - has a listing of builds for an environment

- Build Page - /project/anandkumar/filibuster/master/build/:id
 - is the most complex page
 - you can edit build files and create new builds
 - you can rebuild - create a new build from a build
 - shows logs if in progress, shows all logs if complete
 - [launch instance button]

- Instance Page - /project/anandkumar/filibuster/master/build/:id (just like our current container pages except supports multiple containers (full instance))
 - create an instance from a build (create containers for all build images (versions))
```
