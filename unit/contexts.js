var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;
var before = Lab.before;
var beforeEach = Lab.beforeEach;
var afterEach = Lab.afterEach;

var User = require('models/mongo/user');
var Context = require('models/mongo/context');

describe('Contexts', function () {
  before(require('./fixtures/mongo').connect);
  afterEach(require('./fixtures/mongo').removeEverything);

  beforeEach(function (done) {
    this.user = new User();
    this.user.save(done);
  });
  afterEach(function (done) {
    delete this.user;
    delete this.context;
    done();
  });

  it('should be able to save a context!', function (done) {
    this.context = new Context({
      name: 'name',
      description: 'description',
      public: false,
      owner: this.user._id
    });
    this.context.save(function (err, context) {
      if (err) { done(err); }
      else {
        expect(context).to.be.okay;
        done();
      }
    });
  });
});
