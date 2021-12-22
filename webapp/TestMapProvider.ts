import {locahostServer} from './LocalHeightProvider';
import {OpenStreetMapsProvider} from '../source/providers/OpenStreetMapsProvider';

export default class TestMapProvider extends OpenStreetMapsProvider 
{
	public constructor(local = false)
	{
		super(local? `https://${locahostServer}/styles/terrain_no_label/`: 'https://a.tile.openstreetmap.org/');
	}
}
