import {MapProvider} from '../source/providers/MapProvider';
import {CancelablePromise} from '../source/utils/CancelablePromise';
import {XHRUtils} from '../source/utils/XHRUtils';
import {MVTLoader} from '@loaders.gl/mvt';


// const locahostServer = 'dev.tileserver.local'
// export const locahostServer = '192.168.43.121:8080'
// export const locahostServer = '192.168.1.23:8080'
export const locahostServer = '0.0.0.0:8080'
export class LocalHeightProvider extends MapProvider 
{
	public local: boolean

	public terrarium: boolean

	public constructor(local = false) 
	{
		super();
		this.name = 'local';
		this.local = local;
		this.terrarium = !local;
		this.minZoom = 5;
		this.maxZoom = local ? 12 : 15;
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
				if (this.local) 
				{
					image.src = `http://${locahostServer}/data/elevation_25m/${zoom}/${x}/${y}.webp`;
				}
				else 
				{
					image.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
				}
			})
		]);
		return result[0] as any;
	}

	public async fetchPeaks(zoom, x, y): Promise<any[]>
	{
		return new CancelablePromise((resolve, reject) => 
		{
			const url = this.local? `http://${locahostServer}/data/full/${zoom}/${x}/${y}.pbf` : `https://api.maptiler.com/tiles/v3/${zoom}/${x}/${y}.pbf?key=V7KGiDaKQBCWTYsgsmxh`;
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
