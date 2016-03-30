Missing files
------------

These examples are using Cesium and RequireJS so you have to run `npm install` to get these.
The AMD example needs to be built in advance. To do so run `node build.js` from the `Examples` root directory


Where are the dependencies from?
------------

The root directory of the server is `Examples` but some files from the parent/main directory are needed.
This is achieved by internal redirects:
`dist`                          ->      `../dist`
`node_modules`                  ->      `../node_modules`
`bower_components`              ->      `../bower_components`
`cesiumNavigationSource`        ->      `../Source`
`cesiumNavigationMainConfig`    ->      `../mainConfig.js`

Using these redirects ensures that the examples are always running with the current build and/or sources of the main project.
Furthermore it avoids redundant node modules and/or bower components


Local server
------------

A local HTTP server is required to run the app.

Use Cesium's node.js server.

* Install [node.js](http://nodejs.org/)
* From the `Examples` root directory, run
   * `node server.js`

Browse to `http://localhost:8080/`
