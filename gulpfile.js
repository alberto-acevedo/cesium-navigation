var amdOptimize = require('amd-optimize');
var concat = require('gulp-concat');
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var less = require('gulp-less');
var minifyCSS = require('gulp-minify-css');
var notify = require('gulp-notify');
var gutil = require('gulp-util');
var clean = require('gulp-clean');
var watch = require('gulp-watch');
var ername = require('gulp-rename');
var eventStream = require('event-stream');
var order = require('gulp-order');
var gignore = require('gulp-ignore');
var gjshint = require('gulp-jshint');
var gfilter = require('gulp-filter');

gulp.task('bundle-minified',['less'],  function ()
{
    var filter = gfilter(["*", "!gulpfile.js", "!NavigationStartup.js", "!lib/ThirdParty/almond.js", "!node_modules/*.*"]);
    var almond = gulp.src("lib/ThirdParty/almond.js");
    var cesiumNavigation = gulp.src('**/*.js')
           // .pipe(jshint())
            .pipe(filter)
            .pipe(amdOptimize('NavigationStartup',
            {
                configFile: "NavigationStartup.js",
                baseUrl: '../cesium-navigation/'
            }
    ));
    return eventStream.merge(almond, cesiumNavigation)
    .pipe(concat("cesium-navigation.js"))
    .pipe(uglify())
    .pipe(gulp.dest("dist/cesium-navigation"))
    .pipe(notify('eventStream merging build completed'));
});

gulp.task('bundle-unminified',['less'],  function ()
{
    var filter = gfilter(["*", "!gulpfile.js", "!NavigationStartup.js", "!lib/ThirdParty/almond.js", "!node_modules/*.*"]);
    var almond = gulp.src("lib/ThirdParty/almond.js");
    var cesiumNavigation = gulp.src('**/*.js')
           // .pipe(jshint())
            .pipe(filter)
            .pipe(amdOptimize('NavigationStartup',
            {
                configFile: "NavigationStartup.js",
                baseUrl: '../cesium-navigation/'
            }
    ));
    return eventStream.merge(almond, cesiumNavigation)
    .pipe(concat("cesium-navigation.js"))
   // .pipe(uglify())
    .pipe(gulp.dest("dist/cesium-navigation"))
    .pipe(notify('eventStream merging build completed'));
});


gulp.task('less', ['cleanDist'], function ()
{
    gulp.src('lib/Styles/less/cesium-navigation.less')
            .pipe(less({compress: true}).on('error', gutil.log))
            .pipe(minifyCSS({keepBreaks: false}))
            .pipe(gulp.dest('dist/cesium-navigation'))
            .pipe(notify('Less Compiled, compressed and moinified'));
});

gulp.task('cleanDist', function () {
    return gulp.src('dist', {read: false})
            .pipe(clean({force: true}));
});
gulp.task('default', ['cleanDist', 'less', 'bundle-minified'], function () {
    });

    
gulp.task('release-unminified', ['cleanDist', 'less', 'bundle-unminified'], function () {
});
