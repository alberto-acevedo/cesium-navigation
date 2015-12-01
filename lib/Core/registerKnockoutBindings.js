'use strict';

/*global require*/
////var knockout = require('terriajs-cesium/Source/ThirdParty/knockout');
//var SvgPathBindingHandler = require('terriajs-cesium/Source/Widgets/SvgPathBindingHandler');

////var knockoutMarkdownBinding = require('./KnockoutMarkdownBinding');
////var knockoutHammerBinding = require('./KnockoutHammerBinding');
define('registerKnockoutBindings', ['Knockout', 'KnockoutMarkdownBinding', 'KnockoutHammerBinding' ], function (Knockout, KnockoutMarkdownBinding, KnockoutHammerBinding)
{
var registerKnockoutBindings = function() {
    Cesium.SvgPathBindingHandler.register(Knockout);
    KnockoutMarkdownBinding.register(Knockout);
    KnockoutHammerBinding.register(Knockout);

    Knockout.bindingHandlers.embeddedComponent = {
        init : function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            var component = Knockout.unwrap(valueAccessor());
            component.show(element);
            return { controlsDescendantBindings: true };
        },
        update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
        }
    };
};
return registerKnockoutBindings;
});

