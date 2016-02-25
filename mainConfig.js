requirejs.config({
    useStrict: true,
    inlineText: true,
//        stubModules : ['text'],
    baseUrl: 'Source',
    skipModuleInsertion: false,
    paths: {
        'css': '../bower_components/require-css/css.min',
        'css-builder': '../bower_components/require-css/css-builder',
//        'normalize': '../bower_components/require-css/normalize',
        'less': '../bower_components/require-less/less',
        'less-builder': '../bower_components/require-less/less-builder',
        'normalize': '../bower_components/require-less/normalize',
//        'lessc': '../bower_components/require-less/lessc',
//        'lessc-server': '../bower_components/require-less/lessc-server',

        'almond': '../bower_components/almond/almond',

        'KnockoutES5': '../bower_components/knockout-es5/dist/knockout-es5.min',
        'knockout': '../bower_components/knockout/dist/knockout',
        'Hammer': '../bower_components/hammerjs/hammer.min',
        'leaflet': '../bower_components/leaflet/dist/leaflet',
        'markdown-it': '../bower_components/markdown-it/dist/markdown-it.min',
        'markdown-it-sanitizer': '../bower_components/markdown-it-sanitizer/dist/markdown-it-sanitizer.min',

        'Cesium': 'empty:'
//            'text' : 'ThirdParty/requirejs-2.1.22/text'
    }
//    map: {
//        '*': {
//            css: '../bower_components/require-css/css',
//            less: '../bower_components/require-less/less'
//        }
//    },
//    packages: [
//        {
//            name: 'css',
//            location: '../bower_components/require-css',
//            main: 'css.min'
//        },
// when using this instead of defining all paths manually then "Uncaught Error: undefined missing less/lessc" occurs
//        {
//            name: 'less',
//            location: '../bower_components/require-less',
//            main: 'less'
//        },
//        {
//            name: "almond",
//            location: '../bower_components/almond',
//            main: "almond"
//        },
//        {
//            name: "KnockoutES5",
//            location: '../bower_components/knockout-es5/dist',
//            main: "knockout-es5.min"
//        },
//        {
//            name: "knockout",
//            location: '../bower_components/knockout/dist',
//            main: "knockout"
//        },
//        {
//            name: "Hammer",
//            location: '../bower_components/hammerjs',
//            main: "hammer.min"
//        },
//        {
//            name: "leaflet",
//            location: '../bower_components/leaflet/dist',
//            main: "leaflet"
//        },
//        {
//            name: "markdown-it",
//            location: '../bower_components/markdown-it/dist',
//            main: "markdown-it.min"
//        },
//        {
//            name: "markdown-it-sanitizer",
//            location: '../bower_components/markdown-it-sanitizer/dist',
//            main: "markdown-it-sanitizer.min"
//        }
//    ]
});
