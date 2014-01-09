var configs, domains, error, express, specifications;
configs = require('../configs');
specifications = require('../models/specifications');
domains = require('../domains');
error = require('../error');
express = require('express');
module.exports = function (parentDomain) {
  var app;
  app = module.exports = express();
  app.use(domains(parentDomain));
  app.post('/specifications', function (req, res) {
    return specifications.createSpecification(req.domain, {
      userId: req.user_id,
      name: req.body.name,
      description: req.body.description,
      instructions: req.body.instructions,
      requirements: req.body.requirements
    }, function (err, specification) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(201, specification);
      }
    });
  });
  app.get('/specifications', function (req, res) {
    return specifications.listSpecifications(req.domain, function (err, specifications) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(specifications);
      }
    });
  });
  app.get('/specifications/:id', function (req, res) {
    return specifications.getSpecification(req.domain, req.params.id, function (err, specification) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(specification);
      }
    });
  });
  app.put('/specifications/:id', function (req, res) {
    return specifications.updateSpecification(req.domain, {
      userId: req.user_id,
      specificationId: req.params.id,
      name: req.body.name,
      description: req.body.description,
      instructions: req.body.instructions,
      requirements: req.body.requirements
    }, function (err, specification) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json(specification);
      }
    });
  });
  app.del('/specifications/:id', function (req, res) {
    return specifications.deleteSpecification(req.domain, {
      userId: req.user_id,
      specificationId: req.params.id
    }, function (err) {
      if (err) {
        return res.json(err.code, { message: err.msg });
      } else {
        return res.json({ message: 'specification deleted' });
      }
    });
  });
  return app;
};