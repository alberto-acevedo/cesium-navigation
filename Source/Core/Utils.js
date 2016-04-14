/*global require*/
define([
    'Cesium/Core/defined',
    'Cesium/Core/Ray',
    'Cesium/Core/Cartesian3',
    'Cesium/Core/Cartographic',
    'Cesium/Scene/SceneMode'
], function (
    defined,
    Ray,
    Cartesian3,
    Cartographic,
    SceneMode) {
    'use strict';

    var Utils = {};

    var unprojectedScratch = new Cartographic();
    var rayScratch = new Ray();

    /**
     * gets the focus point of the camera
     * @param {Scene} scene The scene
     * @param {boolean} inWorldCoordinates true to get the focus in world coordinates, otherwise get it in projection-specific map coordinates, in meters.
     * @param {Cartesian3} [result] The object in which the result will be stored.
     * @return {Cartesian3} The modified result parameter, a new instance if none was provided or undefined if there is no focus point.
     */
    Utils.getCameraFocus = function (scene, inWorldCoordinates, result) {
        if(scene.mode == SceneMode.MORPHING) {
            return undefined;
        }

        if(!defined(result)) {
            result = new Cartesian3();
        }

        var camera = scene.camera;

        rayScratch.origin = camera.positionWC;
        rayScratch.direction = camera.directionWC;
        var center = scene.globe.pick(rayScratch, scene, result);

        if (!defined(center)) {
            return undefined;
        }

        if(scene.mode == SceneMode.SCENE2D || scene.mode == SceneMode.COLUMBUS_VIEW) {
            center = camera.worldToCameraCoordinatesPoint(center, result);

            if(inWorldCoordinates) {
                center = scene.globe.ellipsoid.cartographicToCartesian(scene.mapProjection.unproject(center, unprojectedScratch), result);
            }
        } else {
            if(!inWorldCoordinates) {
                center = camera.worldToCameraCoordinatesPoint(center, result);
            }
        }

        return center;
    };

    return Utils;
});
