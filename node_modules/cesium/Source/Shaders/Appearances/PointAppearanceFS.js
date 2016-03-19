//This file is automatically rebuilt by the Cesium build process.
/*global define*/
define(function() {
    "use strict";
    return "uniform vec4 highlightColor;\n\
\n\
varying vec3 v_color;\n\
\n\
void main()\n\
{\n\
    gl_FragColor = vec4(v_color * highlightColor.rgb, highlightColor.a);\n\
}\n\
";
});