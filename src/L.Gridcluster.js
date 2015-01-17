/*
 * L.GridCluster extends L.FeatureGroup 
 */

L.GridOverlayLayer = L.LayerGroup.extend({

    options : {
        gridSize : 1,
        zoomFactor : 2,
        minFeaturesToCluster: 1,
        colors : ['rgb(255,255,204)', 'rgb(255,237,160)', 'rgb(254,217,118)', 'rgb(254,178,76)', 'rgb(253,141,60)', 'rgb(252,78,42)', 'rgb(227,26,28)', 'rgb(177,0,38)'],
        maxZoom : 16,
        showGrid : true,
        showCells : true,
        showCentroids : true,
        weightedCentroids: false,
        cellStyle : {
            color : 'gray',
            opacity : 0.1,

            fillOpacity : 0.5

        },
        gridStyle : {
            color : 'gray',
            weight : 1,
            opactiy : 0.8

        }

    },
    initialize : function(options) {
        L.Util.setOptions(this, options);

        if (this.options.gridSize) {
            this._currentGridSize = this.options.gridSize;

        }
        this._featureGroup = L.featureGroup();
        this._gridLinesGroup = L.featureGroup();
        this._nonPointGroup = L.featureGroup();
        this._needsClustering = [];
        this._originalFeaturesGroup = L.featureGroup();
        this._clusters = {};

        this._worldBounds = {//TODO find the correct values
            north : 90, //85.0511287798,
            west : -180,
            east : 180,
            south : -90
        };

        this._maxFeatures = 0;

    },
    addLayers : function(layers) {

        console.log(layers);

        layers.eachLayer(function(l) {
            this.addLayer(l);
        }, this);

    },
    addLayer : function(layer) {

        if ( layer instanceof L.LayerGroup) {
            var array = [];
            for (var i in layer._layers) {
                array.push(layer._layers[i]);
            }
            return this.addLayers(array);
        }

        //Don't cluster non point data
        if (!layer.getLatLng) {
            this._nonPointGroup.addLayer(layer);
            return this;
        }

        if (!this._map) {
            this._needsClustering.push(layer);
            return this;
        }

        // if (this.hasLayer(layer)) {
            // return this;
        // }

        this._needsClustering.push(layer);
        this._originalFeaturesGroup.addLayer(layer);

        return this;
    },
    clearAll : function() {
        this._originalFeaturesGroup.clearLayers();
        // this._featureGroup.clearLayers();
        // this._needsClustering = [];
        // this._clusters = [];

        if (!this._map) {
            this._needsClustering = [];
            delete this._clusters;

        }
        //Remove all the visible layers
        this._featureGroup.clearLayers();
        this._nonPointGroup.clearLayers();

    },
    removeLayer : function(layer) {
        this._originalFeaturesGroup.removeLayer(layer);

        this._needsClustering = [];

        // var layers = this._featureGroup.getLayers();
        //
        // for (var i = 0; i < layers.length; i++) {
        //
        // this._needsClustering.push(layers[i]);
        // }
        this._cluster();

        return this;

    },
    //Returns true if the given layer is in this MarkerClusterGroup
    hasLayer : function(layer) {
        if (!layer) {
            return false;
        }

        var i, anArray = this._needsClustering;

        for ( i = anArray.length - 1; i >= 0; i--) {
            if (anArray[i] === layer) {
                return true;
            }
        }

        // anArray = this._needsRemoving;
        // for (i = anArray.length - 1; i >= 0; i--) {
        // if (anArray[i] === layer) {
        // return false;
        // }
        // }

        return !!(layer.__parent && layer.__parent._group === this) || this._nonPointGroup.hasLayer(layer);
    },
    //Overrides LayerGroup.eachLayer
    // eachLayer : function(method, context) {
    // var markers = this._needsClustering.slice(), i;
    //
    // for ( i = markers.length - 1; i >= 0; i--) {
    // method.call(context, markers[i]);
    // }
    //
    // this._nonPointGroup.eachLayer(method, context);
    // },
    setGridSize : function(interval) {
        this._currentGridSize = interval;

        if (this.options.showGrid) {
            this._drawGrid();
        }
        this._cluster();

    },
    toggleOption : function(attribute) {
        switch (attribute) {
        case "grid":

            var state = this.options.showGrid;
            if (state) {
                this.options.showGrid = false;
                this._gridLinesGroup.clearLayers();
            } else {
                this.options.showGrid = true;
                this._drawGrid();
            }

            break;

        case "cells":

            var state = this.options.showCells;
            this.options.showCells = state ? false : true;
            break;

        case "centroids":

            var state = this.options.showCentroids;
            this.options.showCentroids = state ? false : true;
            break;
        }
        this._cluster();

    },
    onAdd : function(map) {
        this._map = map;
        this._minZoom = map.getMinZoom();
        this._maxZoom = map.getMaxZoom();
        this._currentBounds = this._getVisibleBounds();

        this._featureGroup.onAdd(map);
        this._gridLinesGroup.onAdd(map);
        this._nonPointGroup.onAdd(map);

        this._map.on('zoomend', this._zoomEnd, this);
        this._map.on('moveend', this._moveEnd, this);

        this._cluster();

    },
    _zoomEnd : function(e) {
        if (!this._map) {//May have been removed from the map by a zoomEnd handler
            console.log("map not found");
            return;
        }

        this._oldZoom = this._currentZoom || this._map._zoom;
        this._currentZoom = this._map._zoom;
        this._newGridSize = this._currentGridSize;

        if (this._currentZoom > this._minZoom) {

            if (this._currentZoom > this._oldZoom) {

                this.decreaseGridSize();
            }

            if (this._currentZoom < this._oldZoom) {

                this.increaseGridSize();
            }

        }
    },
    _moveEnd : function() {
        if (!this._map) {//May have been removed from the map by a zoomEnd handler

            return;
        }
        if (this.options.showGrid) {

            this._drawGrid("moveend");
        }

        this._cluster();
        // this._mergeSplitClusters();

    },
    _cluster : function() {

        // if (!this._needsClustering.length) {
        if (!this._originalFeaturesGroup.getLayers().length) {
            console.log("no points");
            return;
        } else {

            this._featureGroup.clearLayers();

            this._clusters = {};
            this._maxFeatures = 0;

            var zoomLevel = this._map._zoom;
            var gridSize = this._currentGridSize;

            var halfGridSize = gridSize / 2;
            var fg = this._originalFeaturesGroup;

            this._map.removeLayer(fg);

            var len = fg.getLayers().length;

            this._minFeatures = len;

            var that = this;

            var b = this._getVisibleBounds();
            var i = 0;

            fg.eachLayer(function(layer) {

                var point = layer.getLatLng();
                var feature = layer;

                // for (i; i < len; i++) {
                //
                // var point = this._needsClustering[i].getLatLng();

                // var feature = this._needsClustering[i];

                // FIRST CHECK, IF LAT IS WITHIN BOUNDS

                if (point.lat >= b.south && point.lat <= b.north) {

                    // CHECK, IF LNG IS WITHIN BOUNDS
                    if (point.lng >= b.west && point.lng <= b.east) {

                        if (zoomLevel < this.options.maxZoom) {

                            var centerLat, centerLng;
                            var k = b.west - gridSize;
                            for (k; k < (b.east + gridSize); k += gridSize) {
                                if (point.lng <= k) {
                                    centerLng = k;
                                    break;
                                }

                            }
                            var j = b.south - gridSize;
                            for (j; j < (b.north + gridSize); j += gridSize) {
                                if (point.lat <= j) {
                                    centerLat = j;
                                    break;
                                }

                            }
                            // console.log(centerLat + " | " + centerLng);

                            var clusterID = centerLat + "," + centerLng;

                            var clusters = this._clusters;

                            if ( typeof clusters[clusterID] == "undefined") {

                                var centroidLat = centerLat - (halfGridSize);
                                var centroidLng = centerLng - (halfGridSize);
                                var centroid = L.latLng(centroidLat, centroidLng);

                                var polygon = L.polygon([[centerLat, centerLng - gridSize], [centerLat, centerLng], [centerLat - gridSize, centerLng], [centerLat - gridSize, centerLng - gridSize]], {
                                    color : "green",
                                    weight : 1
                                });

                                clusters[clusterID] = {
                                    count : 1,
                                    color : "green",
                                    latLng : centroid,
                                    features : [feature],
                                    polygon : polygon
                                };
                            } else {
                                clusters[clusterID]["count"] += 1;
                                var count = clusters[clusterID]["count"];
                                clusters[clusterID].features.push(feature);

                                // for statistics TODO
                                this._maxFeatures = count > this._maxFeatures ? count : this._maxFeatures;
                                this._minFeatures = count < this._minFeatures ? count : this._minFeatures;

                            }

                        }
                    }
                    // }
                }
            }, this);

            if (zoomLevel < this.options.maxZoom) {

                for (prop in this._clusters) {

                    var count = this._clusters[prop].count;
                    var cluster = this._clusters[prop];

                    if (this.options.showCells && cluster.count > this.options.minFeaturesToCluster) {
                        this._featureGroup.addLayer(cluster.polygon);

                        var color = this._getColor(count);

                        var style = this.options.cellStyle;
                        style.fillColor = color;
                        // style.color = color;

                        cluster.polygon.setStyle(style).bindPopup(count + " Features");

                    }
                    if (cluster.count ===  1 && this.options.minFeaturesToCluster >= 1) {
                        this._featureGroup.addLayer(cluster.features[0]);
                    }

                    // pointSize *= pointSize;

                    if (this.options.showCentroids && cluster.count > this.options.minFeaturesToCluster) {

                        var pointSize = 50;
                        var color = this._getColor(count);
                        var clusterLatLng = cluster.latLng;
                        
                        if (this.options.weightedCentroids) {

                                clusterLatLng = this._calculateCentre(cluster.features);
                                

                            }
                        
                        

                        var i = 10, className;

                        if (!this.options.showCells) {
                            className = i > count ? "small" : 100 > count ? "medium" : "large";
                            
                        } else {

                            className += " cells";
                        }

                        var myIcon = new L.DivIcon({
                            html : "<div><span>" + count + "</span></div>",
                            className : "marker-cluster marker-cluster-" + className,
                            iconSize : this.options.showCells === true ? new L.Point(30, 30) : new L.Point(40, 40)
                        });

                        var marker = L.marker(clusterLatLng, {
                            icon : myIcon
                        });

                        // var marker = L.circleMarker(cluster.latLng,  {
                        // color : color,
                        // fillColor : color,
                        // fillOpacity : 0.8,
                        // radius:10,
                        // title : count
                        //
                        // }).bindPopup(count);
                        this._featureGroup.addLayer(marker);
                    }
                }
            } else {

                this._originalFeaturesGroup.addTo(map);

            }
        }

    },
    // calculate the arithmetic mean center of the cluster point. (SUM lats|lngs)/count
    _calculateCentre : function(features) {

        var wLat = 0, wLng = 0;
        var ln = features.length;
        for (var i = 0; i < ln; i++) {
            var ll = features[i].getLatLng();
            wLat += ll.lat;
            wLng += ll.lng;

        }

        wLat = wLat / ln;
        wLng = wLng / ln;

        var latLng = [wLat, wLng];

        return latLng;
    },

    _getColor : function(count) {

        var colors = this.options.colors;

        var minFeatures = this._minFeatures, maxFeatures = this._maxFeatures;

        var diff = maxFeatures - minFeatures;
        var step = diff / colors.length;

        var class_def = [];
        var num_class = colors.length;

        class_def[0] = minFeatures;
        for (var i = 1; i < num_class; i++) {
            class_def[i] = Math.round(minFeatures + (step * i));

        }

        class_def[num_class] = maxFeatures;

        var color;

        // for (var i = num_class  ; i >= 0; i--) {
        for (var i = 0; i < num_class; i++) {

            if (count <= class_def[i]) {
                color = colors[i];
                break;
            } else {
                color = colors[num_class - 1];
            }

        }

        // console.log(count + " | " + color);

        return color;

    },
    _calculateClasses : function() {

    },
    increaseGridSize : function() {
        var zoomFactor = this.options.zoomFactor;
        
        if(!this._newGridSize){
            this._newGridSize = this._currentGridSize;
        }
        this._newGridSize *= zoomFactor;

        this._gridSizeChanged();

    },
    decreaseGridSize : function() {
        var zoomFactor = this.options.zoomFactor;
        
        if(!this._newGridSize){
            this._newGridSize = this._currentGridSize;
        }
        
        
        this._newGridSize *= 1 / zoomFactor;
        this._gridSizeChanged();

    },
    _gridSizeChanged : function() {

        this._currentGridSize = this._newGridSize;

        this._cluster();

        if (this.options.showGrid) {
            this._drawGrid();
        }

    },
    _drawGrid : function(caller) {

        console.log(caller + " requested drawGrid");
        // first clear the old grid lines
        this._gridLinesGroup.clearLayers();

        var zoomLevel = this._map._zoom;
        var gridSize = this._currentGridSize;

        var halfGridSize = gridSize / 2;

        var b = this._getVisibleBounds();
        var i = b.west;

        for (i; i < b.east; i += gridSize) {
            var j = b.south;

            var verticals = L.polyline([[b.south, i], [b.north, i]], this.options.gridStyle);
            this._gridLinesGroup.addLayer(verticals);
        }
        for (j; j < b.north; j += gridSize) {
            // if (i >= b.west && i <= b.east && j >= b.south && j <= b.north) {
            // if () {

            var horizontals = L.polyline([[j, b.east], [j, b.west]], this.options.gridStyle);
            this._gridLinesGroup.addLayer(horizontals);

        }

    },
    _getVisibleBounds : function() {

        var bounds = this._map.getBounds();

        bounds.east = bounds.getEast();
        bounds.west = bounds.getWest();
        bounds.north = bounds.getNorth();
        bounds.south = bounds.getSouth();

        bounds.east = bounds.east - (bounds.east % this._currentGridSize) + this._currentGridSize;
        bounds.west = bounds.west - (bounds.west % this._currentGridSize) - this._currentGridSize;
        bounds.north = bounds.north - (bounds.north % this._currentGridSize) + this._currentGridSize;
        bounds.south = bounds.south - (bounds.south % this._currentGridSize) - this._currentGridSize;

        bounds.east = bounds.east <= this._worldBounds.east ? bounds.east : this._worldBounds.east;
        bounds.west = bounds.west >= this._worldBounds.west ? bounds.west : this._worldBounds.west;

        bounds.north = bounds.north <= this._worldBounds.north ? bounds.north : this._worldBounds.north;
        bounds.south = bounds.south >= this._worldBounds.south ? bounds.south : this._worldBounds.south;

        return bounds;

    },
  
});

L.gridOverlayLayer = function(options) {
    return new L.GridOverlayLayer(options);
};
