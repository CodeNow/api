'use strict';
function attachBuildStream (primus) {
  // handle connection
  primus.on('connection', function (socket) {
    if (socket.query.type !== 'build-stream') {
      return;
    }
    var room = socket.query.id;

    socket.on('data', function(data){
      console.log("dta", data);
      socket.room(room).except(socket.id).write(data);
    });
  });

  return primus;
}

module.exports.attachBuildStream = attachBuildStream;