define('Navigation', ['Knockout', 'NavigationViewModel', 'registerKnockoutBindings', 'DistanceLegendViewModel', 'CameraView'], function (Knockout, NavigationViewModel, registerKnockoutBindings, DistanceLegendViewModel, CameraView)
{


    return {
         distanceLegendViewModel : undefined,
         navigationViewModel : undefined,
         navigationDiv : undefined,
         distanceLegendDiv : undefined,
         terria : undefined,
        initialize: function (mapContainer, terria) {
            this.terria = terria;
            this.terria.afterViewerChanged = new Cesium.Event();
		    this.terria.beforeViewerChanged = new Cesium.Event();
		    this.terria.currentViewer = viewer;
            this.navigationDiv = document.createElement('div');
            this.navigationDiv.setAttribute("id", "navigationDiv");
            this.navigationDiv.style.display = "inline-block";
            this.navigationDiv.style.margin = "2px";
            this.navigationDiv.style.position = "absolute";
            this.navigationDiv.style.right = "0px";
            this.navigationDiv.style.height = "45px";
            this.navigationDiv.style.top = "34px";
            this.navigationDiv.style.zIndex = "300";
            //navigationDiv.style.border = "3px solid #8AC007";


            this.distanceLegendDiv = document.createElement('div');
//            this.navigationDiv.setAttribute("id", "distanceLegendDiv");
//            this.navigationDiv.style.display = "inline-block";
//            this.navigationDiv.style.margin = "2px";
//            this.navigationDiv.style.position = "absolute";
//            this.navigationDiv.style.right = "57px";
//            this.navigationDiv.style.top = "30px";
//            this.navigationDiv.style.zIndex = "300";

            //var mapContainer = document.getElementById(emp.map.container.get());
            mapContainer.appendChild(this.navigationDiv);
            mapContainer.appendChild(this.distanceLegendDiv);

            this.terria.homeView = new CameraView(Cesium.Rectangle.MAX_VALUE);



// Register custom Knockout.js bindings.  If you're not using the TerriaJS user interface, you can remove this.
            registerKnockoutBindings();



            this.distanceLegendViewModel = DistanceLegendViewModel.create({
                container: this.distanceLegendDiv,
                terria: this.terria,
                mapElement: mapContainer
            });

            // Create the navigation controls.
            this.navigationViewModel = NavigationViewModel.create({
                container: this.navigationDiv,
                terria: this.terria
            });
            //return this;
        },
        destroy: function ()
        {
            if (this.navigationViewModel)
            this.navigationViewModel.destroy();
            if (this.distanceLegendViewModel)
            this.distanceLegendViewModel.destroy();
            //this.navigationDiv = document.getElementById('navigationDiv');
            if (this.navigationDiv)
            this.navigationDiv.parentNode.removeChild(this.navigationDiv);
            this.navigationDiv = undefined;
            //var distanceLegendDiv = document.getElementById('distanceLegendDiv');
            if (this.distanceLegendDiv)
            this.distanceLegendDiv.parentNode.removeChild(this.distanceLegendDiv);
            this.distanceLegendDiv = undefined;
            if (this.terria)
            this.terria.homeView =  undefined;
        }
    };
}
);

//module.exports = Navigation;


