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

/**
 * A map provider is a object that handles the access to map tiles of a specific service.
 *
 * They contain the access configuration and are responsible for handling the map theme size etc.
 *
 * MapProvider should be used as a base for all the providers.
 */
export abstract class MapProvider 
{
	/**
	 * Name of the map provider
	 */
	public name: string = '';

	/**
	 * Minimum tile level.
	 */
	public minZoom: number = 0;

	/**
	 * Maximum tile level.
	 */
	public maxZoom: number = 20;

	/**
	 * Allowed overMaxZoom.
	 */
	public maxOverZoom: number = 0;

	/**
	 * factor used to create bitmaps based on higher zooms
	 */
	public zoomDelta: number = 0;


	/**
	 * Map bounds.
	 */
	public bounds: number[] = [];

	/**
	 * Map center point.
	 */
	public center: number[] = [];

	/**
	 * Get a tile for the x, y, zoom based on the provider configuration.
	 *
	 * The tile should be returned as a image object, compatible with canvas context 2D drawImage() and with webgl texImage2D() method.
	 *
	 * @param zoom - Zoom level.
	 * @param x - Tile x.
	 * @param y - Tile y.
	 * @returns Promise with the image obtained for the tile ready to use.
	 */
	public fetchImage(zoom: number, x: number, y: number): Promise<any> 
	{
		return null;
	}

	/**
	 * Get map meta data from server if supported.
	 *
	 * Usually map server have API method to retrieve TileJSON metadata.
	 */
	public getMetaData(): void {}

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
