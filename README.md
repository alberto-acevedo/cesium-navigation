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
This plugin is based on the compass, navigator (zoom in/out), and distance scale from the terriajs open source library 
(https://github.com/TerriaJS). The navigation UI from terriajs can not be used out of the box in Cesium because Cesium
uses CommonJS modules with RequireJS, and the terriajs uses commonjs and Browserify, so you can't just 
copy the source files into Cesium and build.  I adapted the code to work within Cesium as follows:
- extracted the minimum required modules from terriajs.
- Converted all the modules from Browserify to requirejs.
- Use gulpjs to compile and minify the less files, bundle and minify all the modules and open source dependencies 
into just one file. AS part of the build process I decided to replace requirejs with almondjs to reduce the footprint 
of the AMD loader used in the plugin. The almondjs library is also bundle inside the plugin to make the plugin 
very easy to plug and play.
- 


 modules Only the depended modules were extracted from the terrriajs library 


