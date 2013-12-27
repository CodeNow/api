var system = require('system');
var webpage = require('webpage');

if (system.args.length !== 3) {
  console.log('must provide a url and a terminal command');
  phantom.exit(-1);
}

var page = webpage.create();

page.open(system.args[1], function (status) {
  if(status !== 'success') {
    console.log('error loading page');
    phantom.exit(-1);
  } else {
    var wait = setInterval(function () {
      // evaluate whether we have a stream connection
      var isStreaming = page.evaluate(function() {
        return window.term;
      });
      if(isStreaming) {
        var command = system.args[2];
        page.sendEvent('keypress', command, null, null, 0);
        page.sendEvent('keypress', page.event.key.Enter, null, null, 0);
        setTimeout(function () {
          var text = page.evaluate(function () {
            return document.body.innerText;
          });
          console.log(text);
          phantom.exit(0);
        }, 500);
        clearInterval(wait);
      }
    }, 1000);
  }
});

page.onError = function(msg, trace) {
    var msgStack = ['ERROR: ' + msg];
    if (trace && trace.length) {
        msgStack.push('TRACE:');
        trace.forEach(function(t) {
            msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
        });
    }
    console.error(msgStack.join('\n'));
};

page.onResourceError = function (resourceError) {
  console.log('Unable to load resource (#' + resourceError.id + 'URL:' + resourceError.url + ')');
  console.log('Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
};

page.onConsoleMessage = function (msg) {
  // console.log(msg);
};