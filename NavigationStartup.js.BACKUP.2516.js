var startupScriptRegex = /(.*?)(cesium-navigation)\w*\.js(?:\W|$)/i;
function getBaseTerriaNavigationUrl()
{
    var manifestUrl = window.location.href;
    var scripts = document.getElementsByTagName('script');
    for (var i = 0, len = scripts.length; i < len; ++i) {
        var src = scripts[i].getAttribute('src');
        if (src && src.toLowerCase().indexOf('cesium-navigation') > 0)
        {
            var result = startupScriptRegex.exec(src);
            if (result !== null)
            {
                return result[1];
            }
        }

    }
    return undefined;
}
;
var baseTerriaNavigationUrl = '';
if (typeof window !== 'undefined') {
    baseTerriaNavigationUrl = getBaseTerriaNavigationUrl();
}



requirejs.config({
    baseUrl: baseTerriaNavigationUrl,
    paths: {
        'Knockout': 'lib/ThirdParty/knockout-3.3.0',
        'knockoutes5': 'lib/ThirdParty/knockout-es5.min',
        'Hammer': 'lib/ThirdParty/hammerjs',
        'sanitizeCaja': 'lib/ThirdParty/sanitizer-bundle',
        'MarkdownIt': 'lib/ThirdParty/markdown-it.min',
        'navigatorTemplate': 'lib/Views/Navigation.html',
        'distanceLegendTemplate': 'lib/Views/DistanceLegend.html',
        'DistanceLegendViewModel': 'lib/ViewModels/DistanceLegendViewModel',
        'createFragmentFromTemplate': 'lib/Core/createFragmentFromTemplate',
        'loadView': 'lib/Core/loadView',
        'inherit': 'lib/Core/inherit',
        'svgReset': 'lib/SvgPaths/svgReset',
        'UserInterfaceControl': 'lib/ViewModels/UserInterfaceControl',
        'NavigationControl': 'lib/ViewModels/NavigationControl',
        'ResetViewNavigationControl': 'lib/ViewModels/ResetViewNavigationControl',
        'ZoomInNavigationControl': 'lib/ViewModels/ZoomInNavigationControl',
        'ZoomOutNavigationControl': 'lib/ViewModels/ZoomOutNavigationControl',
        'svgCompassOuterRing': 'lib/SvgPaths/svgCompassOuterRing',
        'svgCompassGyro': 'lib/SvgPaths/svgCompassGyro',
        'svgCompassRotationMarker': 'lib/SvgPaths/svgCompassRotationMarker',
        'KnockoutMarkdownBinding': 'lib/Core/KnockoutMarkdownBinding',
        'KnockoutHammerBinding': 'lib/Core/KnockoutHammerBinding',
        'registerKnockoutBindings': 'lib/Core/registerKnockoutBindings',
        'NavigationViewModel': 'lib/ViewModels/NavigationViewModel',
        'Navigation': 'Navigation',
        'CameraView': 'lib/Models/CameraView'

    },
     wrap: true
});

function navigationInitialization(cesiumContainerId, viewer)
{

    require(['Navigation'], function (navigation) {
        navigation.initialize(document.getElementById(cesiumContainerId), viewer);
        viewer.navigation = navigation;
    });

}
;

