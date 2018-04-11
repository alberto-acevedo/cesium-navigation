/*global require*/
define([
    './UserInterfaceControl'
], function(
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
    var NavigationControl = function(terria) {
        UserInterfaceControl.apply(this, arguments);
    };

    NavigationControl.prototype = Object.create(UserInterfaceControl.prototype);

    return NavigationControl;
});
