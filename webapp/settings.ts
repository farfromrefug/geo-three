export const isMobile = FORCE_MOBILE || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const now = new Date();
export const settings = {
	local: false,
	localURL: '',
	terrarium: true,
	heightMinZoom: 5,
	heightMaxZoom: 15,
	shadows: true,
	dayNightCycle: false,
	generateColor: false,
	debug: false,
	geometrySize: FORCE_MOBILE || isMobile ? 320 : 512,
	debugGPUPicking: false,
	readFeatures: true,
	drawLines: true,
	drawElevations: false,
	dark: false,
	fovFactor: 28.605121612548828,
	outline: true,
	wireframe: false,
	drawNormals: false,
	debugFeaturePoints: false,
	computeNormals: false,
	drawTexture: true,
	mapMap: false,
	rasterProviderZoomDelta: 2,
	maxZoomForPeaks: 13,
	stats: false,
	exageration: 1.622511863708496,
	outlineStroke: 1,
	depthBiais: 0.23,
	flipRasterImages: true,
	depthMultiplier: 11,
	depthPostMultiplier: 0.9277091026306152,
	secondsInDay: now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(), 
	elevation: -1,
	stickToGround: true,
	elevationDecoder: [6553.6 * 255, 25.6 * 255, 0.1 * 255, -10000],
	far: 173000,
	near: 10
};
