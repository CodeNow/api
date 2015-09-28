'use strict';

var assign = require('101/assign');
var defaults = require('101/defaults');
var isFunction = require('101/is-function');
var mongoose = require('mongoose');
var uuid = require('uuid');

var Build = require('models/mongo/build.js');
var ContextVersion = require('models/mongo/context-version.js');
var Instance = require('models/mongo/instance.js');
var ObjectId = mongoose.Types.ObjectId;
var User = require('models/mongo/user.js');

module.exports = {
  createUser: function (id, cb) {
    User.create({
      email: 'hello@runnable.com',
      accounts: {
        github: {
          id: id,
          accessToken: uuid(),
          username: uuid(),
          emails: [
            'hello@runnable.com'
          ]
        }
      }
    }, cb);
  },
  createInstance: function (ownerGithubId, build, locked, cv, cb) {
    var data = this.instanceTemplate(ownerGithubId, build, locked, cv);
    Instance.create(data, cb);
  },
  createBuild: function (ownerGithubId, cv, cb) {
    var data = this.buildTemplate(ownerGithubId, cv);
    Build.create(data, cb);
  },
  createCompletedCv: function (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props;
      props = null;
    }
    props = props || {build: {}};
    defaults(props.build, {
      hash: uuid(),
      started: new Date(new Date() - 60 * 1000),
      completed: new Date(),
      manual: false,
      dockerContainer: '1234567890123456789012345678901234567890123456789012345678901234'
    });
    var data = this.cvTemplate(
      ownerGithubId,
      props.build.dockerContainer,
      props.build.manual,
      props.build.hash,
      props.build.started,
      props.build.completed
    );
    ContextVersion.create(data, cb);
  },
  createStartedCv: function (ownerGithubId, props, cb) {
    if (isFunction(props)) {
      cb = props;
      props = null;
    }
    props = props || { build: {} };
    defaults(props.build, {
      hash: uuid(),
      started: new Date(),
      dockerContainer: '1234567890123456789012345678901234567890123456789012345678901234'
    });
    var data = this.cvTemplate(
      ownerGithubId,
      props.build.dockerContainer,
      props.build.manual,
      props.build.hash,
      props.build.started
    );
    ContextVersion.create(data, cb);
  },
  cvTemplate: function (ownerGithubId, containerId, manual, hash, started, completed) {
    started = started || new Date();
    var cv = {
      infraCodeVersion : new ObjectId(),
      createdBy : {
        github : ownerGithubId
      },
      context : new ObjectId(),
      owner : {
        github : ownerGithubId
      },
      build: {
        triggeredAction : {
          manual : manual
        },
        _id : new ObjectId(),
        triggeredBy : {
          github : ownerGithubId
        },
        started : started,
        hash : hash,
        network : {
          networkIp: '127.0.0.1',
          hostIp: '127.0.0.1'
        },
        containerId : containerId,
        dockerContainer : containerId
      },
      advanced : true,
      appCodeVersions : [],
      created : new Date(started - 60*1000),
      __v : 0,
      dockerHost : 'http://127.0.0.1:4242'
    };
    if (completed) {
      assign(cv.build, {
        dockerTag : 'registry.runnable.com/544628/123456789012345678901234:12345678902345678901234',
        dockerImage : 'bbbd03498dab',
        completed : completed
      });
    }
    return cv;
  },
  buildTemplate: function (ownerGithubId, cv) {
    var completed = new Date();
    var started = new Date(completed - 60*1000);
    return {
      buildNumber : 1,
      disabled: false,
      contexts: [cv.context],
      contextVersions: [cv._id],
      completed : completed,
      created : new Date(started - 60*1000),
      started: started,
      createdBy : {
        github : ownerGithubId
      },
      context : new ObjectId(),
      owner : {
        github : ownerGithubId
      }
    };
  },
  instanceTemplate: function (ownerGithubId, build, locked, cv) {
    var name = uuid();
    return {
      shortHash: uuid(),
      name: name,
      lowerName: name.toLowerCase(),
      owner: {
        github: ownerGithubId,
        username: 'sdfasdfasdf',
        gravatar: 'gravatar'
      },
      createdBy: {
        github: ownerGithubId,
        username: 'sdfasdfasdf',
        gravatar: 'gravatar'
      },
      parent: 'sdf',
      build: build._id,
      contextVersion: cv,
      locked: locked,
      created: new Date(),
      env: [],
      network: {
        networkIp: '127.0.0.1',
        hostIp: '127.0.0.1'
      }
    };
  }
};