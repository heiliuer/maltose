var fs = require('fs');
var path = require('path');
var http = require('http');
var url = require('url');
var EventEmitter = require('events');
var mime = require('mime');
var connect = require('connect');
var WSServer = require('maltose-ws').Server;
var open = require('./open');
var livereloadMid = require('./livereload-mid');
var Util = require('./util');

var version = '0.0.1';

var Server = function (options) {
  if (!options) {
    throw new Error('请传入参数');
  }
  var serverConfig = options.server;
  if (!serverConfig || !serverConfig.baseDir) {
    throw new Error('请传入正确参数');
  }
  this.port = options.port;
  this.host = serverConfig.host || '0.0.0.0';
  this.root =  serverConfig.baseDir;
  this.index = serverConfig.index || 'index.html';
  this.headers = serverConfig.headers || {};
  this.isDebug = options.debug || false;
  this.conns = [];
  this.web = null;
  this.ip = Util.getLocalIp();
  this.serverInfo = 'maltose/' + version;
};

Server.prototype = {
  serve: function (callback) {
    var port = this.port || 3000;
    var serveUrl = 'http://localhost:' + port || 3000;
    var app = connect();
    app.use(livereloadMid({
      port: port
    }));
    app.use(function (req, res) {
      var originalPathname = decodeURI(url.parse(req.url).pathname);
      var pathname = this.resolve(originalPathname);
      var promise = new EventEmitter();
      var finish = function (status, headers) {
        this.finish(status, headers, req, res, promise, callback);
      }.bind(this);
      if (originalPathname === '/livereload.js') {
        res.writeHead(200, {
          'Content-Type': 'text/javascript'
        });
        return res.end(fs.readFileSync(path.join(__dirname , 'livereload.js')));
      } else if (pathname.indexOf(this.root) === 0) {
        fs.stat(pathname, function (e, stat) {
          if (e) { // 404
            finish(404, {});
          } else if (stat.isFile()) { // 文件
            this.serveFile(pathname, stat, req, res, finish);
          } else if (stat.isDirectory()) { // 目录
            this.serveDir(pathname, stat, req, res, finish);
          } else {
            finish(400, {});
          }
        }.bind(this));
      } else {
        finish(403, {});
      }
    }.bind(this));

    var server = http.createServer(app);
    server.listen(port, this.host);
    this.listen(server);
    console.log('-------------------------------------');
    console.log('      访问：' + serveUrl);
    console.log('    ip地址：' + this.ip);
    console.log('-------------------------------------');
    console.log('[maltose]预览文件目录：' + this.root);
    open(serveUrl);
  },

  resolve: function (pathname) {
    return path.resolve(path.join(this.root, pathname));
  },

  listen: function (server) {
    this.wss = new WSServer({
  		server: server,
      path: '/livereload'
  	});
    return this.wss.on('connection', this.onConnection.bind(this));
  },

  onConnection: function (ws) {
    this.debug("Browser connected.");
    this.conns.push(ws);
    ws.on('message', function(msg) {
      var handshake, protocols;
			msg = JSON.parse(msg);
			if (msg.command === 'hello') {
				protocols = msg.protocols;
				protocols.push('http://livereload.com/protocols/2.x-remote-control');
				protocols.push('http://livereload.com/protocols/official-7');
				handshake = {
					'command': 'hello',
					'protocols': protocols,
					'serverName': 'livereload-node'
				};
				ws.send(JSON.stringify(handshake));
			}
			if (msg.command === 'info' && msg['url']) {
        this.currentUrl = msg.url;
				console.log("Browser URL: " + msg.url);
			}

    }.bind(this));
    ws.on('close', function() {
      this.conns.splice(this.conns.indexOf(ws, 1));
      return this.debug('Browser disconnected.');
    }.bind(this));
    ws.on('error', function(err) {
      this.conns.splice(this.conns.indexOf(ws, 1));
      return this.debug("Error in client socket: " + err);
    }.bind(this));
  },

  reload: function (paths) {
    console.log('[maltose]浏览器刷新...');
    try {
      var conn, data, _i, _len, _results;
      if (paths == null) {
        paths = [];
      }
      _results = [];
      for (_i = 0, _len = paths.length; _i < _len; _i++) {
        var fp = paths[_i];
        data = {
          command: 'reload',
          path: fp,
          liveCSS: true,
          liveImg: true
        };
        _results.push((function() {
          var _j, _len1, _ref, _results1;
          _ref = this.conns;
          _results1 = [];
          for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
            conn = _ref[_j];
            if (conn.readyState !== conn.OPEN) {
              this.debug('Client state is ' + conn.readyState);
            } else {
              _results1.push(conn.send(JSON.stringify(data)));
            }
          }
          return _results1;
        }).call(this));
      }
      return _results;
    } catch (e) {
      console.log(e);
    }
  },

  getCurrentUrl: function () {
    return this.currentUrl;
  },

  debug: function (str) {
    if (this.isDebug) {
      console.log(str + "\n");
    }
  },

  notify: function (msg) {

  },

  serveFile: function (pathname, stat, req, res, finish) {
    var promise = new(EventEmitter);
    fs.stat(pathname, function (e, stat) {
      if (e) {
        return promise.emit('error', e);
      }
      this.respond(null, 200, {}, [pathname], stat, req, res, finish);
    }.bind(this));
    return promise;
  },

  serveDir: function (pathname, stat, req, res, finish) {
    var indexPath = path.join(pathname, this.index);
    fs.stat(indexPath, function (err, stat) {
      if (!err) {
        var status = 200;
        var headers = {};
        var originalPathname = decodeURI(url.parse(req.url).pathname);
        if (originalPathname.length && originalPathname.charAt(originalPathname.length - 1) !== '/') {
          finish(301, { 'Location': originalPathname + '/' });
        } else {
          this.respond(null, status, headers, [indexPath], stat, req, res, finish);
        }
      } else { // 入口文件填写错误
        finish(404, {});
      }
    }.bind(this));
  },

  parseByteRange: function (req, stat) {
    var byteRange = {
      from: 0,
      to: 0,
      valid: false
    }

    var rangeHeader = req.headers['range'];
    var flavor = 'bytes=';

    if (rangeHeader) {
      if (rangeHeader.indexOf(flavor) == 0 && rangeHeader.indexOf(',') == -1) {
        rangeHeader = rangeHeader.substr(flavor.length).split('-');
        byteRange.from = parseInt(rangeHeader[0]);
        byteRange.to = parseInt(rangeHeader[1]);

        if (isNaN(byteRange.from) && !isNaN(byteRange.to)) {
          byteRange.from = stat.size - byteRange.to;
          byteRange.to = stat.size ? stat.size - 1 : 0;
        } else if (!isNaN(byteRange.from) && isNaN(byteRange.to)) {
          byteRange.to = stat.size ? stat.size - 1 : 0;
        }

        if (!isNaN(byteRange.from) && !!byteRange.to && 0 <= byteRange.from && byteRange.from < byteRange.to) {
          byteRange.valid = true;
        } else {
          console.warn('Request contains invalid range header: ', rangeHeader);
        }
      } else {
        console.warn('Request contains unsupported range header: ', rangeHeader);
      }
    }
    return byteRange;
  },

  respond: function (pathname, httpStatus, headers, files, stat, req, res, finish) {
    var contentType = headers['Content-Type'] ||
                      mime.lookup(files[0]) ||
                      'application/octet-stream';
    var mtime = Date.parse(stat.mtime);
    var key = pathname || files[0];
    var _headers = {};
    var clientETag = req.headers['if-none-match'];
    var clientMTime = Date.parse(req.headers['if-modified-since']);
    var startByte = 0;
    var length = stat.size;
    var byteRange = this.parseByteRange(req, stat);
    if (files.length == 1 && byteRange.valid) {
      if (byteRange.to < length) {
        startByte = byteRange.from;
        length = byteRange.to - byteRange.from + 1;
        httpStatus = 206;
        _headers['Content-Range'] = 'bytes ' + byteRange.from + '-' + byteRange.to + '/' + stat.size;
      } else {
        byteRange.valid = false;
        console.warn('Range request exceeds file boundaries, goes until byte no', byteRange.to, 'against file size of', length, 'bytes');
      }
    }
    if (!byteRange.valid && req.headers['range']) {
      console.error(new Error('Range request present but invalid, might serve whole file instead'));
    }

    for (var k in this.headers) {
      _headers[k] = this.headers[k];
    }
    for (var k in headers) {
      _headers[k] = headers[k];
    }
    _headers['Etag'] = JSON.stringify([stat.ino, stat.size, mtime].join('-'));
    _headers['Date'] = new(Date)().toUTCString();
    _headers['Last-Modified'] = new(Date)(stat.mtime).toUTCString();
    _headers['Content-Type'] = contentType;
    _headers['Content-Length'] = length;
    for (var k in headers) {
      _headers[k] = headers[k];
    }
    if ((clientMTime  || clientETag) &&
      (!clientETag  || clientETag === _headers['Etag']) &&
      (!clientMTime || clientMTime >= mtime)) {
      // 304 response should not contain entity headers
      ['Content-Encoding',
       'Content-Language',
       'Content-Length',
       'Content-Location',
       'Content-MD5',
       'Content-Range',
       'Content-Type',
       'Expires',
       'Last-Modified'].forEach(function(entityHeader) {
          delete _headers[entityHeader];
        });
      finish(304, _headers);
    } else {
      res.writeHead(httpStatus, _headers);
      this.stream(key, files, new Buffer(length), startByte, res, function (e, buffer) {
        if (e) {
          console.error(e);
          return finish(500, {});
        }
        finish(httpStatus, _headers);
      });
    }
  },

  stream: function (pathname, files, buffer, startByte, res, callback) {
    (function streamFile (files, offset) {
      var file = files.shift();
      var startByte = 0;
      if (file) {
        file = path.resolve(file) === path.normalize(file)  ? file : path.join(pathname || '.', file);
        fs.createReadStream(file, {
          flags: 'r',
          start: startByte,
          end: startByte + (buffer.length ? buffer.length - 1 : 0)
        }).on('data', function (chunk) {
          if (chunk.length && offset < buffer.length && offset >= 0) {
            chunk.copy(buffer, offset);
            offset += chunk.length;
          }
        }).on('close', function () {
          streamFile(files, offset);
        }).on('error', function (err) {
          console.error(err);
          callback(err);
        }).pipe(res, { end: false });
      } else {
        res.end();
        callback(null, buffer, offset);
      }
    })(files.slice(0), 0);
  },

  finish: function (httpStatus, headers, req, res, promise, callback) {
    var result = {
       status:  httpStatus,
       headers: headers,
       message: http.STATUS_CODES[httpStatus]
     };

    headers['server'] = this.serverInfo;
    if (!httpStatus || httpStatus >= 400) {
      if (callback) {
        callback(result);
      } else {
        if (promise.listeners('error').length > 0) {
          promise.emit('error', result);
        }
        else {
          res.writeHead(httpStatus, headers);
          res.write(http.STATUS_CODES[httpStatus]);

          res.end();
        }
      }
    } else {
      if (httpStatus !== 200 || req.method !== 'GET') {
        res.writeHead(httpStatus, headers);
        res.end();
      }
      callback && callback(null, result);
      promise.emit('success', result);
    }
  }
};

module.exports = Server;
