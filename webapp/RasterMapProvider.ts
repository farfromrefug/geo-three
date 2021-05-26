import {OpenStreetMapsProvider} from '../source/providers/OpenStreetMapsProvider';
import {getChildren, pointToTile, tileToBBOX} from '@mapbox/tilebelt';

function zoomTiles(zoomedTiles, zoom) {
	if(zoomedTiles[0][2] === zoom){
	  return zoomedTiles;
	} else if(zoomedTiles[0][2] < zoom){
	  var oneIn = [];
	  zoomedTiles.forEach(function(tile){
		oneIn = oneIn.concat(getChildren(tile));
	  });
	  return zoomTiles(oneIn, zoom);
	} else {
	  var zoomedTiles = zoomedTiles.map(function(tile){
		  const bbox = tileToBBOX(tile)
		  console.log('bbox', tile, zoom, bbox)
		  //[w, s, e, n]
		
		return pointToTile(
			bbox[0] + (bbox[2] - bbox[0])/2,
			bbox[1] + (bbox[3] - bbox[1])/2, zoom);
	  });
	  return zoomedTiles;
	}
  }
function tilesToZoom(tiles, zoom) {
	var newTiles = zoomTiles(tiles, zoom);
	return newTiles;
  
	
  }

export default class RasterMapProvider extends OpenStreetMapsProvider 
{
	public constructor()
	{
		// super('https://a.tile.openstreetmap.fr/osmfr');
		super('http://localhost:8080/styles/basic');
	}

	protected fetchImage(zoom: number, x: number, y: number) {
		return new Promise<HTMLImageElement>((resolve, reject) => 
		{
			const image = document.createElement('img');
			image.onload = function() 
			{
				resolve(image);
			};
			image.onerror = function() 
			{
				reject();
			};
			image.crossOrigin = 'Anonymous';
			image.src = this.address + '/' + zoom + '/' + x + '/' + y + '.' + this.format;
		});
	}

	public async fetchTile(zoom: number, x: number, y: number): Promise<any>
	{
		if (this.zoomDelta <= 0) {
			return this.fetchImage(zoom, x, y);
		} else {
			const tiles = tilesToZoom([[x, y, zoom]], zoom + this.zoomDelta).sort(
				(valA, valB) => 
				valA[1] - valB[1] || 
				valA[0] - valB[0],
			  );
			  const images = (await Promise.all(tiles.map(t=>this.fetchImage(t[2], t[0], t[1])))) as HTMLImageElement[]; 
			  const width = images[0].width * Math.floor(this.zoomDelta * 2);
			  const fullWidth = width / Math.sqrt(images.length);
			  const canvas = document.createElement('canvas');
			  var context = canvas.getContext('2d');
			  context.globalAlpha = 1.0;
			  canvas.width = width;
			  canvas.height = width;
			  let tileY = tiles[0][1];
			  let ix = 0;
			  let iy = 0;
			  images.forEach((image, index)=>{
					if (tileY !==tiles[index][1]) {
						tileY = tiles[index][1]
						ix = 0;
						iy += 1;
					}
					context.drawImage(image, ix * fullWidth, iy * fullWidth, fullWidth, fullWidth);
					ix += 1;
				})
			  return canvas;
		}
	}
}
