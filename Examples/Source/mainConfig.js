requirejs.config({
    baseUrl: '.',
    paths: {
        // IMPORTANT: this path has to be set because
        //  viewerCesiumNavigationMixin uses 'Cesium/...' for dependencies
        Cesium: "../node_modules/cesium/Source",
        viewerCesiumNavigationMixin: "../dist/amd/viewerCesiumNavigationMixin.min"
    }
});