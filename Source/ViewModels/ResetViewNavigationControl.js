/*global require*/
define([
    'Cesium/Core/defined',
    'Cesium/Scene/Camera',
    'ViewModels/NavigationControl',
    'SvgPaths/svgReset'
], function (
    defined,
    Camera,
    NavigationControl,
    svgReset) {
    'use strict';

    /**
     * The model for a zoom in control in the navigation control tool bar
     *
     * @alias ResetViewNavigationControl
     * @constructor
     * @abstract
     *
     * @param {Terria} terria The Terria instance.
     */
    var ResetViewNavigationControl = function (terria) {
        NavigationControl.apply(this, arguments);

        /**
         * Gets or sets the name of the control which is set as the control's title.
         * This property is observable.
         * @type {String}
         */
        this.name = 'Reset View';

        /**
         * Gets or sets the svg icon of the control.  This property is observable.
         * @type {Object}
         */
        this.svgIcon = svgReset;

        /**
         * Gets or sets the height of the svg icon.  This property is observable.
         * @type {Integer}
         */
        this.svgHeight = 15;

        /**
         * Gets or sets the width of the svg icon.  This property is observable.
         * @type {Integer}
         */
        this.svgWidth = 15;

        /**
         * Gets or sets the CSS class of the control. This property is observable.
         * @type {String}
         */
        this.cssClass = "navigation-control-icon-reset";

    };

    ResetViewNavigationControl.prototype = Object.create(NavigationControl.prototype);

    ResetViewNavigationControl.prototype.resetView = function () {
        //this.terria.analytics.logEvent('navigation', 'click', 'reset');

        this.isActive = true;

        var camera = this.terria.scene.camera;

        if(typeof camera.flyHome === "function") {
            camera.flyHome(1);
//        } else if(defined(this.terria.homeButton)) {
//            this.terria.homeButton.viewModel.command();
        } else {
            camera.flyTo({'destination': Camera.DEFAULT_VIEW_RECTANGLE, 'duration': 1});
        }
        this.isActive = false;
    };

    /**
     * When implemented in a derived class, performs an action when the user clicks
     * on this control
     * @abstract
     * @protected
     */
    ResetViewNavigationControl.prototype.activate = function () {
        this.resetView();
    };
    return ResetViewNavigationControl;
});
