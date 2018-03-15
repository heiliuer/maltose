var os = require('os');
var net = require('net');

function _normalizeFamily(family) {
  return family ? family.toLowerCase() : 'ipv4';
}

var Util = {
  checkPortStatus: function(port, options, callback) {
    var Socket = net.Socket;
    var socket = new Socket();
    var host = options.host || '127.0.0.1';
    var timeout = options.timeout || 400;
    var connectionRefused = false;
    var status = null;
    var error = null;
    socket.on('connect', function () {
      status = 'open';
      socket.destroy();
    });
    socket.setTimeout(timeout);
    socket.on('timeout', function () {
      status = 'closed';
      error = new Error('Timeout (' + timeout + 'ms) occurred waiting for ' + host + ':' + port + ' to be available')
      socket.destroy();
    });
    socket.on('error', function (exception) {
      if (['EADDRNOTAVAIL','ECONNREFUSED'].indexOf(exception.code)===-1) {
        error = exception;
      } else {
        connectionRefused = true;
      }
      status = 'closed';
    });
    socket.on('close', function(exception) {
      if (exception && !connectionRefused) {
        error = error || exception;
      } else {
        error = null;
      }
      callback(error, status);
    });
    socket.connect(port, host);
  },

  freePort: function(cb) {
    var server = net.createServer();
    var port = 0;
    server.on('listening', function() {
      port = server.address().port;
      server.close();
    });
    server.on('close', function() {
      cb(null, port);
    });
    server.on('error', function(err) {
      cb(err, null);
    });
    server.listen(0, '127.0.0.1');
  },

  getLocalIp: function (name, family) {
    try {
      var interfaces = os.networkInterfaces();
      var all;
      family = _normalizeFamily(family);
      if (name && name !== 'private' && name !== 'public') {
        var res = interfaces[name].filter(function(details) {
          var itemFamily = details.family.toLowerCase();
          return itemFamily === family;
        });
        if (res.length === 0)
          return undefined;
        return res[0].address;
      }

      all = Object.keys(interfaces).map(function (nic) {
        var addresses = interfaces[nic].filter(function (details) {
          details.family = details.family.toLowerCase();
          if (details.family !== family || Util.isLoopback(details.address)) {
            return false;
          } else if (!name) {
            return true;
          }

          return name === 'public' ? !Util.isPrivate(details.address) :
              Util.isPrivate(details.address);
        });

        return addresses.length ? addresses[0].address : undefined;
      }).filter(Boolean);

      return !all.length ? Util.loopback(family) : all[0];
    } catch (e) {
      console.log(e);
    }
  },

  loopback: function loopback(family) {

    family = _normalizeFamily(family);

    if (family !== 'ipv4' && family !== 'ipv6') {
      throw new Error('family must be ipv4 or ipv6');
    }

    return family === 'ipv4' ? '127.0.0.1' : 'fe80::1';
  },

  isLoopback: function isLoopback(addr) {
    return /^(::f{4}:)?127\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})/
        .test(addr) ||
      /^fe80::1$/.test(addr) ||
      /^::1$/.test(addr) ||
      /^::$/.test(addr);
  },

  isPrivate: function isPrivate(addr) {
    return /^(::f{4}:)?10\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/
        .test(addr) ||
      /^(::f{4}:)?192\.168\.([0-9]{1,3})\.([0-9]{1,3})$/.test(addr) ||
      /^(::f{4}:)?172\.(1[6-9]|2\d|30|31)\.([0-9]{1,3})\.([0-9]{1,3})$/
        .test(addr) ||
      /^(::f{4}:)?127\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/.test(addr) ||
      /^(::f{4}:)?169\.254\.([0-9]{1,3})\.([0-9]{1,3})$/.test(addr) ||
      /^fc00:/i.test(addr) ||
      /^fe80:/i.test(addr) ||
      /^::1$/.test(addr) ||
      /^::$/.test(addr);
  },

  isPublic: function isPublic(addr) {
    return !Util.isPrivate(addr);
  },

  urlJoin: function () {
    function normalize (str) {
      return str
        .replace(/[\/]+/g, '/')
        .replace(/\/\?/g, '?')
        .replace(/\/\#/g, '#')
        .replace(/\:\//g, '://');
    }

    var joined = [].slice.call(arguments, 0).join('/');
    return normalize(joined);
  }
};

module.exports = Util;
