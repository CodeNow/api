'use strict'
console.log('Starting');
var fs = require('fs')
var Dockerode = require('dockerode')

var docker = new Dockerode({
  host: 'localhost',
  port: 2375,
  ca: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/ca.pem'),
  cert: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/cert.pem'),
  key: fs.readFileSync('/Users/myztiq/runnable/devops-scripts/ansible/roles/docker_client/files/certs/swarm-manager/key.pem')
})
console.log(docker);
var container = docker.getContainer('5fd2529dcbac3e6b956a90e94287bb179e5b912bfd35e749e7b958f64bda9529')
console.log(container);
container.logs({
  follow: false,
  stdout: true,
  stderr: true
}, function (err, stream) {
  stream
  .on('data', function (data) {
    console.log(data.toString());
  }) // json parser events
  .on('end', function () {
    console.log('END');
  })
})

console.log('Done');
