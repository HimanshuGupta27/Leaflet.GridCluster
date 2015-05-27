describe('addLayer adding a single marker', function () {
	var map, div;
	beforeEach(function () {
		div = document.createElement('div');
		div.style.width = '200px';
		div.style.height = '200px';
		document.body.appendChild(div);

		map = L.map(div, { maxZoom: 18 });

		map.fitBounds(new L.LatLngBounds([
			[1, 1],
			[2, 2]
		]));
	});
	afterEach(function () {
		document.body.removeChild(div);
	});


	it('appears when added to the group before the group is added to the map', function () {

		var group = new L.gridCluster();
		var marker = new L.Marker([1.5, 1.5]);

		group.addLayer(marker);
		map.addLayer(group);
		

		expect(marker).not.toBe(undefined);
		expect(Object.keys(group._needsClustering).length).toBe(1);
	});
	it('appears when added to the group after the group is added to the map', function () {

		var group = new L.gridCluster();
		var marker = new L.Marker([1.5, 1.5]);

		map.addLayer(group);
		group.addLayer(marker);
		group._cluster();

		
		expect(Object.keys(group._clusters).length).toBe(1);
	});

});