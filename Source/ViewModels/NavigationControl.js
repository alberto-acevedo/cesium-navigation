/*global require*/
define([
    'Cesium/Core/defined',
    'Cesium/Core/Ray',
    'Cesium/Core/IntersectionTests',
    'Cesium/Core/Ellipsoid',
    'ViewModels/UserInterfaceControl'
], function (
    defined,
    Ray,
    IntersectionTests,
    Ellipsoid,
    UserInterfaceControl) {
    'use strict';

    /**
     * The view-model for a control in the navigation control tool bar
     *
     * @alias NavigationControl
     * @constructor
     * @abstract
     *
     * @param {Terria} terria The Terria instance.
     */
    var NavigationControl = function (terria) {
        UserInterfaceControl.apply(this, arguments);
    };

    NavigationControl.prototype = Object.create(UserInterfaceControl.prototype);

    NavigationControl.prototype.getCameraFocus = function (scene) {
        var ray = new Ray(scene.camera.positionWC, scene.camera.directionWC);
        var intersections = IntersectionTests.rayEllipsoid(ray, scene.globe.ellipsoid);
        if (defined(intersections)) {
            return Ray.getPoint(ray, intersections.start);
        } else {
            // Camera direction is not pointing at the globe, so use the ellipsoid horizon point as
            // the focal point.
            return IntersectionTests.grazingAltitudeLocation(ray, scene.globe.ellipsoid);
        }
    };
    return NavigationControl;
});
