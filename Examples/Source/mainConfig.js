requirejs.config({
    baseUrl: '.',
    paths: {
        // IMPORTANT: this path has to be set because
        //  viewerCesiumNavigationMixin uses 'Cesium/...' for dependencies
        Cesium: "../node_modules/cesium/Build/Cesium/Cesium",
        viewerCesiumNavigationMixin: "../dist/amd/viewerCesiumNavigationMixin"
    },
    shim: {
        "Cesium": {
            exports: "Cesium",
//            deps: [
//                "require-css!../../node_modules/cesium/Build/Cesium/Widgets/widgets.css"
//            ]
        }
    }
});