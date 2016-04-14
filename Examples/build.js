// This only builds the sources for the example amd.html
// all other examples do not need to be built.

var requirejs = require('requirejs');

var config = {
    baseUrl: '.',
    optimize: 'uglify2',
    mainConfigFile: 'Source/mainConfig.js',
    name: "Source/amd/main",
    out: "Build/amd.min.js",
    logLevel: 0
};

requirejs.optimize(config);