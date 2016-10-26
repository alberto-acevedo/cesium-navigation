// This only builds the sources for the example amd.html
// all other examples do not need to be built.

var requirejs = require('requirejs');

var config = {
    baseUrl: '.',
    optimize: 'uglify2',
    mainConfigFile: 'Source/mainConfig.js',
    name: "Source/amd/main-build",
    out: "Build/amd.min.js",
    paths: {
        // do not include Cesium in the build file but rather access it seperately from browser
        Cesium: "empty:"
    },
    logLevel: 0
};

requirejs.optimize(config);