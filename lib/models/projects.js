var _ = require('lodash');
var async = require('async');
var Context = require('models/contexts');
var mongoose = require('mongoose');

var BaseSchema = require('models/BaseSchema');
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

var ProjectSchema = new Schema({
  name: {
    type: String,
    index: { unique: true }
  },
  description: {
    type: String,
    'default': ''
  },
  public: {
    type: Boolean,
    default: false
  },
  owner: {
    type: ObjectId,
    index: true
  },
  parent: {
    type: ObjectId,
    index: true
  },
  created: {
    type: Date,
    'default': Date.now,
    index: true
  },
  contexts: {
    type: [{
      context: {
        type: ObjectId
      },
      version: String
    }],
    'default': []
  },
  tags: {
    type: [{
      channel: {
        type: ObjectId,
        index: { sparse: true }
      }
    }],
    'default': []
  }
});

_.extend(ProjectSchema.methods, BaseSchema.methods);
_.extend(ProjectSchema.statics, BaseSchema.statics);

ProjectSchema.set('toJSON', { virtuals: true });

ProjectSchema.statics.createProjectWithContexts = function (data, callback) {
  // var body = data.body;
  // var tasks = [];
  // var contextIds = [];

  // for (var i in body.contexts) {
  //   context = body.contexts[i];
  //   var newContextData = {
  //     name: context.name,
  //     owner: data.user_id,
  //     displayName: context.displayName || context.name,
  //     description: context.description,
  //     version: 'v0'
  //   };
  //   // do not save yet. wait until all are created.
  //   var newContext = new Context(newContextData);
  //   tasks.push(async.series.bind(async, [
  //     // these things should happen in series
  //     newContext.uploadDockerfile.bind(newContext, context.dockerfile),
  //     newContext.createSourceDirectory.bind(newContext),
  //     newContext.save.bind(newContext)
  //   ]));

  //   contextIds.push({
  //     context: newContext._id,
  //     version: 'v0'
  //   });
  //   body.contexts.push(newContext);
  // }

  // create the new project
  // var newProjectData = {
  //   name: body.name,
  //   contexts: contextIds,
  //   owner: data.user_id,
  //   parent: null,
  //   description: body.description
  // };
  // var project = new Project(newProjectData);
  // tasks.push(project.save.bind(project));
  // // all the tasks we have now can happen in parallel
  // async.parallel(tasks, function (err, res) {
  //   callback(err, project);
  // });
};

var Project = module.exports = mongoose.model('Projects', ProjectSchema);
