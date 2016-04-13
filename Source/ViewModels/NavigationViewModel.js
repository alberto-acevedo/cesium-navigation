/*global define*/
define([
    'Cesium/Core/defined',
    'Cesium/Core/Math',
    'Cesium/Core/getTimestamp',
    'Cesium/Core/EventHelper',
    'Cesium/Core/Transforms',
    'Cesium/Scene/SceneMode',
    'Cesium/Core/Cartesian2',
    'Cesium/Core/Cartesian3',
    'Cesium/Core/Matrix4',
    'KnockoutES5',
    'Core/loadView',
    'ViewModels/ResetViewNavigationControl',
    'ViewModels/ZoomInNavigationControl',
    'ViewModels/ZoomOutNavigationControl',
    'SvgPaths/svgCompassOuterRing',
    'SvgPaths/svgCompassGyro',
    'SvgPaths/svgCompassRotationMarker'
], function (
    defined,
    CesiumMath,
    getTimestamp,
    EventHelper,
    Transforms,
    SceneMode,
    Cartesian2,
    Cartesian3,
    Matrix4,
    Knockout,
    loadView,
    ResetViewNavigationControl,
    ZoomInNavigationControl,
    ZoomOutNavigationControl,
    svgCompassOuterRing,
    svgCompassGyro,
    svgCompassRotationMarker) {
    'use strict';

    var NavigationViewModel = function (options) {

        this.terria = options.terria;
        this.eventHelper = new EventHelper();

        this.controls = options.controls;
        if (!defined(this.controls)) {
            this.controls = [
                new ZoomInNavigationControl(this.terria),
                new ResetViewNavigationControl(this.terria),
                new ZoomOutNavigationControl(this.terria)
            ];
        }

        this.svgCompassOuterRing = svgCompassOuterRing;
        this.svgCompassGyro = svgCompassGyro;
        this.svgCompassRotationMarker = svgCompassRotationMarker;

        this.showCompass = defined(this.terria);
        this.heading = this.showCompass ? this.terria.scene.camera.heading : 0.0;

        this.isOrbiting = false;
        this.orbitCursorAngle = 0;
        this.orbitCursorOpacity = 0.0;
        this.orbitLastTimestamp = 0;
        this.orbitFrame = undefined;
        this.orbitIsLook = false;
        this.orbitMouseMoveFunction = undefined;
        this.orbitMouseUpFunction = undefined;

        this.isRotating = false;
        this.rotateInitialCursorAngle = undefined;
        this.rotateFrame = undefined;
        this.rotateIsLook = false;
        this.rotateMouseMoveFunction = undefined;
        this.rotateMouseUpFunction = undefined;

        this._unsubcribeFromPostRender = undefined;

        Knockout.track(this, ['controls', 'showCompass', 'heading', 'isOrbiting', 'orbitCursorAngle', 'isRotating']);

        var that = this;

        function widgetChange() {
            if (defined(that.terria)) {
                if (that._unsubcribeFromPostRender) {
                    that._unsubcribeFromPostRender();
                    that._unsubcribeFromPostRender = undefined;
                }

                that.showCompass = true;

                that._unsubcribeFromPostRender = that.terria.scene.postRender.addEventListener(function () {
                    that.heading = that.terria.scene.camera.heading;
                });
            } else {
                if (that._unsubcribeFromPostRender) {
                    that._unsubcribeFromPostRender();
                    that._unsubcribeFromPostRender = undefined;
                }
                that.showCompass = false;
            }
        }

        this.eventHelper.add(this.terria.afterWidgetChanged, widgetChange, this);
        //this.terria.afterWidgetChanged.addEventListener(widgetChange);

        widgetChange();
    };


    NavigationViewModel.prototype.destroy = function () {

        this.eventHelper.removeAll();

        //loadView(require('fs').readFileSync(baseURLEmpCesium + 'js-lib/terrajs/lib/Views/Navigation.html', 'utf8'), container, this);

    };

    NavigationViewModel.prototype.show = function (container) {
        var testing = '<div class="compass" title="Drag outer ring: rotate view. ' +
            'Drag inner gyroscope: free orbit.' +
            'Double-click: reset view.' +
            'TIP: You can also free orbit by holding the CTRL key and dragging the map." data-bind="visible: showCompass, event: { mousedown: handleMouseDown, dblclick: handleDoubleClick }">' +
            '<div class="compass-outer-ring-background"></div>' +
            ' <div class="compass-rotation-marker" data-bind="visible: isOrbiting, style: { transform: \'rotate(-\' + orbitCursorAngle + \'rad)\', \'-webkit-transform\': \'rotate(-\' + orbitCursorAngle + \'rad)\', opacity: orbitCursorOpacity }, cesiumSvgPath: { path: svgCompassRotationMarker, width: 145, height: 145 }"></div>' +
            ' <div class="compass-outer-ring" title="Click and drag to rotate the camera" data-bind="style: { transform: \'rotate(-\' + heading + \'rad)\', \'-webkit-transform\': \'rotate(-\' + heading + \'rad)\' }, cesiumSvgPath: { path: svgCompassOuterRing, width: 145, height: 145 }"></div>' +
            ' <div class="compass-gyro-background"></div>' +
            ' <div class="compass-gyro" data-bind="cesiumSvgPath: { path: svgCompassGyro, width: 145, height: 145 }, css: { \'compass-gyro-active\': isOrbiting }"></div>' +
            '</div>' +
            '<div class="navigation-controls">' +
            '<!-- ko foreach: controls -->' +
            '<div data-bind="click: activate, attr: { title: $data.name }, css: $root.isLastControl($data) ? \'navigation-control-last\' : \'navigation-control\' ">' +
            '   <!-- ko if: $data.hasText -->' +
            '   <div data-bind="text: $data.text, css: $data.isActive ?  \'navigation-control-icon-active \' + $data.cssClass : $data.cssClass"></div>' +
            '   <!-- /ko -->' +
            '  <!-- ko ifnot: $data.hasText -->' +
            '  <div data-bind="cesiumSvgPath: { path: $data.svgIcon, width: $data.svgWidth, height: $data.svgHeight }, css: $data.isActive ?  \'navigation-control-icon-active \' + $data.cssClass : $data.cssClass"></div>' +
            '  <!-- /ko -->' +
            ' </div>' +
            ' <!-- /ko -->' +
            '</div>';
        loadView(testing, container, this);
        // loadView(navigatorTemplate, container, this);
        //loadView(require('fs').readFileSync(baseURLEmpCesium + 'js-lib/terrajs/lib/Views/Navigation.html', 'utf8'), container, this);

    };

    /**
     * Adds a control to this toolbar.
     * @param {NavControl} control The control to add.
     */
    NavigationViewModel.prototype.add = function (control) {
        this.controls.push(control);
    };

    /**
     * Removes a control from this toolbar.
     * @param {NavControl} control The control to remove.
     */
    NavigationViewModel.prototype.remove = function (control) {
        this.controls.remove(control);
    };

    /**
     * Checks if the control given is the last control in the control array.
     * @param {NavControl} control The control to remove.
     */
    NavigationViewModel.prototype.isLastControl = function (control) {
        return (control === this.controls[this.controls.length - 1]);
    };

    var vectorScratch = new Cartesian2();

    NavigationViewModel.prototype.handleMouseDown = function (viewModel, e) {
        var scene = this.terria.scene;
        if (scene.mode == SceneMode.MORPHING) {
            return true;
        }

        var compassElement = e.currentTarget;
        var compassRectangle = e.currentTarget.getBoundingClientRect();
        var maxDistance = compassRectangle.width / 2.0;
        var center = new Cartesian2((compassRectangle.right - compassRectangle.left) / 2.0, (compassRectangle.bottom - compassRectangle.top) / 2.0);
        var clickLocation = new Cartesian2(e.clientX - compassRectangle.left, e.clientY - compassRectangle.top);
        var vector = Cartesian2.subtract(clickLocation, center, vectorScratch);
        var distanceFromCenter = Cartesian2.magnitude(vector);

        var distanceFraction = distanceFromCenter / maxDistance;

        var nominalTotalRadius = 145;
        var norminalGyroRadius = 50;

        if (distanceFraction < norminalGyroRadius / nominalTotalRadius) {
            orbit(this, compassElement, vector);
//            return false;
        } else if (distanceFraction < 1.0) {
            rotate(this, compassElement, vector);
//            return false;
        } else {
            return true;
        }
    };

    var oldTransformScratch = new Matrix4();
    var newTransformScratch = new Matrix4();
    var centerScratch = new Cartesian3();
    var windowPositionScratch = new Cartesian2();

    NavigationViewModel.prototype.handleDoubleClick = function (viewModel, e) {
        var scene = this.terria.scene;
        var camera = scene.camera;

        if (scene.mode == SceneMode.MORPHING) {
            return true;
        }

        var windowPosition = windowPositionScratch;
        windowPosition.x = scene.canvas.clientWidth / 2;
        windowPosition.y = scene.canvas.clientHeight / 2;

        var center = camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid, centerScratch);

        if (!defined(center)) {
            // Globe is barely visible, so reset to home view.

            this.controls[1].resetView();
            return;
        }

        var rotateFrame = Transforms.eastNorthUpToFixedFrame(center, scene.globe.ellipsoid);

        var cameraPosition = scene.globe.ellipsoid.cartographicToCartesian(camera.positionCartographic, new Cartesian3());
        var lookVector = Cartesian3.subtract(center, cameraPosition, new Cartesian3());

        var destination = Matrix4.multiplyByPoint(rotateFrame, new Cartesian3(0, 0, Cartesian3.magnitude(lookVector)), new Cartesian3());

        camera.flyTo({
            destination: destination,
            duration: 1.5
        });
    };

    NavigationViewModel.create = function (options) {
        var result = new NavigationViewModel(options);
        result.show(options.container);
        return result;
    };

    function orbit(viewModel, compassElement, cursorVector) {
        // Remove existing event handlers, if any.
        document.removeEventListener('mousemove', viewModel.orbitMouseMoveFunction, false);
        document.removeEventListener('mouseup', viewModel.orbitMouseUpFunction, false);

        if (defined(viewModel.orbitTickFunction)) {
            viewModel.terria.clock.onTick.removeEventListener(viewModel.orbitTickFunction);
        }

        viewModel.orbitMouseMoveFunction = undefined;
        viewModel.orbitMouseUpFunction = undefined;
        viewModel.orbitTickFunction = undefined;

        viewModel.isOrbiting = true;
        viewModel.orbitLastTimestamp = getTimestamp();

        var scene = viewModel.terria.scene;
        var camera = scene.camera;

        var windowPosition = windowPositionScratch;
        windowPosition.x = scene.canvas.clientWidth / 2;
        windowPosition.y = scene.canvas.clientHeight / 2;

        var center = camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid, centerScratch);

        if (!defined(center)) {
            viewModel.orbitFrame = Transforms.eastNorthUpToFixedFrame(camera.positionWC, scene.globe.ellipsoid, newTransformScratch);
            viewModel.orbitIsLook = true;
        } else {
            viewModel.orbitFrame = Transforms.eastNorthUpToFixedFrame(center, scene.globe.ellipsoid, newTransformScratch);
            viewModel.orbitIsLook = false;
        }

        viewModel.orbitTickFunction = function (e) {
            var timestamp = getTimestamp();
            var deltaT = timestamp - viewModel.orbitLastTimestamp;
            var rate = (viewModel.orbitCursorOpacity - 0.5) * 2.5 / 1000;
            var distance = deltaT * rate;

            var angle = viewModel.orbitCursorAngle + CesiumMath.PI_OVER_TWO;
            var x = Math.cos(angle) * distance;
            var y = Math.sin(angle) * distance;

            var oldTransform = Matrix4.clone(camera.transform, oldTransformScratch);

            camera.lookAtTransform(viewModel.orbitFrame);

            // do not look up/down or rotate in 2D mode
            if (scene.mode == SceneMode.SCENE2D) {
                camera.move(new Cartesian3(x, y, 0), Math.max(scene.canvas.clientWidth, scene.canvas.clientHeight) / 100 * camera.positionCartographic.height * distance);
            } else {
                if (viewModel.orbitIsLook) {
                    camera.look(Cartesian3.UNIT_Z, -x);
                    camera.look(camera.right, -y);
                } else {
                    camera.rotateLeft(x);
                    camera.rotateUp(y);
                }
            }

            camera.lookAtTransform(oldTransform);

            // viewModel.terria.cesium.notifyRepaintRequired();

            viewModel.orbitLastTimestamp = timestamp;
        };

        function updateAngleAndOpacity(vector, compassWidth) {
            var angle = Math.atan2(-vector.y, vector.x);
            viewModel.orbitCursorAngle = CesiumMath.zeroToTwoPi(angle - CesiumMath.PI_OVER_TWO);

            var distance = Cartesian2.magnitude(vector);
            var maxDistance = compassWidth / 2.0;
            var distanceFraction = Math.min(distance / maxDistance, 1.0);
            var easedOpacity = 0.5 * distanceFraction * distanceFraction + 0.5;
            viewModel.orbitCursorOpacity = easedOpacity;

            //viewModel.terria.cesium.notifyRepaintRequired();
        }

        viewModel.orbitMouseMoveFunction = function (e) {
            var compassRectangle = compassElement.getBoundingClientRect();
            var center = new Cartesian2((compassRectangle.right - compassRectangle.left) / 2.0, (compassRectangle.bottom - compassRectangle.top) / 2.0);
            var clickLocation = new Cartesian2(e.clientX - compassRectangle.left, e.clientY - compassRectangle.top);
            var vector = Cartesian2.subtract(clickLocation, center, vectorScratch);
            updateAngleAndOpacity(vector, compassRectangle.width);
        };

        viewModel.orbitMouseUpFunction = function (e) {
            // TODO: if mouse didn't move, reset view to looking down, north is up?

            viewModel.isOrbiting = false;
            document.removeEventListener('mousemove', viewModel.orbitMouseMoveFunction, false);
            document.removeEventListener('mouseup', viewModel.orbitMouseUpFunction, false);

            if (defined(viewModel.orbitTickFunction)) {
                viewModel.terria.clock.onTick.removeEventListener(viewModel.orbitTickFunction);
            }

            viewModel.orbitMouseMoveFunction = undefined;
            viewModel.orbitMouseUpFunction = undefined;
            viewModel.orbitTickFunction = undefined;
        };

        document.addEventListener('mousemove', viewModel.orbitMouseMoveFunction, false);
        document.addEventListener('mouseup', viewModel.orbitMouseUpFunction, false);
        viewModel.terria.clock.onTick.addEventListener(viewModel.orbitTickFunction);

        updateAngleAndOpacity(cursorVector, compassElement.getBoundingClientRect().width);
    }

    function rotate(viewModel, compassElement, cursorVector) {
        var scene = viewModel.terria.scene;
        var camera = scene.camera;

        // do not look rotate in 2D mode
        if (scene.mode == SceneMode.SCENE2D) {
            return;
        }

        // Remove existing event handlers, if any.
        document.removeEventListener('mousemove', viewModel.rotateMouseMoveFunction, false);
        document.removeEventListener('mouseup', viewModel.rotateMouseUpFunction, false);

        viewModel.rotateMouseMoveFunction = undefined;
        viewModel.rotateMouseUpFunction = undefined;

        viewModel.isRotating = true;
        viewModel.rotateInitialCursorAngle = Math.atan2(-cursorVector.y, cursorVector.x);

        var windowPosition = windowPositionScratch;
        windowPosition.x = scene.canvas.clientWidth / 2;
        windowPosition.y = scene.canvas.clientHeight / 2;

        var viewCenter = camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid, centerScratch);

        if (!defined(viewCenter)) {
            viewModel.rotateFrame = Transforms.eastNorthUpToFixedFrame(camera.positionWC, scene.globe.ellipsoid, newTransformScratch);
            viewModel.rotateIsLook = true;
        } else {
            viewModel.rotateFrame = Transforms.eastNorthUpToFixedFrame(viewCenter, scene.globe.ellipsoid, newTransformScratch);
            viewModel.rotateIsLook = false;
        }

        var oldTransform = Matrix4.clone(camera.transform, oldTransformScratch);
        camera.lookAtTransform(viewModel.rotateFrame);
        viewModel.rotateInitialCameraAngle = -camera.heading;
        viewModel.rotateInitialCameraDistance = Cartesian3.magnitude(new Cartesian3(camera.position.x, camera.position.y, 0.0));
        camera.lookAtTransform(oldTransform);

        viewModel.rotateMouseMoveFunction = function (e) {
            var compassRectangle = compassElement.getBoundingClientRect();
            var center = new Cartesian2((compassRectangle.right - compassRectangle.left) / 2.0, (compassRectangle.bottom - compassRectangle.top) / 2.0);
            var clickLocation = new Cartesian2(e.clientX - compassRectangle.left, e.clientY - compassRectangle.top);
            var vector = Cartesian2.subtract(clickLocation, center, vectorScratch);
            var angle = Math.atan2(-vector.y, vector.x);

            var angleDifference = angle - viewModel.rotateInitialCursorAngle;
            var newCameraAngle = CesiumMath.zeroToTwoPi(viewModel.rotateInitialCameraAngle - angleDifference);

            var camera = viewModel.terria.scene.camera;

            var oldTransform = Matrix4.clone(camera.transform, oldTransformScratch);
            camera.lookAtTransform(viewModel.rotateFrame);
            var currentCameraAngle = -camera.heading;
            camera.rotateRight(newCameraAngle - currentCameraAngle);
            camera.lookAtTransform(oldTransform);

            // viewModel.terria.cesium.notifyRepaintRequired();
        };

        viewModel.rotateMouseUpFunction = function (e) {
            viewModel.isRotating = false;
            document.removeEventListener('mousemove', viewModel.rotateMouseMoveFunction, false);
            document.removeEventListener('mouseup', viewModel.rotateMouseUpFunction, false);

            viewModel.rotateMouseMoveFunction = undefined;
            viewModel.rotateMouseUpFunction = undefined;
        };

        document.addEventListener('mousemove', viewModel.rotateMouseMoveFunction, false);
        document.addEventListener('mouseup', viewModel.rotateMouseUpFunction, false);
    }

    return NavigationViewModel;
});
