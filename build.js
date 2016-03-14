(function () {
    "use strict";
    /*jshint node:true*/

    var sourceDir = 'Source';
    var buildDir = 'dist',
        standaloneSubDir = 'standalone',
        amdSubDir = 'amd',
        buildName = 'viewerCesiumNavigationMixin';
    var examplesDir = 'Examples';

    var requirejs = require('requirejs');

    var path = require('path');
    var fs = require('fs-extra');

    var nodeMinify = require('node-minify');

    var minify = function (fileIn, callback) {
        var fileOut = path.join(path.dirname(fileIn), path.basename(fileIn, path.extname(fileIn)) + '.min' + path.extname(fileIn));

        new nodeMinify.minify({
            type: 'uglifyjs',
            fileIn: fileIn,
            fileOut: fileOut,
            callback: function (err) {
                if (err) {
                    console.log(err);
                    return;
                }

                callback(fileOut);
            }
        });
    };

    var shims = {};
    var licenseComments = [];

    var findAllCesiumReferences = function (absPath) {
        if (fs.lstatSync(absPath).isDirectory()) {
            var files = fs.readdirSync(absPath);

            files.forEach(function (subpath) {
                findAllCesiumReferences(absPath + "\\" + subpath);
            });
            return;
        } else if (!fs.lstatSync(absPath).isFile()) {
            return;
        }

        var contents = fs.readFileSync(absPath).toString();

        if (/\.js$/.test(absPath)) {
            // Search for Cesium modules and add shim
            // modules that pull from the Cesium global

            var cesiumRequireRegex = /'Cesium\/\w*\/(\w*)'/g;
            var match;
            while ((match = cesiumRequireRegex.exec(contents)) !== null) {
                if (match[0] in shims) {
                    continue;
                }

                shims[match[0]] = 'define(' + match[0] + ', function() { return Cesium["' + match[1] + '"]; });';
            }
        } else if (/\.glsl$/.test(absPath)) {
            var newContents = [];

            contents = contents.replace(/\r\n/gm, '\n');

            var licenseComments = contents.match(/\/\*\*(?:[^*\/]|\*(?!\/)|\n)*?@license(?:.|\n)*?\*\//gm);
            if (licenseComments !== null) {
                licenseComments = licenseComments.concat(licenseComments);
            }

            // Remove comments. Code ported from
            // https://github.com/apache/ant/blob/master/src/main/org/apache/tools/ant/filters/StripJavaComments.java
            for (var i = 0; i < contents.length; ++i) {
                var c = contents.charAt(i);
                if (c === '/') {
                    c = contents.charAt(++i);
                    if (c === '/') {
                        while (c !== '\r' && c !== '\n' && i < contents.length) {
                            c = contents.charAt(++i);
                        }
                    } else if (c === '*') {
                        while (i < contents.length) {
                            c = contents.charAt(++i);
                            if (c === '*') {
                                c = contents.charAt(++i);
                                while (c === '*') {
                                    c = contents.charAt(++i);
                                }
                                if (c === '/') {
                                    c = contents.charAt(++i);
                                    break;
                                }
                            }
                        }
                    } else {
                        --i;
                        c = '/';
                    }
                }
                newContents.push(c);
            }

            newContents = newContents.join('');
            newContents = newContents.replace(/\s+$/gm, '').replace(/^\s+/gm, '').replace(/\n+/gm, '\n');
        }
    };

    findAllCesiumReferences(sourceDir);

    shims = Object.keys(shims).map(function (key) {
        return shims[key];
    }).join('\n');

    var copyrightHeader = fs.readFileSync(sourceDir + '/copyrightHeader.js').toString();


    // <-- build standalone edition
    var rjsBasicConfig = {
        mainConfigFile: 'mainConfig.js',
        wrap: {
            start: copyrightHeader + '\n' +
                "(function (root, factory) {\n" +
                "    'use strict';\n" +
                "    /*jshint sub:true*/\n" +
                "    \n" +
                "    if (typeof define === 'function' && define.amd) {\n" +
                "        define([], factory);\n" +
                "    }\n" +
                "    \n" +
                "    Cesium['" + buildName + "'] = factory();\n" +
//                "    \n" +
//                "    if(root !== undefined) {\n" +
//                "        root['" + buildName + "'] = Cesium['" + buildName + "'];\n" +
//                "    }\n" +
                "}(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this, function () {\n\n" +
                "// <-- actual code\n\n\n",
            end: "\n\n" +
                "// actual code -->\n\n" +
                "    /*global define,require,self,Cesium*/\n" +
                "    " + licenseComments.join('\n        ') + "\n" +
                "    " + shims + "\n" +
                "    \n" +
                "    return require('viewerCesiumNavigationMixin');\n" +
                "}));"
        },
        name: 'almond',
        include: ['viewerCesiumNavigationMixin'],
        logLevel: 0
    };

    var rjsConfig = JSON.parse(JSON.stringify(rjsBasicConfig));
    rjsConfig.optimize = 'none';
    rjsConfig.out = path.join(buildDir, standaloneSubDir, buildName + '.js');

    requirejs.optimize(rjsConfig, function (buildResponse) {
        console.log('Built standalone edition ' + rjsConfig.out + ' successfully.');

        minify(rjsConfig.out, function (minFile) {
            console.log('Generated minified ' + minFile);

            // copy built file to keep examples up to date
            fs.copySync(minFile, path.join(examplesDir, 'Widgets', 'standalone', 'viewerCesiumNavigationMixin.min.js'), {clobber: true});
            console.log('Copied minified built file to keep examples synchronized with build');
        });
    });
    // -->


    // <-- build amd compatible edition
    var rjsAMDBasicConfig = {
        mainConfigFile: 'mainConfig.js',
        name: 'viewerCesiumNavigationMixin',
        wrap: {
            start: copyrightHeader + '\n\n',
            end: '\n\n\ndefine([\'viewerCesiumNavigationMixin\'], function(viewerCesiumNavigationMixin) {\n' +
                '    return viewerCesiumNavigationMixin;\n' +
                '});'
        },
        logLevel: 0
    };

    var rjsAMDConfig = JSON.parse(JSON.stringify(rjsAMDBasicConfig));
    rjsAMDConfig.optimize = 'none';
    rjsAMDConfig.out = path.join(buildDir, amdSubDir, buildName + '.js');
    requirejs.optimize(rjsAMDConfig, function (buildResponse) {
        console.log('Built AMD compatible edition ' + rjsAMDConfig.out + ' successfully.');

        minify(rjsAMDConfig.out, function (minFile) {
            console.log('Generated minified ' + minFile);

            // copy built file to keep examples up to date
            fs.copySync(minFile, path.join(examplesDir, 'Widgets', 'amd', 'viewerCesiumNavigationMixin.min.js'), {clobber: true});
            console.log('Copied ' + minFile + ' to keep examples synchronized with build');
        });
    });
    // -->
})();