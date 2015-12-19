'use strict';

/*global require*/

////var defined = require('terriajs-cesium/Source/Core/defined');
//var Cartesian3 = require('terriajs-cesium/Source/Core/Cartesian3');

//var inherit = require('../Core/inherit');
//var NavigationControl = require('./NavigationControl');

/**
 * The model for a zoom in control in the navigation control tool bar
 *
 * @alias ZoomOutNavigationControl
 * @constructor
 * @abstract
 *
 * @param {Terria} terria The Terria instance.
 */
 define('ZoomOutNavigationControl', ['inherit', 'NavigationControl'], function (inherit, NavigationControl)
 {

var ZoomOutNavigationControl = function(terria) {
    NavigationControl.call(this, terria);

    /**
     * Gets or sets the name of the control which is set as the control's title.
     * This property is observable.
     * @type {String}
     */
    this.name = 'Zoom Out';

    /**
     * Gets or sets the text to be displayed in the nav control. Controls that
     * have text do not display the svgIcon.
     * This property is observable.
     * @type {String}
     */
    this.text = '–';

    /**
     * Gets or sets the CSS class of the control. This property is observable.
     * @type {String}
     */
    this.cssClass = "navigation-control-icon-zoom-out";

};

inherit(NavigationControl, ZoomOutNavigationControl);

var cartesian3Scratch = new Cesium.Cartesian3();

ZoomOutNavigationControl.prototype.zoomOut = function() {
    //this.terria.analytics.logEvent('navigation', 'click', 'zoomOut');

    this.isActive = true;

    if (Cesium.defined( this.terria.leaflet)) {
         this.terria.leaflet.map.zoomOut(1);
    }

//    if (Cesium.defined( this.terria.cesium)) {
//        var scene =  this.terria.cesium.scene;
//        var camera = scene.camera;
//        var focus = this.getCameraFocus(scene);
//        var direction = Cesium.Cartesian3.subtract(focus, camera.position, cartesian3Scratch);
//        var movementVector = Cesium.Cartesian3.multiplyByScalar(direction, -2.0, cartesian3Scratch);
//        var endPosition = Cesium.Cartesian3.add(camera.position, movementVector, cartesian3Scratch);
//
//        this.flyToPosition(scene, endPosition);
//    }

      if (Cesium.defined(this.terria)) {
        var scene =  this.terria.scene;
        var camera = scene.camera;
        var focus = this.getCameraFocus(scene);
        var direction = Cesium.Cartesian3.subtract(focus, camera.position, cartesian3Scratch);
        var movementVector = Cesium.Cartesian3.multiplyByScalar(direction, -2.0, cartesian3Scratch);
        var endPosition = Cesium.Cartesian3.add(camera.position, movementVector, cartesian3Scratch);

        this.terria.scene.camera.flyTo({'destination': endPosition, 'duration': 1});
    }

    // this.terria.notifyRepaintRequired();
     this.isActive = false;
};

/**
 * When implemented in a derived class, performs an action when the user clicks
 * on this control
 * @abstract
 * @protected
 */
ZoomOutNavigationControl.prototype.activate = function() {
    this.zoomOut();
};
return ZoomOutNavigationControl;
});
