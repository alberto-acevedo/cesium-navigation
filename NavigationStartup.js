var startupScriptRegex = /(.*?)(NavigationStartup)\w*\.js(?:\W|$)/i;
function getBaseTerriaNavigationUrl()
{
   var manifestUrl = window.location.href;
   var scripts = document.getElementsByTagName('script');
   for (var i = 0, len = scripts.length; i < len; ++i) {
	   var src = scripts[i].getAttribute('src');
	   if (src && src.toLowerCase().indexOf('terrianavigation') > 0)
	   {
		   var result = startupScriptRegex.exec(src);
		   if (result !== null)
		   {
			   return result[1];
		   }
	   }

   }
   return undefined;
};

var baseTerriaNavigationUrl = getBaseTerriaNavigationUrl();



 require.config({
			paths: {
				'Knockout': baseTerriaNavigationUrl + 'lib/ThirdParty/knockout-3.3.0',
				'knockoutes5': baseTerriaNavigationUrl +  'lib/ThirdParty/knockout-es5.min',
				'Hammer': baseTerriaNavigationUrl +  'lib/ThirdParty/hammerjs',
				'sanitizeCaja': baseTerriaNavigationUrl +  'lib/ThirdParty/sanitizer-bundle',
				'MarkdownIt': baseTerriaNavigationUrl +  'lib/ThirdParty/markdown-it.min',
				'text': baseTerriaNavigationUrl +  'lib/ThirdParty/text',
				'navigatorTemplate': baseTerriaNavigationUrl +  'lib/Views/Navigation.html',
				'distanceLegendTemplate': baseTerriaNavigationUrl +  'lib/Views/DistanceLegend.html',
				'DistanceLegendViewModel': baseTerriaNavigationUrl +  'lib/ViewModels/DistanceLegendViewModel',
				'createFragmentFromTemplate': baseTerriaNavigationUrl +  'lib/Core/createFragmentFromTemplate',
				'loadView': baseTerriaNavigationUrl +  'lib/Core/loadView',
				'inherit': baseTerriaNavigationUrl +  'lib/Core/inherit',
				'svgReset': baseTerriaNavigationUrl +  'lib/SvgPaths/svgReset',
				'UserInterfaceControl': baseTerriaNavigationUrl +  'lib/ViewModels/UserInterfaceControl',
				'NavigationControl': baseTerriaNavigationUrl +  'lib/ViewModels/NavigationControl',
				'ResetViewNavigationControl': baseTerriaNavigationUrl +  'lib/ViewModels/ResetViewNavigationControl',
				'ZoomInNavigationControl': baseTerriaNavigationUrl +  'lib/ViewModels/ZoomInNavigationControl',
				'ZoomOutNavigationControl': baseTerriaNavigationUrl +  'lib/ViewModels/ZoomOutNavigationControl',
				'svgCompassOuterRing': baseTerriaNavigationUrl +  'lib/SvgPaths/svgCompassOuterRing',
				'svgCompassGyro': baseTerriaNavigationUrl +  'lib/SvgPaths/svgCompassGyro',
				'svgCompassRotationMarker': baseTerriaNavigationUrl +  'lib/SvgPaths/svgCompassRotationMarker',
				'KnockoutMarkdownBinding': baseTerriaNavigationUrl +  'lib/Core/KnockoutMarkdownBinding',
				'KnockoutHammerBinding': baseTerriaNavigationUrl +  'lib/Core/KnockoutHammerBinding',
				'registerKnockoutBindings': baseTerriaNavigationUrl +  'lib/Core/registerKnockoutBindings',
				'NavigationViewModel': baseTerriaNavigationUrl +  'lib/ViewModels/NavigationViewModel',
				'Navigation': baseTerriaNavigationUrl +  'Navigation',
				'CameraView': baseTerriaNavigationUrl +  'lib/Models/CameraView'

			}
       });

       function navigationInitialization(cesiumContainerId, viewer)
       {
		   require(['Navigation'], function (navigation) {
		   		navigation.initialize(document.getElementById(cesiumContainerId), viewer);
		   		viewer.navigation = navigation;
                });
	   };

