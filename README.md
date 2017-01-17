# cesium-navigation
This is a Cesium plugin that adds to the Cesium map a user friendly compass, navigator (zoom in/out), and
distance scale graphical user interface.

**Why did you build it?**

First of all the Cesiumjs sdk does not include a compass, navigator (zoom in/out) nor distance scale. You can use the mouse to navigate on the map but this navigation plugin offers more navigation control and capabilities to the user.
Some of the capabilities are:
reset the compass to point to north, reset the orbit, and reset the view to a default bound.

**How did you build it?**

This plugin is based on the excellent compass, navigator (zoom in/out) and distance scale from the terriajs open source library (https://github.com/TerriaJS). The navigation UI from terriajs can not be used out of the box in Cesium because Cesium uses AMD modules with RequireJS, and the terriajs uses commonjs and Browserify, so you can't just copy the source files into Cesium and build.  My work consisted on adapting the code to work within Cesium as a plugin as follows:

- Extracted the minimum required modules from terriajs.
- Converted all the modules from Browserify to requirejs.
- Using nodejs and the requirejs optimizer as well as almond the whole plugin is built and bundled in a single file even the CSS style
- This plugin can be used as a standalone script or via an AMD loader (tested with requirejs). Even in the special case where you use AMD but not for Cesium the plugin can be easily used.

**How to use it?**

*When to use which edition?*

There are two editions, a standalone edition and an AMD compatible edition. If you want to load the mixin via requireJS then use the AMD compatible edition. Otherwise use the standalone edition which includes almond to resolve dependencies. Below some examples are given for better understanding.

- If you are loading Cesium without requirejs (i.e. you have a global variable Cesium) then use the standalone edition. This edition is also suitable if you use requirejs but not for this mixin.
```HTML
<head>
  <!-- other stuff -->

  <script src="path/to/Cesium.js"></script>
  <!-- IMPORTANT: because the cesium navigation viewer mixin depends on Cesium be sure to load it after Cesium -->
  <script src="path/to/standalone/viewerCesiumNavigationMixin.js"></script>

  <!-- other stuff ... -->
</head>
```
and then extend a viewer:

```JavaScript
    // create a viewer assuming there is a DIV element with id 'cesiumContainer'
	var cesiumViewer = new Cesium.Viewer('cesiumContainer');

	// extend our view by the cesium navigaton mixin
	cesiumViewer.extend(Cesium.viewerCesiumNavigationMixin, {});
```

or a widget:

```JavaScript
    // create a widget assuming there is a DIV element with id 'cesiumContainer'
    var cesiumWidget = new Cesium.CesiumWidget('cesiumContainer');

	// extend our view by the cesium navigaton mixin
	Cesium.viewerCesiumNavigationMixin.mixinWidget(cesiumWidget, {});
```

You can access the newly created instance via

```
    // if using a viewer
	var cesiumNavigation = cesiumViewer.cesiumNavigation;

	// if using a widget
	var cesiumNavigation = cesiumWidget.cesiumNavigation;
```

Another example if your are using requirejs except for Cesium:
```HTML
<head>
  <!-- other stuff... -->

  <script src="path/to/Cesium.js"></script>
  <!-- IMPORTANT: loading requirejs after Cesium ensures that when requiring -->
  <!-- viewerCesiumNavigationMixin the global variable Cesium is already set -->
  <script type="text/javascript" src="path/to/require.js"></script>
  <script type="text/javascript">
    require.config({
      // your config...
    });
  </script>

  <!-- other stuff... -->
</head>
```
and code
```JavaScript
  // IMPORTANT: be sure that Cesium.js has already been loaded, e.g. by loading requirejs AFTER Cesium
  require(['path/to/amd/viewerCesiumNavigationMixin'], function(viewerCesiumNavigationMixin) {
    // like above code but now one can directly access
    // viewerCesiumNavigationMixin
    // instead of
    // Cesium.viewerCesiumNavigationMixin
  }
```

- If you are using requirejs for your entire project, including Cesium, then you have to use the AMD compatible edition.

```HTML
<head>
  <!-- other stuff... -->

  <script type="text/javascript" src="path/to/require.js"></script>
  <script type="text/javascript">
    require.config({
        // your config...
		paths: {
		    // your paths...
		    // IMPORTANT: Cesium must point to either
			'Cesium': 'path/to/cesium/Source'
		    //  or to
			'Cesium': 'path/to/cesium/Source/Cesium.js'
		    //  or to
			'Cesium': 'path/to/cesium/Build/Cesium'
		    //  or to
			'Cesium': 'path/to/cesium/Build/Cesium/Cesium.js'
		    //  because viewerCesiumNavigationMixin uses 'Cesium' for dependencies
		}
    });
  </script>

  <!-- other stuff... -->
</head>
```
and the code
```JavaScript
require([
  'Cesium/Cesium', // if Cesium points to Cesium directory
  'Cesium', // if Cesium points to Cesium.js file
  'path/to/amd/viewerCesiumNavigationMixin'
], function(
  Cesium,
  viewerCesiumNavigationMixin) {

  // like above but now you cannot access Cesium.viewerCesiumNavigationMixin
  // but use just viewerCesiumNavigationMixin
});
```
or if Cesium points to the Cesium directory
```JavaScript
require([
  'Cesium/Core/Viewer',
  'path/to/amd/viewerCesiumNavigationMixin'
], function(
  CesiumViewer,
  viewerCesiumNavigationMixin) {

  // like above but now you cannot access Cesium.viewerCesiumNavigationMixin
  // but use just viewerCesiumNavigationMixin
});
```
*Available options of the plugin*
```
defaultResetView --> option used to set a default view when resetting the map view with the reset navigation 
control. Values accepted are of type Cesium.Cartographic and Cesium.Rectangle.

enableCompass --> option used to enable or disable the compass. Values accepted are true for enabling and false to disable. The default is true.

enableZoomControls --> option used to enable or disable the zoom controls. Values accepted are true for enabling and false to disable. The default is true.

enableDistanceLegend --> option used to enable or disable the distance legend. Values accepted are true for enabling and false to disable. The default is true.

More options will be set in future releases of the plugin.
```
Example of using the options when loading Cesium without requirejs: 
```JavaScript
var options = {};
options.defaultResetView = Cesium.Rectangle.fromDegrees(71, 3, 90, 14);
// Only the compass will show on the map
options.enableCompass = true;
options.enableZoomControls = false;
options.enableDistanceLegend = false;
cesiumViewer.extend(Cesium.viewerCesiumNavigationMixin, options);
```

*Others*

- To destroy the navigation object and release the resources later on use the following
```JavaScript
  viewer.cesiumNavigation.destroy();
```
- To lock the compass and navigation controls use the following. Use true to lock mode, 
- false for unlocked mode. The default is false.
```JavaScript
  viewer.cesiumNavigation.setNavigationLocked(true/false);
```

- if there are still open questions please checkout the examples


**How to build it?**

- run `npm install`
- run `node build.js`
- The build process also copies the files to the Example folder in order to always keep them sync with your build


**Developers guide**

For developing/debugging you should have a look at the "Source example". That example directly uses the source files and therefore it allows you to immediatley (only a page refresh is needed) see your changes without rebuilding anything. Furthermore due to working with the sources you can easily debug the project (e.g. via the developer console of the browser or via a debugger of your IDE like Webstorm)


**Is there a demo using the plugin?**

This is the demo:

(http://larcius.github.io/cesium-navigation/)

- The compass, navigator, and distance scale will appear on the right side of te map.
- This plugin was successfully tested on Cesium version 1.27. It works great with Cesium in 3D mode. Recently Larcius (https://github.com/Larcius) made a lot of improvements and fixed some issues in Columbus and 2D modes.

**What about the license?**
 - The plugin is 100% based on open source libraries. The same license that applies to Cesiumjs and terriajs applies also to this plugin. Feel free to use it,  modify it, and improve it.
