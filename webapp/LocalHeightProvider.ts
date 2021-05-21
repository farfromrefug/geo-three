import {MapProvider} from '../source/providers/MapProvider';
import {CancelablePromise} from '../source/utils/CancelablePromise';

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
				image.src = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' +
					zoom +
					'/' +
					x +
					'/' +
					y +
					'.png';
			})
		]);
		return result[0] as any;
	}
}
