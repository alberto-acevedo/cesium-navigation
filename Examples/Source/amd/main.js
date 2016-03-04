require([
    'Cesium/Core/Cartesian3',
    'Cesium/Core/Math',
    'Cesium/Core/Transforms',
    'Cesium/Widgets/Viewer/Viewer',
    'viewerCesiumNavigationMixin'
], function(
    Cartesian3,
    CesiumMath,
    Transforms,
    Viewer,
    viewerCesiumNavigationMixin) {
    "use strict";

    var cesiumViewer = new Viewer('cesiumContainer');

    // extend our view by the cesium navigaton mixin
    cesiumViewer.extend(viewerCesiumNavigationMixin, {});
    // you can access the cesium navigation by cesiumViewer.cesiumNavigation or cesiumViewer.cesiumWidget.cesiumNavigation

    // just some entities
    function createModel(url, longitude, latitude, height) {
        var position = Cartesian3.fromDegrees(longitude, latitude, height);
        var heading = CesiumMath.toRadians(135);
        var pitch = 0;
        var roll = 0;
        var orientation = Transforms.headingPitchRollQuaternion(position, heading, pitch, roll);

        var entity = cesiumViewer.entities.add({
            name : url,
            description: 'It is supposed to have a useful desciption here<br />but instead there is just a placeholder to get a larger info box',
            position : position,
            orientation : orientation,
            model : {
                uri : url,
                minimumPixelSize : 96
            }
        });
    }

    createModel('models/Cesium_Air.glb', -100, 44, 10000.0);
    createModel('models/Cesium_Ground.glb', -122, 45, 0);
});