/*global require*/
define([
    'Cesium/Core/defined',
    'Cesium/Core/Ray',
    'Cesium/Core/IntersectionTests',
    'Cesium/Core/Cartesian3',
    'Cesium/Scene/SceneMode',
    'ViewModels/NavigationControl',
    'Core/Utils'
], function (
    defined,
    Ray,
    IntersectionTests,
    Cartesian3,
    SceneMode,
    NavigationControl,
    Utils) {
    'use strict';

    /**
     * The model for a zoom in control in the navigation control tool bar
     *
     * @alias ZoomOutNavigationControl
     * @constructor
     * @abstract
     *
     * @param {Terria} terria The Terria instance.
     * @param {boolean} zoomIn is used for zooming in (true) or out (false)
     */
    var ZoomNavigationControl = function (terria, zoomIn) {
        NavigationControl.apply(this, arguments);

        /**
         * Gets or sets the name of the control which is set as the control's title.
         * This property is observable.
         * @type {String}
         */
        this.name = 'Zoom ' + (zoomIn ? 'In' : 'Out');

        /**
         * Gets or sets the text to be displayed in the nav control. Controls that
         * have text do not display the svgIcon.
         * This property is observable.
         * @type {String}
         */
        this.text = zoomIn ? '+' : '-';

        /**
         * Gets or sets the CSS class of the control. This property is observable.
         * @type {String}
         */
        this.cssClass = 'navigation-control-icon-zoom-' + (zoomIn ? 'in' : 'out');

        this.relativeAmount = 2;

        if(zoomIn) {
            // this ensures that zooming in is the inverse of zooming out and vice versa
            // e.g. the camera position remains when zooming in and out
            this.relativeAmount = 1 / this.relativeAmount;
        }
    };

    ZoomNavigationControl.prototype.relativeAmount = 1;

    ZoomNavigationControl.prototype = Object.create(NavigationControl.prototype);

    /**
     * When implemented in a derived class, performs an action when the user clicks
     * on this control
     * @abstract
     * @protected
     */
    ZoomNavigationControl.prototype.activate = function () {
        this.zoom(this.relativeAmount);
    };

    var cartesian3Scratch = new Cartesian3();

    ZoomNavigationControl.prototype.zoom = function (relativeAmount) {
        // this.terria.analytics.logEvent('navigation', 'click', 'zoomIn');

        this.isActive = true;

        if (defined(this.terria)) {
            var scene = this.terria.scene;
            var camera = scene.camera;
            // var orientation;

            if(scene.mode == SceneMode.MORPHING) {
                return;
            }

            var focusWC = Utils.getCameraFocus(scene, false);

            if (!defined(focusWC)) {
                // Camera direction is not pointing at the globe, so use the ellipsoid horizon point as
                // the focal point.
                var ray = new Ray(camera.worldToCameraCoordinatesPoint(scene.globe.ellipsoid.cartographicToCartesian(camera.positionCartographic)), camera.directionWC);
                focusWC = IntersectionTests.grazingAltitudeLocation(ray, scene.globe.ellipsoid);

            //     orientation = {
            //         heading: camera.heading,
            //         pitch: camera.pitch,
            //         roll: camera.roll
            //     };
            // } else {
            //     orientation = {
            //         direction: camera.direction,
            //         up: camera.up
            //     };
            }

            var direction = Cartesian3.subtract(camera.position, focusWC, cartesian3Scratch);
            var movementVector = Cartesian3.multiplyByScalar(direction, relativeAmount, direction);
            var endPosition = Cartesian3.add(focusWC, movementVector, focusWC);

            // sometimes flyTo does not work (wrong position) so just set the position without any animation
            camera.position = endPosition;

            //     camera.flyTo({
            //         destination: endPosition,
            //         orientation: orientation,
            //         duration: 1,
            //         convert: false
            //     });
            // }
        }

        // this.terria.notifyRepaintRequired();
        this.isActive = false;
    };

    return ZoomNavigationControl;
});
