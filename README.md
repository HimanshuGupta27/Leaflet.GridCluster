Leaflet.GridCluster
===================

This small plug-in allows you to cluster your point-shaped data in Leaflet using a grid-based cell structure.
It can be useful for thematic mapping purposes, or to declutter icons.

So far, this project is in an early stage, no professional testing has been done. It works with the inbuilt web Mercator and Plate Carree projections (although the latter looks nicer).

***Demo: http://andy-kay.github.io/Leaflet.GridCluster***


***Developed and tested for Leaflet 0.7***


### How to Use It


Initialize the cluster and add it to the map.

```javascript
var gridCluster = L.gridCluster({
                gridSize : 0.015
            }).addTo(map);

gridCluster.addLayers(yourGeoJSONLayer);
```

and done ;)

### Defaults

By the default, the following options are set / enabled:
* ***showGrid*** : Draws the grid structure on the map
* ***showCells*** : Color coded cells will be used as cluster symbolizations
* ***showCentroids*** : Label the amount of features contained by each cluster
*

 

### Customize It!
At the moment, the following options can be adjusted:

* ***gridSize***: the initial size of the cells
* ***zoomFactor*** : the factor by which the grid will be adjusted on zoom (default: 2)
* ***minFeaturesToCluster***: any amount of features below this will be represented using the default symbolization (e.g. marker)
* ***colors*** : an array with color definitions (RGB, HEX will do). Amount of colors will determine the amount of classes
* ***maxZoom*** : until which zoom level should the clustering be done?
* ***weightedCentroids***: determines the position of the labels within each cell
* ***symbolizationVariable***: 'value' or 'size'. Style the cluster markers using color values or marker size.
* ***cellStyle*** : customize the styling of the cell like that: 
```javascript 
{
            color : 'gray',
            opacity : 0.1,
            fillOpacity : 0.5
        }
```
* ***gridStyle*** : customize the styling of the grid lines like that:
```javascript
{
            color : 'gray',
            weight : 1,
            opactiy : 0.8
        }
```
### Methods

* ***increaseGridSize()*** / ***decreaseGridSize()***: to manually adjust the gridsize by the factor set in the options
* ***toggleOption(option)***: to turn on/off the following options: ***grid***, ***cell***, ***centroids***, ***labelPos***, ***symbolization***


### Adding and Removing features
addLayer, removeLayer and clearAll are implemented so far.

### Bulk adding features
addLayers can add multiple features at once. removeFeatures is not implemented yet


### License

Leaflet.GridCluster is free software and may be redistributed under the MIT-LICENSE.
