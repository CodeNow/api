'use strict';

var Lab = require('lab');
var describe = Lab.experiment;
var it = Lab.test;
var expect = Lab.expect;

var Slack = require('models/apis/slack');

var usersListMock =
  require('../test/fixtures/mocks/slack/users.list');

describe('Slack API', function () {


  describe('findAllUsers', function () {

    it('should return two users', function (done) {
      var slack = new Slack('xoxo-some-valid-token');
      usersListMock();
      slack.findAllUsers(function (err, users) {
        if (err) { return done(err); }
        expect(users.length).to.equal(2);
        expect(users[1].name).to.equal('anton');
        done();
      });
    });
  });


  describe('findSlackUserByEmailOrRealName', function () {

    it('should return user found by email', function (done) {
      var slack = new Slack('xoxo-some-valid-token');
      usersListMock();
      slack.findSlackUserByEmailOrRealName('anton@runnable.com', 'Some Name', function (err, user) {
        if (err) { return done(err); }
        expect(user.name).to.equal('anton');
        expect(user.profile.email).to.equal('anton@runnable.com');
        expect(user.profile.real_name).to.equal('Anton Podviaznikov');
        done();
      });
    });

    it('should return user found by displayName', function (done) {
      var slack = new Slack('xoxo-some-valid-token');
      usersListMock();
      slack.findSlackUserByEmailOrRealName('anton2@runnable.com', 'Anton Podviaznikov', function (err, user) {
        if (err) { return done(err); }
        expect(user.name).to.equal('anton');
        expect(user.profile.email).to.equal('anton@runnable.com');
        expect(user.profile.real_name).to.equal('Anton Podviaznikov');
        done();
      });
    });
  });


  describe('findSlackUserByUsername', function () {

    it('should return one user', function (done) {
      var slack = new Slack('xoxo-some-valid-token');
      usersListMock();
      slack.findSlackUserByUsername('anton', function (err, user) {
        if (err) { return done(err); }
        expect(user.name).to.equal('anton');
        expect(user.profile.email).to.equal('anton@runnable.com');
        expect(user.profile.real_name).to.equal('Anton Podviaznikov');
        done();
      });
    });
  });



});