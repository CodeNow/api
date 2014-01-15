var implementations = require('../models/implementations');
var express = require('express');
var app = module.exports = express();
app.post('/users/me/implementations', function (req, res) {
  implementations.createImplementation(req.domain, {
    userId: req.user_id,
    'implements': req.body.implements,
    containerId: req.body.containerId,
    requirements: req.body.requirements,
    subdomain: req.body.subdomain
  }, function (err, implementation) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(201, implementation);
    }
  });
});
// TODO: this really should return an array....
app.get('/users/me/implementations', function (req, res) {
  if (req.query.implements) {
    implementations.getImplementationBySpecification(req.domain, {
      userId: req.user_id,
      'implements': req.query.implements
    }, function (err, implementation) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json(implementation);
      }
    });
  } else {
    implementations.listImplementationsForUser(req.domain, req.user_id, function (err, implementations) {
      if (err) {
        res.json(err.code, { message: err.msg });
      } else {
        res.json(implementations);
      }
    });
  }
});
// TODO: this route is not used. double check in runnable web
app.get('/users/me/implementations/:id', function (req, res) {
  implementations.getImplementation(req.domain, {
    userId: req.user_id,
    implementationId: req.params.id
  }, function (err, implementation) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(implementation);
    }
  });
});
app.put('/users/me/implementations/:id', function (req, res) {
  implementations.updateImplementation(req.domain, {
    userId: req.user_id,
    'implements': req.body.implements,
    containerId: req.body.containerId,
    implementationId: req.params.id,
    requirements: req.body.requirements,
    subdomain: req.body.subdomain
  }, function (err, implementation) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json(implementation);
    }
  });
});
app.del('/users/me/implementations/:id', function (req, res) {
  implementations.deleteImplementation(req.domain, {
    userId: req.user_id,
    implementationId: req.params.id
  }, function (err) {
    if (err) {
      res.json(err.code, { message: err.msg });
    } else {
      res.json({ message: 'implementation deleted' });
    }
  });
});