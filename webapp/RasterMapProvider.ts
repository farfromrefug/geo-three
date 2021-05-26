import {OpenStreetMapsProvider} from '../source/providers/OpenStreetMapsProvider';

export default class RasterMapProvider extends OpenStreetMapsProvider 
{
	public constructor()
	{
		super('https://a.tile.openstreetmap.fr/osmfr');
		// super('http://localhost:8080/styles/basic');
	}

	public fetchImage(zoom: number, x: number, y: number) {
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
