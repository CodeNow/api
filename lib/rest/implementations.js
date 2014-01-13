var configs, domains, error, express, implementations;
configs = require('../configs');
implementations = require('../models/implementations');
domains = require('../domains');
error = require('../error');
express = require('express');
module.exports = function (parentDomain) {
  var app;
  app = module.exports = express();
  app.use(domains(parentDomain));
  app.post('/users/me/implementations', function (req, res) {
    return implementations.createImplementation(req.domain, {
      userId: req.user_id,
      'implements': req.body.implements,
      containerId: req.body.containerId,
      requirements: req.body.requirements,
      subdomain: req.body.subdomain
    }, function (err, implementation) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(201, implementation);
      }
    });
  });
  app.get('/users/me/implementations', function (req, res) {
    if (req.query.implements) {
      return implementations.getImplementationBySpecification(req.domain, {
        userId: req.user_id,
        'implements': req.query.implements
      }, function (err, implementation) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json(implementation);
        }
      });
    } else {
      return implementations.listImplementationsForUser(req.domain, req.user_id, function (err, implementations) {
        if (err) {
          return res.json(err.code, { message: err.msg });
        } else {
          return res.json(implementations);
        }
      });
    }
  });
  app.get('/users/me/implementations/:id', function (req, res) {
    return implementations.getImplementation(req.domain, {
      userId: req.user_id,
      implementationId: req.params.id
    }, function (err, implementation) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(implementation);
      }
    });
  });
  app.put('/users/me/implementations/:id', function (req, res) {
    console.log(req.body);
    return implementations.updateImplementation(req.domain, {
      userId: req.user_id,
      'implements': req.body.implements,
      containerId: req.body.containerId,
      implementationId: req.params.id,
      requirements: req.body.requirements,
      subdomain: req.body.subdomain
    }, function (err, implementation) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(implementation);
      }
    });
  });
  app.del('/users/me/implementations/:id', function (req, res) {
    return implementations.deleteImplementation(req.domain, {
      userId: req.user_id,
      implementationId: req.params.id
    }, function (err) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json({ message: 'implementation deleted' });
      }
    });
  });
  return app;
};