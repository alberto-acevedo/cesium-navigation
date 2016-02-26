requirejs.config({
    useStrict: true,
    inlineText: true,
//    stubModules : ['text'],
    baseUrl: 'Source',
    skipModuleInsertion: false,
    paths: {
        'require-less': '../bower_components/require-less',

        'almond': '../bower_components/almond/almond',

        'KnockoutES5': '../bower_components/knockout-es5/dist/knockout-es5.min',
        'knockout': '../bower_components/knockout/dist/knockout',
        'Hammer': '../bower_components/hammerjs/hammer.min',
        'leaflet': '../bower_components/leaflet/dist/leaflet',
        'markdown-it': '../bower_components/markdown-it/dist/markdown-it.min',
        'markdown-it-sanitizer': '../bower_components/markdown-it-sanitizer/dist/markdown-it-sanitizer.min',

        'Cesium': 'empty:'
//        'text' : 'ThirdParty/requirejs-2.1.22/text'
    },
    onBuildWrite: function (moduleName, path, contents) {
        // replace all require-less calls to dummy ones because they are only needed for the optimization
        return contents.replace(/('|")require-less\/less.*?\1/g, '$1dummy/require-less/less/dummy$1');
    },
    // those are only needed during optimization where an css is generated, so no need to pack them but only the wrapped output
    excludeShallow: ['require-less/less', 'require-less/normalize', 'require-less/lessc', 'require-less/less-builder', 'require-less/lessc-server']
});
