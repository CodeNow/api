var expect = module.exports = {
  message: function (status, message) {
    return function (done) {
      var req = this.user.specRequest();
      if (typeof status === 'string') {
        message = status;
        status = null;
      }
      if (status) {
        req.expect(status);
      }
      req
        .expectBody('message', message)
        .end(done);
    };
  },
  notFound: function (done) {
    expect.status(404).call(this, done);
  },
  accessDenied: function (done) {
    expect.status(403).call(this, done);
  },
  status: function (status) {
    return function (done) {
      this.user.specRequest()
        .expect(status)
        .end(done);
    };
  },
  create: function (data, expectedData, strict) {
    if (arguments.length === 2 && typeof expectedData === 'boolean') {
      strict = expectedData;
      expectedData = null;
    }
    expectedData = expectedData || data;
    return function (done) {
      this.user.specRequest()
        .send(data)
        .expect(201)
        .expectBody(expectedData, strict)
        .end(done);
    };
  }
};