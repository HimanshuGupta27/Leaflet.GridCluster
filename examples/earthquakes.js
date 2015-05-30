var geojsonMarkerOptions = {
	radius : 5,
	fillColor : "#FF8000",
	color : "#000",
	weight : 1,
	opacity : 1,
	fillOpacity : 0.8
};

var map = L.map('map', {

	crs : L.CRS.Simple,
	maxZoom : 4
});
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png?{foo}', {
	foo : 'bar'
}).addTo(map);

var baseMap = L.geoJson(countries, {
	style : {
		color : '#000',
		weight : 0.5,
		opacity : 1,
		fillColor : '#fff',
		fillOpacity : 1
	}
}).addTo(map);

map.setView([17, 17], 2);

var gridCluster = L.gridCluster({
	gridSize : 16,
	showGrid : true,
	showCentroids : true,
	showCells : true,
	weightedCentroids : true,
	symbolizationVariable : "size",
	colors : ['rgb(254,229,217)', 'rgb(252,146,114)', 'rgb(251,106,74)', 'rgb(239,59,44)', 'rgb(203,24,29)', 'rgb(153,0,13)'] //reds
}).addTo(map);

//

var sortedYears = [];
var layers = [];

var thematicLayer = L.layerGroup();
thematicLayer.addTo(map);

var thematicLayers = [];

var years = [2010, 2011, 2012, 2013, 2014];

/*
 *
 * Load the incidents and sort into an array them according to the year
 *
 *
 */

$.getJSON("./earthquakes.json", function(data) {

	$.each(data.features, function(key, val) {

		var feature = val;
		var date = new window.Date(feature.properties.time);
		var year = date.getFullYear();
		feature.properties.year = year;

		var foundYear = $.inArray(year, years);

		if (foundYear !== -1) {
			if ( typeof sortedYears[foundYear] === "undefined") {

				sortedYears[foundYear] = {
					features : [feature]
				};

			} else {
				sortedYears[foundYear].features.push(feature);
			}
		}

	});
	for (var i = 0; i < sortedYears.length; i++) {

		var filteredLayer = L.geoJson(sortedYears[i], {

			pointToLayer : function(feature, latlng) {
				return L.circleMarker(latlng, geojsonMarkerOptions);
			}
		});

		thematicLayers.push(filteredLayer);

	}

	// gridCluster.addLayers(thematicLayer);

	$("#startAnimation").click(function() {
		$("#startAnimation").addClass("disabled");
		var len = 5;

		(function doProcess(i) {
			if (i) {

				var time = 2010 + len - i;
				reloadThematicLayer(len - i);

				$("#label").text("Year: " + time);

				/* do something with arr[len - i] */
				setTimeout(function() {
					doProcess(--i);
				}, 2000);
				if (i === 1) {
					console.log("END");
					$("#startAnimation").removeClass("disabled");
				}
			}

		})(len);

	});

	function reloadThematicLayer(year) {

		gridCluster.clearAll();
		thematicLayer.clearLayers();

		gridCluster.addLayers(thematicLayers[year]);
		// thematicLayer.addLayer(thematicLayers[year]);

	}

}).fail(function(jqxhr, textStatus, error) {
	var err = textStatus + ", " + error;
	console.log("Request Failed: " + err);
});

$("#currentGridSize").text(gridCluster._currentGridSize);
$("#increase").click(function() {
	gridCluster.increaseGridSize();
	$("#currentGridSize").text(gridCluster._currentGridSize);
});

$("#decrease").click(function() {
	gridCluster.decreaseGridSize();
	$("#currentGridSize").text(gridCluster._currentGridSize);
});
$("#showGrid").click(function() {
	gridCluster.toggleOption("grid");
});
$("#showCells").click(function() {
	gridCluster.toggleOption("cells");
});
$("#showCentroids").click(function() {
	gridCluster.toggleOption("centroids");
});
$("#labelPosition").click(function() {
	gridCluster.toggleOption("labelPos");
});
$("#symbolization").change(function() {
	var value = this.value;
	gridCluster.toggleOption("symbolization", value);
}); 