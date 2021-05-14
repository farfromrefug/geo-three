import { MapProvider } from './MapProvider';
import { XHRUtils } from '../utils/XHRUtils';
import { CancelablePromise } from '../utils/CancelablePromise';

/**
 * Open tile map server tile provider.
 *
 * API Reference
 *  - https://openmaptiles.org/
 *
 * @class OpenMapTilesProvider
 */
export class OpenMapTilesProvider extends MapProvider {
	/**
	 * Map server address.
	 *
	 * By default the open OSM tile server is used.
	 *
	 * @attribute address
	 * @type {string}
	 */
	address: string;

	/**
	 * Map image tile format.
	 *
	 * @attribute format
	 * @type {string}
	 */
	format: string;

	/**
	 * Map tile theme, some of the styles available.
	 * - dark-matter
	 * - klokantech-basic
	 * - osm-bright
	 * - positron
	 *
	 * @attribute theme
	 * @type {string}
	 */
	theme: string;

	constructor(address) {
		super();
		this.address = address;
		this.format = 'png';
		this.theme = 'klokantech-basic';
	}

	getMetaData() {
		const self = this;
		const address = this.address + 'styles/' + this.theme + '.json';

		XHRUtils.get(address, function (data) {
			const meta = JSON.parse(data);

			self.name = meta.name;
			self.format = meta.format;
			self.minZoom = meta.minZoom;
			self.maxZoom = meta.maxZoom;
			self.bounds = meta.bounds;
			self.center = meta.center;
		});
	}

	fetchTile(zoom, x, y) {
		return new CancelablePromise((resolve, reject) => {
			const image = document.createElement('img');
			image.onload = function () {
				resolve(image);
			};
			image.onerror = function () {
				reject();
			};
			image.crossOrigin = 'Anonymous';
			image.src = this.address + 'styles/' + this.theme + '/' + zoom + '/' + x + '/' + y + '.' + this.format;
		});
	}
}