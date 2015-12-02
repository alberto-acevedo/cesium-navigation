var amdOptimize = require('amd-optimize');
var concat = require('gulp-concat');
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var less = require('gulp-less');
var minifyCSS = require('gulp-minify-css');
var notify = require('gulp-notify');
var gutil = require('gulp-util');

gulp.task('bundle', function ()
{
    return gulp.src('**/*.js')
            .pipe(amdOptimize('NavigationStartup',
                    {
                        paths: {
                            'Knockout': 'lib/ThirdParty/knockout-3.3.0',
                            'knockoutes5': 'lib/ThirdParty/knockout-es5.min',
                            'Hammer': 'lib/ThirdParty/hammerjs',
                            'sanitizeCaja': 'lib/ThirdParty/sanitizer-bundle',
                            'MarkdownIt': 'lib/ThirdParty/markdown-it.min',
                            'text': 'lib/ThirdParty/text',
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
                        }

                    }
            ))
            .pipe(concat('cesium-navigation.js'))
            .pipe(uglify())
            .pipe(gulp.dest('dist'));
});

gulp.task('less', function ()
{
    gulp.src('lib/Styles/less/CesiumNavigation.less')
            .pipe(less({compress: true}).on('error', gutil.log))
            .pipe(minifyCSS({keepBreaks: false}))
            .pipe(gulp.dest('dist'))
            .pipe(notify('Less Compiled, compressed and moinified'));
});

gulp.task('default', ['less', 'bundle'], function () {
    notify('bundled, and less tasks executed!');
});
