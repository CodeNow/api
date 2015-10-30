var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var expect = require('code').expect;
var it = lab.it;
var before = lab.before;
var after = lab.after;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var assign = require('101/assign');
var defaults = require('101/defaults');
var isFunction = require('101/is-function');
var put = require('101/put');
var last = require('101/last');
var mongoose = require('mongoose');
var ObjectId = mongoose.Types.ObjectId;
var uuid = require('uuid');

var mongooseControl = require('models/mongo/mongoose-control.js');
var ContextVersion = require('models/mongo/context-version.js');

describe('ContextVersion Model Query Integration Tests', function () {
  before(mongooseControl.start);
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });
  afterEach(function (done) {
    ContextVersion.remove({}, done);
  });
  after(function (done) {
    ContextVersion.remove({}, done);
  });
  after(mongooseControl.stop);

  describe('methods', function() {

    describe('updateBuildHash', function () {
      beforeEach(function (done) {
        ctx.hash = uuid();
        createStartedCv(function (err, cv) {
          if (err) { return done(err); }
          ctx.cv = cv;
          done();
        });
      });

      it('should update the build.hash property on the document', function (done) {
        var hash = 'abcdef';
        ctx.cv.updateBuildHash(hash, function (err) {
          if (err) { return done(err); }
          // expect build.hash updated on document
          expect(ctx.cv.build.hash).to.equal(hash);
          // expect build.hash updated on document in database
          ContextVersion.findById(ctx.cv._id, function (err, cv) {
            if (err) { return done(err); }
            expect(cv.build.hash).to.equal(hash);
            done();
          });
        });
      });
    });

    describe('findPendingDupe', function() {
      beforeEach(function (done) {
        ctx.props = {
          build: { hash: uuid() }
        };
        done();
      });
      beforeEach(function (done) {
        function createCv(i, cb) {
          var props = put(ctx.props, {
            'build.started'  : new Date('Mon Jan 1 2015 '+i+':00:00 GMT-0700 (PDT)'),
            'build.completed': new Date('Mon Jan 1 2015 '+i+':00:30 GMT-0700 (PDT)')
          });
          createCompletedCv(props, cb);
        }
        ctx.completedDupes = [];
        createCv(1, function (err, cv2) {
          ctx.completedDupes.push(cv2);
          createCv(2, function (err, cv1) {
            ctx.completedDupes.push(cv1);
            createCv(3, function (err, cv) {
              ctx.completedDupes.push(cv);
              done();
            });
          });
        });
      });
      beforeEach(function (done) {
        function createCv(i, cb) {
          var props = put(ctx.props, {
            'build.started': new Date('Mon Jan 1 2015 12:00:0'+i+' GMT-0700 (PDT)')
          });
          createStartedCv(props, cb);
        }
        ctx.startedDupes = [];
        createCv(1, function (err, cv) {
          ctx.startedDupes.push(cv);
          createCv(2, function (err, cv) {
            ctx.startedDupes.push(cv);
            createCv(3, function (err, cv) {
              ctx.startedDupes.push(cv);
              ctx.cv = cv;
              done();
            });
          });
        });
      });

      it('should find the oldest pending dupe', function (done) {
        ctx.cv.findPendingDupe(function (err, oldestStartedDupe) {
          if (err) { return done(err); }
          expect(oldestStartedDupe).to.exist();
          expect(oldestStartedDupe._id.toString()).to.equal(ctx.startedDupes[0]._id.toString());
          done();
        });
      });
    });

    describe('findCompletedDupe', function() {
      beforeEach(function (done) {
        ctx.props = {
          build: { hash: uuid() }
        };
        done();
      });
      beforeEach(function (done) {
        function createCv(i, cb) {
          var props = put(ctx.props, {
            'build.started'  : new Date('Mon Jan 1 2015 '+i+':00:00 GMT-0700 (PDT)'),
            'build.completed': new Date('Mon Jan 1 2015 '+i+':00:30 GMT-0700 (PDT)')
          });
          createCompletedCv(props, cb);
        }
        ctx.completedDupes = [];
        createCv(1, function (err, cv2) {
          ctx.completedDupes.push(cv2);
          createCv(2, function (err, cv1) {
            ctx.completedDupes.push(cv1);
            createCv(3, function (err, cv) {
              ctx.completedDupes.push(cv);
              done();
            });
          });
        });
      });
      beforeEach(function (done) {
        function createCv(i, cb) {
          var props = put(ctx.props, {
              'build.started': new Date('Mon Jan 1 2015 12:00:0'+i+' GMT-0700 (PDT)')
          });
          createStartedCv(props, cb);
        }
        ctx.startedDupes = [];
        createCv(1, function (err, cv) {
          ctx.startedDupes.push(cv);
          createCv(2, function (err, cv) {
            ctx.startedDupes.push(cv);
            createCv(3, function (err, cv) {
              ctx.startedDupes.push(cv);
              ctx.cv = cv;
              done();
            });
          });
        });
      });

      it('should find the oldest pending dupe', function (done) {
        ctx.cv.findCompletedDupe(function (err, youngestCompletedDupe) {
          if (err) { return done(err); }
          expect(youngestCompletedDupe).to.exist();
          expect(youngestCompletedDupe._id.toString()).to.equal(last(ctx.completedDupes)._id.toString());
          done();
        });
      });
    });
  });


  /* Utils */
  function createStartedCv (props, cb) {
    if (isFunction(props)) {
      cb = props;
      props = null;
    }
    props = props || { build: {} };
    defaults(props.build, {
      hash: uuid(),
      started: new Date()
    });
    var data = cvTemplate(props.build.hash, props.build.started);
    ContextVersion.create(data, cb);
  }
  function createCompletedCv (props, cb) {
    if (isFunction(props)) {
      cb = props;
      props = null;
    }
    props = props || { build: {} };
    defaults(props.build, {
      hash: uuid(),
      started: new Date(new Date() - 60 * 1000),
      completed: new Date(),
    });
    var data = cvTemplate(props.build.hash, props.build.started, props.build.completed);
    ContextVersion.create(data, cb);
  }
});
function cvTemplate (hash, started, completed) {
  started = started || new Date();
  var cv = {
    infraCodeVersion : new ObjectId(),
    createdBy : {
      github : 2
    },
    context : new ObjectId(),
    owner : {
      github : 1
    },
    build: {
      triggeredAction : {
        manual : true
      },
      _id : new ObjectId(),
      triggeredBy : {
        github : 2
      },
      started : started,
      hash : hash,
      network : {
        hostIp : '10.250.197.190'
      }
    },
    advanced : true,
    appCodeVersions : [],
    created : new Date(started - 60*1000),
    __v : 0,
    containerId : '55dbd00c5f899e0e0004b12d',
    dockerHost : 'http://10.0.1.79:4242'
  };
  if (completed) {
    assign(cv.build, {
      dockerTag : 'registry.runnable.com/544628/123456789012345678901234:12345678902345678901234',
      dockerContainer : '1234567890123456789012345678901234567890123456789012345678901234',
      dockerImage : 'bbbd03498dab',
      completed : completed
    });
  }
  return cv;
}
