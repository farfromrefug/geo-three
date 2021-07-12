import { locahostServer } from 'LocalHeightProvider';
import {OpenStreetMapsProvider} from '../source/providers/OpenStreetMapsProvider';

export default class RasterMapProvider extends OpenStreetMapsProvider 
{
	public constructor(local = false)
	{
		super(local? `http://${locahostServer}/styles/terrain_no_label`: 'https://a.tile.openstreetmap.org');
	}

	public fetchImage(zoom: number, x: number, y: number): Promise<any>
	{
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

}
