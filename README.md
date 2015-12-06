# cesium-navigation

What is this plugin for?

This is a Cesium plugin that adds to the Cesium map a user friendly compass, navigator (zoom in/out), and 
distance scale graphical user interface. 

Why did you build it?

First of all the Cesiumjs sdk does not includes a compass, navigator (zoom in/out), and distance scale. You can use the  
mouse to navigate on the map, but this navigation plugin  offers more navigation control and 
capabilities to the user. Some of the capabilities are: reset the compass to point to north, reset the orbit, and 
reset the view to a default bound.

How did you build it?

This plugin is based on the excellent compass, navigator (zoom in/out), and distance scale from the terriajs open source library 
(https://github.com/TerriaJS). The navigation UI from terriajs can not be used out of the box in Cesium because Cesium
uses CommonJS modules with RequireJS, and the terriajs uses commonjs and Browserify, so you can't just 
copy the source files into Cesium and build.  My work consisted on adapting the code to work within Cesium as a plugin as follows:
    - extracted the minimum required modules from terriajs.
    - Converted all the modules from Browserify to requirejs.
    - Use gulpjs to compile and minify the less files, bundle and minify all the modules and open source dependencies 
    into just one file. As part of the build process I decided to replace requirejs with almondjs to reduce the footprint 
    of the AMD loader used in the plugin. The almondjs library is also bundle inside the plugin to make the plugin 
    as easy as plug and play with Cesium.

How to use it?
-
This plugin was tested on Cesiumjs version 1.15.
- add the cesium-navigation folder from the distribution (dist) folder into your Cesium map application. Or download the plugin from gitHub and build a release version of the plugin as follows:
- 
    gulp defaut --> for the minified plugin (recommended)
    or
    gulp release-unminified --> for the unminified plugin

- Add the a script with the following src into your html file:
-
     <script src="<path>/cesium-navigation/cesium-navigation.js"  ></script>
     
- In the style section add: 
-

      @import url(<path>/cesium-navigation/cesium-navigation.css);

- In the body section add:
- 

       var viewer = new Cesium.Viewer('cesiumContainer'); 
       navigationInitialization('cesiumContainer', viewer); //The function initializes the navigation plugin within the Cesium                viewer. This function also assigns the instantiated plugin navigation object to the viewer (viewer.navigatioon).

- To destroy and release the resources later on, use the following:
- 
        viewer.navigation.destroy();
        viewer.navigation = undefined;

Is there a sample with  the plugin that runs out of the box?

- There is a sample in the sample folder that is based on the HelloWorld.html that comes with the Cesiumjs sdk. Just deploy the CesiumNavigation folder into a web server like for example Apache Tomcat.Then open your browser with the following link:
     http://<server domain:port>/CesiumNavigation/Apps/HelloWorld.html
- The compass, navigator, and distance scale will appear on the right side of te map.

What version is this plugin?

- release Version 0.1. 

What about the license?

 - The plugin is 100% based on open source. THe same license that applies to Cesiumjs and terriajs applies also to this plugin. Feel free to use it,  modify it, and improve it. 


