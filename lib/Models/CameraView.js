'use strict';

/*global require*/
//var defined = require('terriajs-cesium/Source/Core/defined');
//var defineProperties = require('terriajs-cesium/Source/Core/defineProperties');
//var DeveloperError = require('terriajs-cesium/Source/Core/DeveloperError');

/**
 * Holds a camera view parameters, expressed as a rectangular extent and/or as a camera position, direction,
 * and up vector.
 *
 * @alias CameraView
 * @constructor
 */
define('CameraView', [], function ()
{
var CameraView = function(rectangle, position, direction, up) {
    if (!Cesium.defined(rectangle)) {
        console.log('rectangle is required.');
    }
    if (Cesium.defined(position) || Cesium.defined(direction) || Cesium.defined(up)) {
        if (!Cesium.defined(position) || !Cesium.defined(direction) || !Cesium.defined(up)) {
            console.log('If any of position, direction, or up are specified, all must be specified.');
        }
    }

    this._rectangle = rectangle;
    this._position = position;
    this._direction = direction;
    this._up = up;
};

Cesium.defineProperties(CameraView.prototype, {
    /**
     * Gets the rectangular extent of the view.  If {@link CameraView#position}, {@link CameraView#direction},
     * and {@link CameraView#up} are specified, this property will be ignored for viewers that support those parameters
     * (e.g. Cesium).  This property must always be supplied, however, for the benefit of viewers that do not understand
     * these parameters (e.g. Leaflet).
     * @type {Rectangle}
     */
    
    rectangle: {
        get: function() {
            return this._rectangle;
        }
    },

    /**
     * Gets the position of the camera in the Earth-centered Fixed frame.
     * @type {Cartesian3}
     */
    position: {
        get: function() {
            return this._position;
        }
    },

    /**
     * Gets the look direction of the camera in the Earth-centered Fixed frame.
     * @type {Cartesian3}
     */
    direction: {
        get: function() {
            return this._direction;
        }
    },

    /**
     * Gets the up vector direction of the camera in the Earth-centered Fixed frame.
     * @type {Cartesian3}
     */
    up: {
        get: function() {
            return this._up;
        }
    }
});

return CameraView;
});
