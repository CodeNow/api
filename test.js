var Github = require('github');

var github = new Github({
        version: '3.0.0',
        debug: true,
        protocol: 'https',
        requestMedia: 'application/json'
});

