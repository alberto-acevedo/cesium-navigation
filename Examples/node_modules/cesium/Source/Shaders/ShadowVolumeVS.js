//This file is automatically rebuilt by the Cesium build process.
/*global define*/
define(function() {
    'use strict';
    return "attribute vec3 position3DHigh;\n\
attribute vec3 position3DLow;\n\
attribute vec4 color;\n\
\n\
// emulated noperspective\n\
varying float v_WindowZ;\n\
varying vec4 v_color;\n\
\n\
vec4 depthClampFarPlane(vec4 vertexInClipCoordinates)\n\
{\n\
    v_WindowZ = (0.5 * (vertexInClipCoordinates.z / vertexInClipCoordinates.w) + 0.5) * vertexInClipCoordinates.w;\n\
    vertexInClipCoordinates.z = min(vertexInClipCoordinates.z, vertexInClipCoordinates.w);\n\
    return vertexInClipCoordinates;\n\
}\n\
\n\
void main()\n\
{\n\
    v_color = color;\n\
    \n\
    vec4 position = czm_computePosition();\n\
    gl_Position = depthClampFarPlane(czm_modelViewProjectionRelativeToEye * position);\n\
}\n\
";
});