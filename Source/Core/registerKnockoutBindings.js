/*global require*/
define([
    'Cesium/Widgets/SvgPathBindingHandler',
    'KnockoutES5',
    'Core/KnockoutMarkdownBinding',
    'Core/KnockoutHammerBinding'
], function (
    SvgPathBindingHandler,
    Knockout,
    KnockoutMarkdownBinding,
    KnockoutHammerBinding) {
    'use strict';

    var registerKnockoutBindings = function () {
        SvgPathBindingHandler.register(Knockout);
        KnockoutMarkdownBinding.register(Knockout);
        KnockoutHammerBinding.register(Knockout);

        Knockout.bindingHandlers.embeddedComponent = {
            init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                var component = Knockout.unwrap(valueAccessor());
                component.show(element);
                return { controlsDescendantBindings: true };
            },
            update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            }
        };
    };

    return registerKnockoutBindings;
});

