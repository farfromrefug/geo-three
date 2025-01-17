import {CancelablePromise} from '../source/utils/CancelablePromise';
import {MVTLoader} from '@loaders.gl/mvt';
import {getSharedFetchLoader, getSharedImageBitmapLoader, ImageBitmapLoader} from '../source/utils/FetchLoader';
import RasterMapProvider from '../source/providers/RasterMapProvider';

const fetchLoader = getSharedFetchLoader({fetchOptions: {credentials: 'same-origin'}});
const imageBitmapLoader = getSharedImageBitmapLoader({
	imageOrientation: 'flipY',
	fetchOptions: {credentials: 'same-origin'}
});

export const locahostServer = '127.0.0.1';
// export const locahostServer = '192.168.1.51';
// `https://${this.localURL}/data/elevation_25m/${zoom}/${x}/${y}.webp`
export class LocalHeightProvider extends RasterMapProvider 
{
	public local: boolean;

	public localURL: string;

	public terrarium: boolean;

	public constructor(options: {localURL?: string, local?: boolean, heightMaxZoom?: number, heightMinZoom?: number}) 
	{
		super();
		this.name = 'local';
		this.local = options.local;
		this.localURL = options.localURL;
		console.log('LocalHeightProvider', options);
		this.minZoom = options.heightMinZoom || 5;
		this.maxZoom = options.heightMaxZoom || 15;
	}

	public buildURL(zoom, x, y): string 
	{
		if (this.local && this.localURL) 
		{
			return `${this.localURL}/data/elevation_25m/${zoom}/${x}/${y}.webp`;
		}
		else 
		{
			return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
		}
	}

	protected buildPeaksURL(zoom, x, y): string 
	{
		if (this.local && this.localURL) 
		{
			return `${this.localURL}/data/full/${zoom}/${x}/${y}.pbf`;
		}
		else 
		{
			return `https://api.maptiler.com/tiles/v3/${zoom}/${x}/${y}.pbf?key=V7KGiDaKQBCWTYsgsmxh`;
		}
	}

	protected getImageBitmapLoader(): ImageBitmapLoader 
	{
		return imageBitmapLoader;
	}

	public async fetchPeaks(zoom, x, y): Promise<any[]>
	{
		const url = this.buildPeaksURL(zoom, x, y);

		const data = await fetchLoader.load(url);
		return MVTLoader.parse(
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
		
	}

	public cancelTile(zoom: number, x: number, y: number): void
	{
		super.cancelTile(zoom, x, y);
		const peaksurl = this.buildPeaksURL(zoom, x, y);
		fetchLoader.cancel(peaksurl);
	}
}
