import {MapProvider} from '../source/providers/MapProvider';
import {CancelablePromise} from '../source/utils/CancelablePromise';
import {XHRUtils} from '../source/utils/XHRUtils';
import {MVTLoader} from '@loaders.gl/mvt';

export class LocalHeightTerrainProvider extends MapProvider 
{
	public local: boolean

	public terrarium: boolean

	public constructor(local = false) 
	{
		super();
		this.name = 'local';
		this.local = local;
		this.terrarium = !local;
		this.minZoom = 0;
		this.maxZoom = 10;
	}

	public async fetchTerrainTile(zoom, x, y): Promise<ArrayBuffer>
	{
		const result = await Promise.all([
			new CancelablePromise<ArrayBuffer>((resolve, reject) => 
			{
				XHRUtils.getRaw(
					`http://localhost:8084/tilesets/tin/${zoom}/${x}/${Math.pow(2, zoom) - y - 1}.terrain`,
					async(data) => 
					{
						resolve(data);
					},
					reject
				);
			})
		]);
		return result[0] as any;
	}

	public async fetchTile(zoom: number, x: number, y: number): Promise<any>
	{
		if (this.zoomDelta <= 0 || this.minLevelForZoomDelta > zoom) 
		{
			return this.fetchTerrainTile(zoom, x, y);
		}
		else 
		{
		// 	const tiles = tilesToZoom([[x, y, zoom]], zoom + this.zoomDelta).sort(
		// 		(valA, valB) => 
		// 		{
		// 			return valA[1] - valB[1] || 
		// 		valA[0] - valB[0];
		// 		},
		// 	);
		// 	const images = (await Promise.all(tiles.map((t) => {return this.fetchImage(t[2], t[0], t[1]);}))) as HTMLImageElement[]; 
		// 	const width = images[0].width * Math.floor(this.zoomDelta * 2);
		// 	const fullWidth = width / Math.sqrt(images.length);
		// 	const canvas = new OffscreenCanvas(width, width);
		// 	var context = canvas.getContext('2d');
		// 	let tileY = tiles[0][1];
		// 	let ix = 0;
		// 	let iy = 0;
		// 	//   context.strokeStyle = '#FF0000';
		// 	images.forEach((image, index) => 
		// 	{
		// 		if (tileY !==tiles[index][1]) 
		// 		{
		// 			tileY = tiles[index][1];
		// 			ix = 0;
		// 			iy += 1;
		// 		}
		// 		context.drawImage(image, ix * fullWidth, iy * fullWidth, fullWidth, fullWidth);
		// 		// context.strokeRect(ix * fullWidth, iy * fullWidth, fullWidth, fullWidth);
		// 		// context.fillStyle = '#000000';
		// 		// context.textAlign = 'center';
		// 		// context.textBaseline = 'middle';
		// 		// context.font = 'bold ' + fullWidth * 0.1 + 'px arial';
		// 		// context.fillText('(' + zoom + ')', ix * fullWidth + fullWidth / 2, iy * fullWidth + fullWidth * 0.4);
		// 		// context.fillText('(' + x + ', ' + y + ')', ix * fullWidth + fullWidth / 2, iy * fullWidth + fullWidth * 0.6);
		// 		ix += 1;
		// 	});
		// 	return canvas;
		}
	}

	public async fetchPeaks(zoom, x, y): Promise<any[]>
	{
		return new CancelablePromise((resolve, reject) => 
		{
			const url = this.local? `http://127.0.0.1:8080/data/full/${zoom}/${x}/${y}.pbf` : `https://api.maptiler.com/tiles/v3/${zoom}/${x}/${y}.pbf?key=V7KGiDaKQBCWTYsgsmxh`;
			try 
			{
				XHRUtils.getRaw(
					url,
					async(data) => 
					{
						let result = await MVTLoader.parse(
							data,
							{
								mvt: {
									tileIndex: {
										x: x,
										y: y,
										z: zoom
									},
									coordinates: 'wgs84',
									layers: ['mountain_peak']
								}
							}
						);
						resolve(result);
					}
				);
			}
			catch (err) 
			{
				reject(err);
			}
		});
	}
}
