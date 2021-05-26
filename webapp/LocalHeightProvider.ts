import {MapProvider} from '../source/providers/MapProvider';
import {CancelablePromise} from '../source/utils/CancelablePromise';
import {XHRUtils} from '../source/utils/XHRUtils';
import {MVTLoader} from '@loaders.gl/mvt';

export class LocalHeightProvider extends MapProvider 
{
	public constructor() 
	{
		super();
		this.name = 'local';
		this.minZoom = 5;
		this.maxZoom = 11;
	}

	public async fetchTile(zoom, x, y): Promise<HTMLImageElement>
	{
		
		const result = await Promise.all([
			new CancelablePromise<HTMLImageElement>((resolve, reject) => 
			{
				const image = document.createElement('img');
				image.onload = () => { return resolve(image); };
				image.onerror = () => { return resolve(null); };
				image.crossOrigin = 'Anonymous';
				// image.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
				image.src = `http://localhost:8080/data/elevation/${zoom}/${x}/${y}.png`;
			})
		]);
		return result[0] as any;
	}

	public async fetchPeaks(zoom, x, y): Promise<any[]>
	{
		return new CancelablePromise((resolve, reject) => 
		{
			// const url = `https://api.maptiler.com/tiles/v3/${zoom}/${x}/${y}.pbf?key=V7KGiDaKQBCWTYsgsmxh`;
			const url = `http://127.0.0.1:8080/data/full/${zoom}/${x}/${y}.pbf`;
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
