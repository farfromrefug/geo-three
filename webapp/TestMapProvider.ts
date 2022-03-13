import {locahostServer} from './LocalHeightProvider';
import {OpenStreetMapsProvider} from '../source/providers/OpenStreetMapsProvider';
import {getSharedImageBitmapLoader, ImageBitmapLoader} from '../source/utils/FetchLoader';

// localURL: `https://${locahostServer}`
export default class TestMapProvider extends OpenStreetMapsProvider 
{
	protected imageBitmapLoader: ImageBitmapLoader;

	public constructor(options: {localURL?: string, flipRasterImages?: boolean, local?: boolean, style?: string} = {} )
	{
		super(options.local && options.localURL ? options.localURL + `/styles/${options.style || 'basic'}/`: 'https://a.tile.openstreetmap.org/');
		this.imageBitmapLoader = getSharedImageBitmapLoader({imageOrientation: options.flipRasterImages ? 'flipY': undefined, fetchOptions: {credentials: 'same-origin'}});
	}

	protected getImageBitmapLoader(): ImageBitmapLoader 
	{
		return this.imageBitmapLoader;
	}
}
