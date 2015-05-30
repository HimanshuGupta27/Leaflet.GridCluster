/*
Leaflet.gridcluster
https://github.com/andy-kay/Leaflet.GridCluster
(c) 2014-2015, Andreas Kiefer

*/
L.GridCluster = L.FeatureGroup.extend({

	options : {
		gridSize : 1,
		zoomFactor : 2,
		minFeaturesToCluster : 2,
		colors : ['rgb(255,255,204)', 'rgb(255,237,160)', 'rgb(254,217,118)', 'rgb(254,178,76)', 'rgb(253,141,60)', 'rgb(252,78,42)', 'rgb(227,26,28)', 'rgb(177,0,38)'],
		maxZoom : 16,
		showGrid : true,
		showCells : true,
		showCentroids : true,
		weightedCentroids : false,
		symbolizationVariable : 'value',
		zoomToCell : true,
		cellStyle : {
			color : 'gray',
			opacity : 0.1,
			fillOpacity : 0.5
		},
		gridStyle : {
			color : 'gray',
			weight : 1,
			opactiy : 0.8
		},
		symbolStyle : {
			color : '#013ADF',
			fillColor: '#013ADF',
			fillOpacity : 0.8,
			radius: 30
		}

	},
	initialize : function(options) {
		L.Util.setOptions(this, options);

		if (this.options.gridSize) {
			this._currentGridSize = this.options.gridSize;

		}
		this._clusterCellsGroup = L.featureGroup();

		

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
		this._minSymbolSize = 20;

	},
	addLayers : function(layers) {
		layers.eachLayer(function(l) {
			this.addLayer(l);
		}, this);

		this._cluster();

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

		this._needsClustering.push(layer);
		this._originalFeaturesGroup.addLayer(layer);
		
		

		return this;
	},
	clearAll : function() {
		this._originalFeaturesGroup.clearLayers();
		this._clusters = {};

		if (!this._map) {
			this._needsClustering = [];
			delete this._clusters;

		}
		//Remove all the visible layers
		this._clusterCellsGroup.clearLayers();
		this._nonPointGroup.clearLayers();

	},
	removeLayer : function(layer) {
		this._originalFeaturesGroup.removeLayer(layer);

		this._needsClustering = [];

		this._cluster();

		return this;

	},

	hasLayer : function(layer) {
		if (!layer) {
			return false;
		}

		var i,
		    anArray = this._needsClustering;

		for ( i = anArray.length - 1; i >= 0; i--) {
			if (anArray[i] === layer) {
				return true;
			}
		}

		return !!(layer.__parent && layer.__parent._group === this) || this._nonPointGroup.hasLayer(layer);
	},

	setGridSize : function(interval) {
		this._currentGridSize = interval;

		if (this.options.showGrid) {
			this._drawGrid();
		}
		this._cluster();

	},
	toggleOption : function(attribute, value) {

		var state;

		switch (attribute) {
		case "grid":

			state = this.options.showGrid;

			if (state) {
				this.options.showGrid = false;
				this._gridLinesGroup.clearLayers();
			} else {
				this.options.showGrid = true;
				this._drawGrid();
			}

			break;

		case "cells":

			state = this.options.showCells;
			this.options.showCells = state ? false : true;
			break;

		case "centroids":

			state = this.options.showCentroids;
			this.options.showCentroids = state ? false : true;
			break;

		case "labelPos":
			state = this.options.weightedCentroids;
			this.options.weightedCentroids = state ? false : true;
			break;

		case "symbolization":
			state = this.options.symbolizationVariable;
			if (!value) {
				if (state === "value") {
					this.options.symbolizationVariable = "size";
				}
				if (state === "size") {
					this.options.symbolizationVariable = "value";
				}
			}
			else{
				this.options.symbolizationVariable = value;
			}
			break;
		}

		this._cluster();

	},
	onAdd : function(map) {
		this._map = map;
		this._minZoom = map.getMinZoom();
		this._maxZoom = map.getMaxZoom();
		this._currentBounds = this._getVisibleBounds();

		this._clusterCellsGroup.onAdd(map);
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

	},
	_cluster : function() {

		if (!this._originalFeaturesGroup.getLayers().length) {
			console.log("no points");
			return;
		} else {

			this._clusterCellsGroup.clearLayers();

			this._clusters = {};
			this._maxFeatures = 0;
			this._classDefinitions = [];
			this._maxSymbolSize = 0;

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

				// FIRST CHECK, IF LAT IS WITHIN BOUNDS

				if (point.lat >= b.south && point.lat <= b.north) {

					// CHECK, IF LNG IS WITHIN BOUNDS
					if (point.lng >= b.west && point.lng <= b.east) {

						if (zoomLevel < this.options.maxZoom) {

							var centerLat,
							    centerLng;
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
								
								// var latlngA = polygon.getBounds().getNorthWest();
								// var latlngB = polygon.getBounds().getNorthEast();
								var latlngA = polygon.getBounds().getNorthWest();
								var latlngB = polygon.getBounds().getNorthEast();
								
								if(this._maxSymbolSize === 0){
									//calculate the max. size of the symbol and add a buffer so they don't touch each other
									this._maxSymbolSize = Math.ceil( this._map.latLngToLayerPoint(latlngA).distanceTo(map.latLngToLayerPoint(latlngB)) )* 0.9;
									console.log(this._maxSymbolSize);
								}
							} else {
								clusters[clusterID].count += 1;
								var count = clusters[clusterID].count;
								clusters[clusterID].features.push(feature);

								// for statistics
								this._maxFeatures = count > this._maxFeatures ? count : this._maxFeatures;
								this._minFeatures = count < this._minFeatures ? count : this._minFeatures;

							}

						}
					}
					// }
				}
			}, this);

			if (zoomLevel < this.options.maxZoom) {

				this._classDefinitions = this._calculateClasses(this.options.colors.length);

				for (var prop in this._clusters) {

					var count = this._clusters[prop].count;
					var cluster = this._clusters[prop];
					var color;

					if (this.options.showCells && cluster.count > this.options.minFeaturesToCluster) {
						this._clusterCellsGroup.addLayer(cluster.polygon);

						color = this._getColor(count);

						var style = this.options.cellStyle;
						style.fillColor = color;

						cluster.polygon.setStyle(style).bindPopup(count + " Features");

					}
					if (cluster.count === 1 && this.options.minFeaturesToCluster >= 1) {
						this._clusterCellsGroup.addLayer(cluster.features[0]);
					}

					if (this.options.showCentroids && cluster.count > this.options.minFeaturesToCluster) {

						var iconSize = 40;
						var iconClass = "cluster-symbols";
						var clusterLatLng = cluster.latLng;

						if (this.options.weightedCentroids) {

							clusterLatLng = this._calculateCenter(cluster.features);
						}


						if (!this.options.showCells) {
							
							iconClass +=" noCells";

							cluster.symbol = this._createSymbol(cluster, clusterLatLng);

							this._clusterCellsGroup.addLayer(cluster.symbol);
							

						}

						var myIcon = new L.DivIcon({
							html : "<div><span>" + count + "</span></div>",
							className : iconClass ,
							iconSize : this.options.showCells === true ? new L.Point(30, 30) : new L.Point(iconSize, iconSize)
						});

						var marker = L.marker(clusterLatLng, {
							icon : myIcon
						});

						this._clusterCellsGroup.addLayer(marker);
					}
				}
			} else {

				this._originalFeaturesGroup.addTo(map);

			}
		}

	},
	_createSymbol : function(cluster, position) {

		var symbol;
		var count = cluster.features.length;

		symbol = L.circleMarker(position, this.options.symbolStyle);
		
		
		
		if (this.options.symbolizationVariable === "size" || this.options.symbolizationVariable === 'valuesize') {
			
			var min = this._minSymbolSize;
			var max = this._maxSymbolSize;
			var numClasses = this.options.colors.length;
			
			this._symbolSizeDefinitions = this._calculateClasses(numClasses, min, max);
			
			var proportionalSize = this._getClassValue(count, this._classDefinitions, this._symbolSizeDefinitions) / 2;
						
			symbol.setRadius(proportionalSize);

		}
		if (this.options.symbolizationVariable === "value" || this.options.symbolizationVariable === 'valuesize') {

			var color = this._getColor(count);
			symbol.setStyle({
				fillColor : color,
				fillOpacity : 0.8,
				color : color
			});
		}

		return symbol;
	},
	// calculate the arithmetic mean center of the cluster point. (SUM lats|lngs)/count
	_calculateCenter : function(features) {

		var wLat = 0,
		    wLng = 0;
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
		var numClasses = colors.length;

		var classDef = this._classDefinitions || this._calculateClasses(numClasses);
		var color = " green",
		    j = 0;

		for (j; j < numClasses; j++) {

			if (count <= classDef[j]) {
				color = colors[j];
				break;
			} else {
				color = colors[numClasses - 1];
			}

		}

		return color;

	},
	_calculateClasses : function(numClasses, min, max) {

		var classDefinitions = [];

		var minFeatures = min || this._minFeatures,
		    maxFeatures = max || this._maxFeatures;

		var diff = maxFeatures - minFeatures;

		var step = diff / numClasses;

		classDefinitions[0] = minFeatures;
		var i = 1;
		for (i; i < numClasses; i++) {
			classDefinitions[i] = Math.round(minFeatures + (step * i));

		}

		classDefinitions[numClasses] = maxFeatures;

		return classDefinitions;

	},
	_getClassValue : function(count, classDef, representDef) {

		var numClasses = classDef.length;
		
		var value;
		var j = 0;

		for (j; j < numClasses; j++) {

			if (count <= classDef[j]) {
				value = representDef[j];
				break;
			} else {
				value = representDef[numClasses - 1];
			}

		}
		
		return value;

	},
	increaseGridSize : function() {
		var zoomFactor = this.options.zoomFactor;

		if (!this._newGridSize) {
			this._newGridSize = this._currentGridSize;
		}
		this._newGridSize *= zoomFactor;

		this._gridSizeChanged();

	},
	decreaseGridSize : function() {
		var zoomFactor = this.options.zoomFactor;

		if (!this._newGridSize) {
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
		var j = b.south;

		for (i; i < b.east; i += gridSize) {

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

L.gridCluster = function(options) {
	return new L.GridCluster(options);
};
