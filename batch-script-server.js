"use strict";
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
var slash = require("slash");
var url = require("url");
var path = require("path");
var mime = require("mime");

var sSourceDir = "./";
var breakOutRegex = new RegExp("/*\\/\\.\\.\\/*/");

// This line is from the Node.js HTTPS documentation.
const options = {
  key: fs.readFileSync('./client-key.pem'),
  cert: fs.readFileSync('./client-cert.pem'),
  requestCert: false,
  rejectUnauthorized: false
};

function readFile(repositorypath, filepath, res) {
  var sPath = repositorypath + "/" +filepath;
  console.log("GET ", sPath);
  
  fs.exists(sPath, function(exists) {
    if (!exists) {
      res.writeHead(404);
      res.end("File not found!\n");
    } else {
      fs.stat(sPath, function(err, stats) {
        if (err !== null) {
          if (err.code == 'ENOENT') {
              res.writeHead(404);
              res.end();
          } else {
            console.log(err);
          }
          return;
        }
        if (stats.isDirectory()) {
          readDirectory(sPath, res, "text/html");
        } else {
          res.writeHead(200, {
		    'content-type': mime.lookup(sPath)
		  });
		  var stream = fs.createReadStream(sPath, {
		    bufferSize: 64 * 1024
		  });
		  stream.on('error', function (err) {
		    console.log("error reading: " + sPath + " error: " + err);
		    res.end("Error reading file\n");
		  });
		  stream.pipe(res);
        }
      });
    }
  });
}

function readDirectory(aPath, res, contentType){
  fs.readdir(aPath, function(err, files) {
    var dir = {
      type: "directory",
      contents: []
    };
    
    var checkEnd = () => {
         // is there a better way for synchronization???
        if (dir.contents.length === files.length) {
          var data;
          if (contentType == "text/html") {
            // prefix the directory itself as needed if it does not end in "/"
            var match = aPath.match(/\/([^/]+)$/);
            var prefix = match ? match[1] + "/" : "";

            data = "<html><body><h1>" + aPath + "</h1>\n<ul>" +
              "<!-- prefix=" + prefix + ' -->'  +
              dir.contents.map(function(ea) {
                return "<li><a href='" + prefix + ea.name+ "'>"+ea.name + "</a></li>";
              }).join("\n") + "</ul></body></html>";

            // github return text/plain, therefore we need to do the same
            res.writeHead(200, {
              'content-type': 'text/html'
            });
            res.end(data);
          } else {
            data = JSON.stringify(dir, null, 2);
            // github return text/plain, therefore we need to do the same
            res.writeHead(200, {
              'content-type': 'text/plain'
            });
            res.end(data);
          }
        }
    }
    checkEnd()
    files.forEach(function(filename) {
      var filePath = path.join(aPath, filename);
      fs.stat(filePath, function(err, statObj) {
        if (!statObj) {
           dir.contents.push({
            type: "file",
            name: filename,
            size: 0,
          });
        } else if (statObj.isDirectory()) {
          dir.contents.push({
            type: "directory",
            name: filename,
            size: 0
          });
        } else {
          dir.contents.push({
            type: "file",
            name: filename,
            size: statObj.size
          });
        }
        checkEnd()
      });
    });
  });
}

function listOptions(sSourcePath, sPath, req, res) {
  console.log('OPTIONS ', sSourcePath);

  // statFile was called by client
  fs.stat(sSourcePath, function(err, stats) {
    if (err !== null) {
      console.log("stat ERROR: " + err);
      if (err.code == 'ENOENT') {
          res.writeHead(404);
          res.end();
      } else {
        console.log(err);
        //res.writeHead(200, "Some Error");
        //res.end();
      }
      return;
    }
    if (stats.isDirectory()) {
      readDirectory(sSourcePath, res);
    } else if (stats.isFile()) {
      if (req.headers["showversions"] == "true") {
        var repositorypath = sSourceDir  + sPath.replace(/^\/(.*?)\/.*/,"$1") 
        var filepath = sPath.replace(/^\/.*?\/(.*)/,"$1")
        return listVersions(repositorypath, filepath, res)
      }
      // type, name, size
      var result = {type: "file"}
      result.name = sSourcePath.replace(/.*\//,"")
      result.size = stats.size

      var data = JSON.stringify(result, null, 2);
      // github return text/plain, therefore we need to do the same
      res.writeHead(200, {
        'content-type': 'text/plain'
      });
      res.end(data);
    }
  });
}

function writeFile(repositorypath, filepath, req, res) {
  var fullpath = path.join(repositorypath, filepath);
  console.log('PUT ', fullpath);

  var fullBody = '';
  // if (filepath.match(/png$/)) {
    req.setEncoding('binary')
  // }
  
  //read chunks of data and store it in buffer
  req.on('data', function(chunk) {
    fullBody += chunk.toString();
  });

  //after transmission, write file to disk
  req.on('end', function() {
    if (fullpath.match(/\/$/)){
      mkdirp(fullpath, function(err) {
        if (err) {
          //console.log("Error creating dir: " + err);
        }
        //console.log("mkdir " + fullpath);
        res.writeHead(200, "OK");
        res.end();
      });
    } else {
      fs.writeFile(fullpath, fullBody, (fullpath.match(/png$/) ? "binary": undefined), function(err) {
        if (err) {
          //console.error(err);
          res.writeHead(500, err.toString());
          res.end(); 
          return;
        } else {
          //console.log("saved " + fullpath);
          res.writeHead(200, "OK");
          res.end();
		}
      });
    }
  });
}

function deleteFile(repositorypath, filepath, res) {
  var sPath = repositorypath + "/" +filepath;
  console.log('DELETE ', sPath);

  fs.exists(sPath, function(exists) {
    if (!exists) {
      //console.error('file to delete', sPath, ' not found');
      res.writeHead(404);
      res.end("File not found!\n");
    } else {
      fs.unlink(sPath, err => {
        if(err) {
          //console.error('error while deleting the file', err);
          res.writeHead(500, err);
          res.end()
	      return;
        }
        //console.error('deletion complete');
        res.writeHead(200, "OK");
        res.end()
      });
    }
  });
}

function createDirectory(repositorypath, filepath, res) {
  var sPath = repositorypath + "/" +filepath;
  console.log('MKCOL ', sPath);
  
  fs.exists(sPath, function(exists) {
    if (exists) {
      //console.error('Directory already exists', sPath);
      res.writeHead(409, "Directory already exists");
      res.end("");
	  return;
    } else {
      //console.error('create dir', sPath);
      fs.mkdir(sPath, err => {
        if(err) {
          //console.error('error while creating dir', err);
          res.writeHead(500, err);
          res.end()
	      return;
        }
        //console.error('creation of dir complete');
        res.writeHead(200, "OK");
        res.end()
      });
    }
  });
}

function execScript(repositorypath, filepath, res) {
  var path = require('path');
  var sPath = repositorypath + "/" +filepath;
  console.log("POST ", sPath);
  
  fs.exists(sPath, function(exists) {
    if (!exists) {
      res.writeHead(404);
      res.end("File not found!\n");
    } else {
      fs.stat(sPath, function(err, stats) {
        if (err !== null) {
          if (err.code == 'ENOENT') {
              res.writeHead(404);
              res.end();
          } else {
            console.log(err);
          }
          return;
        }
		
		res.writeHead(200, {
		  'content-type': mime.lookup(sPath)
		});

		const spawn = require('child_process').spawn;
		const bat = spawn('cmd.exe', ['/c', path.resolve(process.cwd(), sPath)]);

		bat.stdout.pipe(res);
		bat.stderr.pipe(res);
		bat.on('exit', code => {
		  res.end(`Child exited with code ${code}`);
		  console.log(`Child exited with code ${code}`);
		});
		//child.stdout.pipe(process.stdout);

      });
    }
  });
}

// Create a service (the app object is just a callback).
const app = function(req, res) {
  console.log(req.method, req.url/*, req.headers*/);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE,MKCOL,EXEC');
  // res.setHeader('Access-Control-Allow-Headers', '*');
  // res.setHeader('Access-Control-Allow-Headers', req.header.origin);
  // res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers,lastversion");
  res.setHeader('Access-Control-Max-Age', '1728000');

  var oUrl = url.parse(req.url, true, false);
  //console.log("pathname: " + oUrl.pathname);
  var pathname = oUrl.pathname;

  // use slash to avoid conversion from '\' to '/' on Windows
  var sPath = slash(path.normalize(oUrl.pathname));
  sPath = decodeURI(sPath);
  var repositorypath = sSourceDir  + sPath.replace(/^\/(.*?)\/.*/,"$1") 
  var filepath = sPath.replace(/^\/.*?\/(.*)/,"$1")

  if (breakOutRegex.test(sPath) === true) {
	res.writeHead(500);
	res.end("Your not allowed to access files outside the pages storage area\n");
	return;
  }

  switch(req.method) {
    // case "GET":
    //   readFile(repositorypath, filepath, res);
    //   break;
    // case "PUT":
    //   writeFile(repositorypath, filepath, req, res);
    //   break;
    // case "DELETE":
    //   deleteFile(repositorypath, filepath, res); // #TODO
    //   break;
    // case "MKCOL":
    //   createDirectory(repositorypath, filepath, res); // #TODO
    //   break;
    case "OPTIONS":
      if(req.headers["access-control-request-method"]) {
        // handling a preflight request
        res.writeHead(200, "OK");
        res.end();
        return;
      }
      let sSourcePath = path.join(sSourceDir, sPath);
      listOptions(sSourcePath, sPath, req, res)
      break;
    case "POST":
      execScript(repositorypath, filepath, res); // #TODO
      break;
    default:
      res.writeHead(501, "Request Method Not Implemented");
      res.end();
      break;
  }
}

const port = 8801;

// Create an HTTPS service identical to the HTTP service.
https.createServer(options, app).listen(port);
console.log(`Server active under https://localhost:${port}`);
