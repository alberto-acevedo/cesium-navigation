(function() {
    "use strict";
    /*global console,require,__dirname,process*/
    /*jshint es3:false*/

    var express = require('express');
    var compression = require('compression');
    var path = require('path');

    var yargs = require('yargs').options({
        'port' : {
            'default' : process.env.PORT || 8080,
            'description' : 'Port to listen on.'
        },
        'public' : {
            'type' : 'boolean',
            'description' : 'Run a public server that listens on all interfaces.'
        },
        'help' : {
            'alias' : 'h',
            'type' : 'boolean',
            'description' : 'Show this help.'
        }
    });
    var argv = yargs.argv;

    if (argv.help) {
        return yargs.showHelp();
    }

    // eventually this mime type configuration will need to change
    // https://github.com/visionmedia/send/commit/d2cb54658ce65948b0ed6e5fb5de69d022bef941
    var mime = express.static.mime;
    mime.define({
        'application/json' : ['czml', 'json', 'geojson', 'topojson', 'gltf'],
        'text/plain' : ['glsl']
    });

    var app = express();
    app.use(compression());
    app.use(express.static(__dirname));
    // don't forget to copy necessary files when preparing the gh-pages on github since there is no redirecting
    app.use(express.static(path.join(__dirname, '..', 'Source')));
    app.use('/cesiumNavigationMainConfig.js', express.static(path.join(__dirname, '..', 'mainConfig.js')));
    app.use('/node_modules', express.static(path.join(__dirname, '..', 'node_modules')));
    app.use('/bower_components', express.static(path.join(__dirname, '..', 'bower_components')));
    app.use('/dist', express.static(path.join(__dirname, '..', 'dist')));

    var serverName = 'Cesium navigation examples server';

    var server = app.listen(argv.port, argv.public ? undefined : 'localhost', function() {
        if (argv.public) {
            console.log(serverName + ' is running publicly.');
            console.log('\tConnect to http://\<your_ip\>:%d, e.g. http://localhost:%d', server.address().port, server.address().port);
        } else {
            console.log(serverName + ' is running locally.');
            console.log('\tConnect to http://localhost:%d', server.address().port);
        }
    });

    server.on('error', function (e) {
        if (e.code === 'EADDRINUSE') {
            console.log('Error: Port %d is already in use, select a different port.', argv.port);
            console.log('Example: node server.js --port %d', argv.port + 1);
        } else if (e.code === 'EACCES') {
            console.log('Error: This process does not have permission to listen on port %d.', argv.port);
            if (argv.port < 1024) {
                console.log('Try a port number higher than 1024.');
            }
        }
        console.log(e);
        process.exit(1);
    });

    // Maintain an array of all connected sockets
    var sockets = [];
    server.on('connection', function (socket) {
        // Add a newly connected socket
        sockets.push(socket);

        // Remove the socket when it closes
        socket.on('close', function () {
            sockets.splice(sockets.indexOf(socket), 1);
        });
    });

    var shutdownSever = function() {
        server.close();

        for (var i = 0; i < sockets.length; i++) {
            sockets[i].destroy();
        }
    };

    server.once('close', function() {
        console.log(serverName + ' has stopped.');
        process.exit();
    });

    process.once('SIGTERM', shutdownSever);
    process.once('SIGINT', shutdownSever);

})();

