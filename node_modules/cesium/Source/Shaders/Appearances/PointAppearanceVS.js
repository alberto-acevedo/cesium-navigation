//This file is automatically rebuilt by the Cesium build process.
/*global define*/
define(function() {
    "use strict";
    return "attribute vec3 position3DHigh;\n\
attribute vec3 position3DLow;\n\
attribute vec3 color;\n\
\n\
uniform float pointSize;\n\
\n\
varying vec3 v_positionEC;\n\
varying vec3 v_color;\n\
\n\
void main() \n\
{\n\
    v_color = color;\n\
    gl_Position = czm_modelViewProjectionRelativeToEye * czm_computePosition();\n\
    gl_PointSize = pointSize;\n\
}\n\
";
});