require([
    'Cesium/Cesium',
    'Source/SpirographPositionProperty_amd',
    'viewerCesiumNavigationMixin'
], function(
    Cesium,
    SpirographPositionProperty,
    viewerCesiumNavigationMixin) {
    "use strict";

    var cesiumViewer = new Cesium.Viewer('cesiumContainer');

    // extend our view by the cesium navigation mixin
    cesiumViewer.extend(viewerCesiumNavigationMixin, {});
    // you can access the cesium navigation by cesiumViewer.cesiumNavigation or cesiumViewer.cesiumWidget.cesiumNavigation

    function createSpirographEntity(url, longitude, latitude, height, radiusMedian, radiusSubCircle,
                                    durationMedianCircle, durationSubCircle) {
        var centerPosition = Cesium.Cartographic.fromDegrees(longitude, latitude, height);
        var spirographPositionProperty = new SpirographPositionProperty(centerPosition, radiusMedian, radiusSubCircle,
            durationMedianCircle, durationSubCircle, cesiumViewer.scene.globe.ellipsoid);

        cesiumViewer.entities.add({
            name : url,
            description: 'It is supposed to have a useful desciption here<br />but instead there is just a placeholder to get a larger info box',
            position: spirographPositionProperty,
            orientation: new Cesium.VelocityOrientationProperty(spirographPositionProperty, cesiumViewer.scene.globe.ellipsoid),
            model : {
                uri : url,
                minimumPixelSize : 96
            }
        });
    }

    createSpirographEntity('models/Cesium_Air.glb', -100, 44, 10000.0,
        Cesium.Math.toRadians(0.5), Cesium.Math.toRadians(2), 1e6, 2e5);
    createSpirographEntity('models/Cesium_Ground.glb', -122, 45, 0,
        Cesium.Math.toRadians(0.1), Cesium.Math.toRadians(1), 5e6, 7e5);
});