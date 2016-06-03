'use strict';

var fs = require('fs');
var path = require('path');

var ContentType = {
  css: 'text/css',
  js: 'application/javascript'
};

function isMalicious(filepath) {
	var ext = path.extname(filepath);
	return ext !== '.css' && ext !== '.js' || filepath.indexOf('../') !== -1;
}

module.exports = function combo (options) {
  var root = options.root;
  var useCache = options.cache;
  var lashHash, cached = {};
  return function nodeCombo (req, res, next) {
    var comboIndex = req.url.indexOf('??');
    var andIndex = req.url.indexOf('&');
    var url, ext, hash, files, contents = [], rs;

    if (comboIndex > -1) {
      url = andIndex > -1 ? req.url.slice(comboIndex + 2, andIndex) : req.url.slice(comboIndex + 2);
      ext = path.extname(url);
      if (ext.length > 0) {
        res.setHeader('Content-Type', ContentType[ext.slice(1)]);
      }
      if (andIndex > -1) {
        hash = req.url.slice(andIndex + 1);
      }
      if (hash !== lashHash) {
        lashHash = hash;
        cached = {};
      }
      res.setHeader('Expires', 'Mon, 1 Jan 2100 00:00:00 GMT')
			res.setHeader('Last-Modified', 'Mon, 1 Jan 2100 00:00:00 GMT')
			res.setHeader('Cache-Control', 'public, max-age=' + 60 * 60 * 24 * 365);
			res.setHeader('Pragma', 'public');
      files = url.split(',');
      files.forEach(function (file) {
        if (useCache && cached.hasOwnProperty(file)) {
          contents.push(cached[file]);
        } else if (isMalicious(file)) {
					console.log('[maltose]错误的文件：' + file);
				} else {
          var filePath = path.join(root, file);
          var content;
          try {
            content = fs.readFileSync(filePath, 'utf-8');
            contents.push(content);
            if (useCache) {
							cached[file] = content;
						}
          } catch (e) {
            console.log('[maltose]文件读取错误：' + filePath + '\n', e.stack);
          }
        }
      });
      if (contents.length !== files.length) {
				res.writeHead(404);
				res.end();
				next && next({
					status: 404
				});
			} else {
				var chunk = contents.join('\n');
				res.writeHead(200);
				res.write(chunk);
				res.end();
				next && next({
					status: 200
				});
			}
    }
  };
};
