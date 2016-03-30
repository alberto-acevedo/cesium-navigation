requirejs.config({
    baseUrl: '.',
    paths: {
        // IMPORTANT: this path has to be set because
        //  viewerCesiumNavigationMixin uses 'Cesium/...' for dependencies
        Cesium: "empty:",
        viewerCesiumNavigationMixin: "../dist/amd/viewerCesiumNavigationMixin.min"
    }
});