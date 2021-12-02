/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {AdditiveTweening} from 'additween';
import CameraControls from 'camera-controls';
import Hammer from 'hammerjs';
import * as POSTPROCESSING from 'postprocessing/build/postprocessing.esm';
import Stats from 'stats.js';
import {
	AmbientLight,
	AxesHelper,
	BasicShadowMap,
	Box3, CameraHelper, Clock, Color, DirectionalLight, DirectionalLightHelper, Euler, HemisphereLight, MathUtils, Matrix4, Mesh, MOUSE, NearestFilter, PCFShadowMap, PCFSoftShadowMap, PerspectiveCamera, PointLightHelper, Quaternion, Raycaster, Scene, Sphere, Spherical, Texture, Uniform, Vector2,
	Vector3,
	Vector4,
	VSMShadowMap,
	WebGLRenderer,
	WebGLRenderTarget
} from 'three';
import {Sky} from 'three/examples/jsm/objects/Sky';
import {LODFrustum} from '../source/lod/LODFrustum';
import {MapView} from '../source/MapView';
import {clearCacheRecursive, getNode, MapNode} from '../source/nodes/MapNode';
import {DebugProvider} from '../source/providers/DebugProvider';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {EmptyProvider} from './EmptyProvider';
import {LocalHeightProvider} from './LocalHeightProvider';
import {featuresByColor, getImageData, getPixel, MaterialHeightShader, sharedMaterial, sharedPointMaterial, testColor} from './MaterialHeightShader';
import RasterMapProvider from './TestMapProvider';
import {SunLight} from './SunLight';
import {KeyboardKeyHold} from 'hold-event';
import RenderTargetHelper from 'three-rt-helper';
import {pointToTile, pointToTileFraction, tileToBBOX} from '@mapbox/tilebelt';
import CSM from 'three-csm';
const TO_RAD = Math.PI / 180;
const PI_DIV4 = Math.PI / 4;
const PI_X2 = Math.PI * 2;
const TO_DEG = 180 / Math.PI;


export function stopEventPropagation(event) 
{
	if (event.stopPropagation) 
	{
		event.stopPropagation();
	}
	else if (window.event) 
	{
		window.event.cancelBubble = true;
	}
}

function getURLParameter(name) 
{
	return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}
class CameraControlsWithOrientation extends CameraControls 
{
	screenOrientation: number = 0;

	deviceOrientation: DeviceOrientationEvent = {} as any;

	deviceOrientationEnabled = false;

	orientationAzimuth = 0;

	orientationPolar = 0;

	alphaOffsetAngle = 0;

	betaOffsetAngle = 0;

	gammaOffsetAngle = 0;

	onDeviceOrientationChangeEventBound;

	updateDeviceOrientationQuaternion() 
	{
		var alpha = this.deviceOrientation.alpha ? this.deviceOrientation.alpha * TO_RAD + this.alphaOffsetAngle : 0; // Z
		var beta = this.deviceOrientation.beta ? this.deviceOrientation.beta * TO_RAD + this.betaOffsetAngle : 0; // X'
		var gamma = this.deviceOrientation.gamma ? this.deviceOrientation.gamma * TO_RAD + this.gammaOffsetAngle : 0; // Y''
		var orient = this.screenOrientation ? this.screenOrientation * TO_RAD : 0; // O

		// if (this.screenOrientation % 180 === 0) 
		// {
		// 	if (Math.abs(this.deviceOrientation.beta) < 10 && Math.abs(this.deviceOrientation.gamma) > 80) 
		// 	{
		// 		wrongOrientation = true;
		// 	}
		// 	else 
		// 	{
		// 		wrongOrientation = false;
		// 	}
		// }

		this.setObjectQuaternion(this._camera.quaternion, alpha, beta, gamma, orient);
		this._camera.getWorldDirection(this.wordVec);
		this.orientationAzimuth = Math.atan2(this.wordVec.x, this.wordVec.z) + Math.PI;
		this.orientationPolar = Math.atan2(this.wordVec.z, this.wordVec.y) + Math.PI;
	}

	onDeviceOrientationChangeEvent(event) 
	{
		this.deviceOrientation = event;
		this.updateDeviceOrientationQuaternion();
		this.dispatchEvent({
			type: 'update',
			originalEvent: event
		});
	}

	onScreenOrientationChangeEventBound;

	onCompassNeedsCalibrationEventBound;

	onCompassNeedsCalibrationEvent() 
	{
		console.log('onCompassNeedsCalibrationEvent');
	}

	onScreenOrientationChangeEvent(event) 
	{

		this.screenOrientation = window.orientation as any || 0;
		this.dispatchEvent({
			type: 'control',
			originalEvent: event
		});

	}

	startDeviceOrientation() 
	{
		if (this.deviceOrientationEnabled) 
		{
			return;
		}
		this.deviceOrientationEnabled = true;
		this.screenOrientation = window.orientation as any || 0;
		this.onDeviceOrientationChangeEventBound = this.onDeviceOrientationChangeEvent.bind(this);
		this.onScreenOrientationChangeEventBound = this.onScreenOrientationChangeEvent.bind(this);
		this.onCompassNeedsCalibrationEventBound = this.onCompassNeedsCalibrationEvent.bind(this);

		window.addEventListener('orientationchange', this.onScreenOrientationChangeEventBound, false);
		if ('ondeviceorientationabsolute' in window) 
		{
			window.addEventListener('deviceorientationabsolute', this.onDeviceOrientationChangeEventBound, false);
		}
		else 
		{
			window.addEventListener('deviceorientation', this.onDeviceOrientationChangeEventBound, false);
		}
		window.addEventListener('compassneedscalibration', this.onCompassNeedsCalibrationEventBound, false);
	}

	stopDeviceOrientation() 
	{
		if (!this.deviceOrientationEnabled) 
		{
			return;
		}
		this.deviceOrientationEnabled = false;
		this.rotateTo(this.orientationAzimuth, this.orientationPolar);
		window.removeEventListener('orientationchange', this.onScreenOrientationChangeEventBound, false);
		if ('ondeviceorientationabsolute' in window) 
		{
			window.removeEventListener('deviceorientationabsolute', this.onDeviceOrientationChangeEventBound, false);
		}
		else 
		{
			window.removeEventListener('deviceorientation', this.onDeviceOrientationChangeEventBound, false);
		}
		window.addEventListener('compassneedscalibration', this.onCompassNeedsCalibrationEventBound, false);
	}

	zee = new Vector3(0, 0, 1);

	euler = new Euler();

	q0 = new Quaternion();

	q1 = new Quaternion();

	wordVec = new Vector3();

	setObjectQuaternion(quaternion, alpha, beta, gamma, orient) 
	{
		this.q0.identity();
		this.q1.set(- Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around the x-axis
		this.euler.set(beta, alpha, - gamma, 'YXZ'); // 'ZXY' for the device, but 'YXZ' for us
		quaternion.setFromEuler(this.euler); // orient the device
		quaternion.multiply(this.q1); // camera looks out the back of the device, not the top
		quaternion.multiply(this.q0.setFromAxisAngle(this.zee, - orient)); // adjust for screen orientation
	}

	rotate(azimuthAngle: number, polarAngle: number, enableTransition?: boolean) 
	{
		if (this.deviceOrientationEnabled) 
		{
			this.updateAlphaOffsetAngle(this.alphaOffsetAngle + azimuthAngle);
			this.updateBetaOffsetAngle(this.betaOffsetAngle + polarAngle);
		}
		else 
		{
			return super.rotate(azimuthAngle, polarAngle, enableTransition);
		}
	}

	trucking = false;

	truck(x: number, y: number, enableTransition?: boolean) 
	{
		this.trucking = true;
		return super.truck(x, y, enableTransition);
	}

	zooming = false;

	zoom(zoomStep: number, enableTransition?: boolean) 
	{
		this.zooming = true;
		return super.zoom(zoomStep, enableTransition);
	}

	zoomTo(zoom: number, enableTransition?: boolean) 
	{
		this.zooming = true;
		return super.zoomTo(zoom, enableTransition);
	}

	ignoreUpdateDispatch = false;

	dispatchEvent(event) 
	{
		if (this.ignoreUpdateDispatch && event.type === 'update') 
		{
			return;
		}
		super.dispatchEvent(event);
		if (event.type === 'update') 
		{
			this.trucking = false;
			this.zooming = false;
		}
	}

	update(delta: number) 
	{
		if (this.deviceOrientationEnabled) 
		{
			this.ignoreUpdateDispatch = true;
			super.update(delta);
			this.updateDeviceOrientationQuaternion();
			this.ignoreUpdateDispatch = false;
			this.dispatchEvent({
				type: 'update',
				originalEvent: null
			});
			return true;
		}
		else 
		{
			return super.update(delta);
		}
	}

	updateAlphaOffsetAngle(angle) 
	{
		this.alphaOffsetAngle = angle;
	}

	updateBetaOffsetAngle(angle) 
	{
		this.betaOffsetAngle = angle;
	}

	updateGammaOffsetAngle(angle) 
	{
		this.gammaOffsetAngle = angle;
	}

	dispose() 
	{
		this.stopDeviceOrientation();
		super.dispose();
	}
}
const devLocal = (getURLParameter('local') || 'false') === 'true';

class CustomOutlineEffect extends POSTPROCESSING.Effect 
{
	public uniforms: Map<String, any>;

	constructor() 
	{
		super(
			'CustomOutlineEffect',
			`
uniform vec3 weights;
uniform vec3 outlineColor;
uniform vec3 multiplierParameters;

float readZDepth(vec2 uv) {
	return viewZToOrthographicDepth( getViewZ(readDepth(uv)), cameraNear, cameraFar );
}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
	float depthDiff = 0.0;
	float zdepth = viewZToOrthographicDepth( getViewZ(depth), cameraNear, cameraFar );
	depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(1, 0)));
	depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(-1, 0)));
	depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(0, 1)));
	depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(0, -1)));
	// depthDiff = depthDiff /depth;
	depthDiff = depthDiff * multiplierParameters.y;
	depthDiff = pow(depthDiff, multiplierParameters.x);
	depthDiff = depthDiff * multiplierParameters.z;
	vec4 outlineColor = vec4(outlineColor, 1.0);
	outputColor = vec4(mix(inputColor, outlineColor, depthDiff));
}
`,
			{
				attributes: POSTPROCESSING.EffectAttribute.DEPTH,
				blendFunction: POSTPROCESSING.BlendFunction.AVERAGE,
				uniforms: new Map([
					['outlineColor', new Uniform(new Color(darkTheme ? 0xffffff : 0x000000))],
					['multiplierParameters', new Uniform(new Vector3(depthBiais, depthMultiplier, depthPostMultiplier))]
				])
			}
		);
	}
}

const subsetOfTHREE = {
	MOUSE: MOUSE,
	Vector2: Vector2,
	Vector3: Vector3,
	Vector4: Vector4,
	Quaternion: Quaternion,
	Matrix4: Matrix4,
	Spherical: Spherical,
	Box3: Box3,
	Sphere: Sphere,
	Raycaster: Raycaster,
	MathUtils: {
		DEG2RAD: MathUtils.DEG2RAD,
		clamp: MathUtils.clamp
	}
};

CameraControls.install({THREE: subsetOfTHREE});

function throttle(callback, limit) 
{
	var waiting = false; // Initially, we're not waiting
	return function() 
	{ // We return a throttled function
		if (!waiting) 
		{ // If we're not waiting
			// eslint-disable-next-line prefer-rest-params
			callback.apply(this, arguments); // Execute users function
			waiting = true; // Prevent future invocations
			setTimeout(function() 
			{ // After a period of time
				waiting = false; // And allow future invocations
			}, limit);
		}
	};
}
function debounce(callback, limit) 
{
	var waitingId = null; // Initially, we're not waiting
	return function() 
	{ // We return a throttled function
		if (waitingId) 
		{
			clearTimeout(waitingId);
			waitingId = null;
		}
		waitingId = setTimeout(function(...args) 
		{ // After a period of time
			callback.apply(this, ...args); // Execute users function
			waitingId = null; // And allow future invocations
		}, limit);
	};
}
function ArraySortOn(array, key) 
{
	return array.sort(function(a, b) 
	{
		if (a[key] < b[key]) 
		{
			return -1;
		}
		else if (a[key] > b[key]) 
		{
			return 1;
		}
		return 0;
	});
}
export const isMobile = FORCE_MOBILE || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
// console.log('isMobile', isMobile, navigator.userAgent);
const devicePixelRatio = window.devicePixelRatio;
// console.log('isMobile ' + isMobile + ' ' + devicePixelRatio + ' ' + navigator.userAgent);
export let debug = false;
export let generateColor = false;
export let showStats = false;
export let mapMap = false;
export let drawTexture = true;
export let computeNormals = false;
export let debugFeaturePoints = false;
export let wireframe = false;
export let mapoutline = true;
export let dayNightCycle = false;
export let cameraFOVFactor = 40;
export let GEOMETRY_SIZE = FORCE_MOBILE || isMobile ? 320 : 512;
let debugGPUPicking = false;
let readFeatures = true;
let drawLines = true;
let drawElevations = false;
let darkTheme = false;
export let drawNormals = false;
let featuresToShow = [];
const tempVector = new Vector3(0, 0, 0);
export let exageration = 2;
export let depthBiais = 0.44;
export let depthMultiplier = 1;
export let depthPostMultiplier = 110;
export let elevationDecoder = [6553.6 * 255, 25.6 * 255, 0.1 * 255, -10000];
export let currentViewingDistance = 0;
export let FAR = FORCE_MOBILE || isMobile? 163000: 173000;
export let NEAR = 10;
let currentPositionAltitude = -1;
let currentPosition: {lat: number, lon: number, altitude?: number};
let needsCurrentPositionElevation = false;
let currentGroundElevation;
let currentElevation = -1;
const clock = new Clock();
let selectedItem = null;
let map: MapView;
const EPS = 1e-5;
let pixelsBuffer;
const TEXT_HEIGHT = FORCE_MOBILE || isMobile? 170 : 120;

const now = new Date();
let currentSecondsInDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

let showingCamera = false;
// let showMagnify = false;
let mousePosition = null;

let animating = false;
// Setup the animation loop.
let viewWidth = window.innerWidth;
let viewHeight = window.innerHeight;
let offWidth = window.innerWidth;
let offHeight = window.innerHeight;
let rendererScaleRatio = 1;
let renderRequested = false;
let renderForceComputeFeatures = false;
let sized = false;
let canCreateMap = true;

let stats;


const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const canvas4 = document.getElementById('canvas4') as HTMLCanvasElement;
const video = document.getElementById('video') as HTMLVideoElement;
const ctx2d = canvas4.getContext('2d');
canvas.addEventListener('touchstart', () => { return clock.getDelta(); }, {passive: true});

const renderer = new WebGLRenderer({
	canvas: canvas,
	antialias: false,
	alpha: true,
	powerPreference: 'high-performance',
	// stencil: false
});
renderer.physicallyCorrectLights = true;
renderer.debug.checkShaderErrors = true;
// const magnify3d = new Magnify3d();
// const magnify3dTarget = new WebGLRenderTarget(0, 0); 

renderer.setClearColor(0x000000, 0);

// const rendererMagnify = new WebGLRenderer({
// 	canvas: document.getElementById('canvas5') as HTMLCanvasElement,
// 	// logarithmicDepthBuffer: true,
// 	antialias: AA,
// 	alpha: true,
// 	powerPreference: 'high-performance',
// 	stencil: false,
// 	depth: false
// 	// precision: isMobile ? 'mediump' : 'highp'
// });
const pointBufferTarget = new WebGLRenderTarget(100, 100, {
	generateMipmaps: false,
	stencilBuffer: false,
	depthBuffer: false,
	minFilter: NearestFilter,
	magFilter: NearestFilter
});
let renderTargetHelper;
const composer = new POSTPROCESSING.EffectComposer(renderer, {});

export function shouldComputeNormals() 
{
	return computeNormals || drawNormals || generateColor || (debug || mapMap) && dayNightCycle;
}

export function shouldRenderSky() 
{
	return dayNightCycle;
}

export function needsLights() 
{
	return debug || mapMap || dayNightCycle;
}

export function setTerrarium(value: boolean) 
{
	if (value) 
	{
		elevationDecoder = [256 * 255, 1 * 255, 1 / 256 * 255, -32768];
	}
	else 
	{
		elevationDecoder = [6553.6 * 255, 25.6 * 255, 0.1 * 255, -10000];
	}
	// if (map) 
	// {
	sharedMaterial.uniforms.elevationDecoder.value = elevationDecoder;
	// applyOnNodes((node) => 
	// {
	// 	node.setMaterialValues({elevationDecoder: elevationDecoder});
	// });
	// }
}


function createSky() 
{
	if (sky) 
	{
		return;
	}
	// Add Sky
	sky = new Sky();
	sky.scale.setScalar(1e8);

	// GUI
	const effectController = {
		turbidity: 0,
		rayleigh: 0.5,
		mieCoefficient: 0.005,
		mieDirectionalG: 0.7,
		inclination: 0.48,
		azimuth: 0.25,
		exposure: renderer.toneMappingExposure
	};

	const uniforms = sky.material.uniforms;
	uniforms['turbidity'].value = effectController.turbidity;
	uniforms['rayleigh'].value = effectController.rayleigh;
	uniforms['mieCoefficient'].value = effectController.mieCoefficient;
	uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

	const theta = Math.PI * (effectController.inclination - 0.5);
	const phi = 2 * Math.PI * (effectController.azimuth - 0.5);

	const sun = new Vector3();
	sun.x = Math.cos(phi);
	sun.y = Math.sin(phi) * Math.sin(theta);
	sun.z = Math.sin(phi) * Math.cos(theta);
	uniforms['sunPosition'].value.copy(sun);

	return sky;
}

const scene = new Scene();

export function toggleDeviceSensors() 
{
	if (window['nsWebViewBridge']) 
	{
		window['nsWebViewBridge'].emit('sensors', !controls.deviceOrientationEnabled);
	}
	if (controls.deviceOrientationEnabled) 
	{
		controls.stopDeviceOrientation();
		// setElevation(elevation, true);
		controls.polarAngle = Math.PI / 2;
	}
	else 
	{
		controls.startDeviceOrientation();
	}
}
export function startCam() 
{
	if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) 
	{
		const constraints = {video: {width: 1280, height: 720, facingMode: 'environment'}};

		navigator.mediaDevices
			.getUserMedia(constraints)
			.then(function(stream) 
			{
				// apply the stream to the video element used in the texture
				showingCamera = true;
				video.style.visibility = 'visible';
				video.srcObject = stream;
				video.onloadedmetadata = function(e) 
				{
					video.play();
				};
				toggleDeviceSensors();
			})
			.catch(function(error) 
			{
				console.error('Unable to access the camera/webcam.', error);
			});
	}
	else 
	{
		console.error('MediaDevices interface not available.');
	}
}

export function setDebugMode(value, shouldRender = true) 
{
	if (debug === value) {return;}
	debug = value;
	outlinePass.enabled = !withoutOutline();
	mainPass.renderToScreen = !outlinePass.enabled;
	updateSky();

	sharedMaterial.uniforms.computeNormals.value = shouldComputeNormals();
	sharedMaterial.uniforms.drawTexture.value = (debug || mapMap || generateColor) && drawTexture;
	if (map) 
	{
		map.provider = createProvider();
		if (value) 
		{
			updateVisibleNodesImage('debug');
		}
		if (shouldRender) 
		{
			onControlUpdate();
		}
	}
}

export function toggleDebugMode() 
{
	setDebugMode(!debug);
}

export function setGeometrySize(value, shouldUpdate = true) 
{
	GEOMETRY_SIZE = value;
	if (map && shouldUpdate) 
	{
		createMap();
		updateLODThrottle();
		requestRenderIfNotRequested(true);
	}
}

let lastMode;
function updateVisibleNodesImage(mode) 
{
	const hasChanged = lastMode !== mode;
	lastMode = mode;
	applyOnNodes((node: MapNode) => 
	{
		const userData = MaterialHeightShader.useSharedShader ? node.userData : node.material['userData'];
		if (node.isVisible() && (hasChanged || !(userData.map && userData.map.value)))
		{
			userData.map.value = null;
			node.isTextureReady = false;
			node.initialize();
		}
	});
}
export function setMapMode(value, shouldRender = true) 
{
	if (mapMap === value) {return;}
	mapMap = value;
	outlinePass.enabled = !withoutOutline();
	mainPass.renderToScreen = !outlinePass.enabled;
	updateSky();
	updateAmbientLight();
	sharedMaterial.uniforms.computeNormals.value = shouldComputeNormals();
	sharedMaterial.uniforms.drawTexture.value = (debug || mapMap || generateColor) && drawTexture;
	if (map) 
	{
		map.provider = createProvider();
		if (value) 
		{
			updateVisibleNodesImage('map');
		}
		if (shouldRender) 
		{
			onControlUpdate();
		}
	}
	// createMap();
	// onControlUpdate();
}

export function toggleMapMode() 
{
	setMapMode(!mapMap);
}
export function setPredefinedMapMode(value, shouldRender = true) 
{
	if (mapMap === value && mapoutline === value) {return;}
	mapMap = value;
	mapoutline = value;
	updateSky();
	updateAmbientLight();
	sharedMaterial.uniforms.computeNormals.value = shouldComputeNormals();
	sharedMaterial.uniforms.drawTexture.value = (debug || mapMap || generateColor) && drawTexture;
	if (map) 
	{
		map.provider = createProvider();
		if (value) 
		{
			updateVisibleNodesImage('map');
		}

		if (shouldRender) 
		{
			onControlUpdate();
		}
	}
}
export function togglePredefinedMapMode() 
{
	try 
	{
		setPredefinedMapMode(!mapMap);
	}
	catch (error) 
	{
		console.error(error);

	}
}
export function setDrawTexture(value, shouldRender = true) 
{
	if (drawTexture === value) {return;}
	drawTexture = value;
	// if (map) 
	// {
	sharedMaterial.uniforms.drawTexture.value = (debug || mapMap || generateColor) && drawTexture;
	// applyOnNodes((node) => 
	// {
	// 	node.setMaterialValues({drawTexture: (debug || mapMap || generateColor) && drawTexture});
	// });
	// }
	requestRenderIfNotRequested();
}
export function setGenerateColors(value, shouldRender = true) 
{
	if (generateColor === value) {return;}
	console.log();
	generateColor = value;
	sharedMaterial.uniforms.computeNormals.value = shouldComputeNormals();
	sharedMaterial.uniforms.generateColor.value = generateColor;
	sharedMaterial.uniforms.drawTexture.value = (debug || mapMap || generateColor) && drawTexture;
	updateAmbientLight();

	requestRenderIfNotRequested(shouldRender);
}

export function toggleDrawTexture() 
{
	setDrawTexture(!drawTexture);
}
export function toggleNormalsInDebug() 
{
	setNormalsInDebug(!drawNormals);
}
export function setNormalsInDebug(value, shouldRender = true) 
{
	if (drawNormals === value) {return;}
	drawNormals = value;
	// if (map) 
	// {
	sharedMaterial.uniforms.computeNormals.value = shouldComputeNormals();
	sharedMaterial.uniforms.drawNormals.value = drawNormals;
	sharedMaterial.uniforms.drawTexture.value = (debug || mapMap || generateColor) && drawTexture;
	// applyOnNodes((node) => 
	// {

	// node.setMaterialValues({
	// 	computeNormals: shouldComputeNormals(),
	// 	drawNormals: drawNormals,
	// 	drawTexture: (debug || mapMap || generateColor) && drawTexture
	// });
	// });
	// }
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}

export function setComputeNormals(value, shouldRender = true) 
{
	if (computeNormals === value) {return;}
	computeNormals = value;
	updateSky();
	// if (map) 
	// {
	sharedMaterial.uniforms.computeNormals.value = shouldComputeNormals();
	// applyOnNodes((node) => 
	// {
	// 	node.setMaterialValues({computeNormals: shouldComputeNormals()});

	// });
	// }
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}

export function toggleComputeNormals() 
{
	setComputeNormals(!computeNormals);
}

function updateSky() 
{
	updateAmbientLight();
	if (!sky) {return;}
	sky.visible = sunLight.visible = shouldRenderSky();
}
let directionalLightHelper: DirectionalLightHelper;
export function setDayNightCycle(value, shouldRender = true) 
{
	if (dayNightCycle === value) {return;}
	dayNightCycle = value;
	if (!sky) 
	{
		sky = createSky();
		sunLight = new SunLight(
			new Vector2(45.05, 5.47),
			new Vector3(0.0, 0.0, -1.0),
			new Vector3(1.0, 0.0, 0.0),
			new Vector3(0.0, -1.0, 0.0),
			1.5
		);
		// Adjust the directional light's shadow camera dimensions
		// sunLight.directionalLight.shadow.bias = -0.003;
		sunLight.directionalLight.shadow.mapSize.width = 8192;
		sunLight.directionalLight.shadow.mapSize.height = 8192;
		sunLight.directionalLight.shadow.camera.left = 0.2;
		sunLight.directionalLight.shadow.camera.right = -0.2;
		sunLight.directionalLight.shadow.camera.top = 0.2;
		sunLight.directionalLight.shadow.camera.bottom = -0.2;
		sunLight.directionalLight.shadow.camera.near = 0;
		sunLight.directionalLight.shadow.camera.far = 20;
		// sunLight.directionalLight.target = camera;
		// sunLight.directionalLight.target.position.set(0, 0, 0);
		scene.add(sky);
		scene.add(sunLight as any);
		directionalLightHelper = new DirectionalLightHelper(sunLight.directionalLight, 0.02, 0xff0000);
		scene.add(directionalLightHelper);
		// scene.add(sunLight.directionalLight.target);

		const helper = new CameraHelper( sunLight.directionalLight.shadow.camera );
		scene.add( helper );

		let date = new Date();
		const hours = Math.floor(currentSecondsInDay / 3600);
		const minutes = Math.floor((currentSecondsInDay - hours * 3600) / 60);
		const seconds = currentSecondsInDay - hours * 3600 - minutes * 60;
		date.setHours(hours);
		date.setMinutes(minutes);
		date.setSeconds(seconds);
		sunLight.setDate(date);
	}
	// ambientLight.visible = !dayNightCycle;
	updateSky();
	updateSkyPosition();
	// if (map) 
	// {
	sharedMaterial.uniforms.computeNormals.value = shouldComputeNormals();
	// applyOnNodes((node) => 
	// {
	// 	node.setMaterialValues({computeNormals: shouldComputeNormals()});
	// });
	// }
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleDayNightCycle() 
{
	setDayNightCycle(!dayNightCycle);
}
export function setDebugGPUPicking(value, shouldRender = true) 
{
	debugGPUPicking = value;
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleDebugGPUPicking() 
{
	setDebugGPUPicking(!debugGPUPicking);
}
export function setShowStats(value, shouldRender = true) 
{
	if (showStats === value) {return;}
	showStats = value;
	if (value) 
	{
		if (!stats) 
		{
			stats = new Stats();
			stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
			document.body.appendChild(stats.dom);
		}
		else 
		{
			document.body.appendChild(stats.dom);
		}
	}
	else 
	{
		if (stats) 
		{
			document.body.removeChild(stats.dom);
		}
	}
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleShowStats() 
{
	setShowStats(!showStats);
}
export function setReadFeatures(value, shouldRender = true) 
{
	readFeatures = value;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleReadFeatures() 
{
	setReadFeatures(!readFeatures);
}
export function setDrawLines(value, shouldRender = true) 
{
	drawLines = value;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleDrawLines() 
{
	setDrawLines(!drawLines);
}
export function setDebugFeaturePoints(value, shouldRender = true) 
{
	if (debugFeaturePoints === value) {return;}
	debugFeaturePoints = value;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.objectsHolder.visible = debugFeaturePoints && (node.isVisible() || node.level === map.maxZoomForObjectHolders && node.parentNode.subdivided);
		});
	}
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleDebugFeaturePoints() 
{
	setDebugFeaturePoints(!debugFeaturePoints);
}
export function setDarkMode(value, shouldRender = true) 
{
	if (darkTheme === value) {return;}
	darkTheme = value;
	outlineEffect.uniforms.get('outlineColor').value.set(darkTheme ? 0xffffff : 0x000000);
	document.body.style.backgroundColor = darkTheme ? 'black' : 'white';
	cameraButton.style.backgroundColor = compass.style.backgroundColor = darkTheme ? 'white' : 'black';
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleDarkMode() 
{
	setDarkMode(!darkTheme);
}
export function setWireFrame(value, shouldRender = true) 
{
	if (wireframe === value) {return;}
	wireframe = value;
	sharedMaterial.wireframe = value;
	applyOnNodes((node) => 
	{
		node.material.wireframe = wireframe;
	});
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleWireFrame() 
{
	setWireFrame(!wireframe);
}
export function setMapOultine(value, shouldRender = true) 
{
	if (mapoutline === value) {return;}
	mapoutline = value;
	outlinePass.enabled = !withoutOutline();
	mainPass.renderToScreen = !outlinePass.enabled;
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleMapOultine() 
{
	setMapOultine(!mapoutline);
}

export function setDrawElevations(value, shouldRender = true) 
{
	drawElevations = value;
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function toggleDrawElevations() 
{
	setDrawElevations(!drawElevations);
}

export function toggleCamera() 
{
	if (showingCamera) 
	{
		video.pause();
		// @ts-ignore
		video.srcObject.getTracks().forEach(function(track) 
		{
			track.stop();
		});
		showingCamera = false;

		video.style.visibility = 'hidden';
		toggleDeviceSensors();
	}
	else 
	{
		startCam();
	}
}
// export function setMousPosition(x, y) 
// {
// 	mousePosition = new Vector2(x, y);
// 	render(true);
// }

let datelabel, viewingDistanceLabel, selectedPeakLabel, selectedPeakDiv, elevationSlider, debugMapCheckBox, mapMapCheckBox, dayNightCycleCheckBox, debugGPUPickingCheckbox, readFeaturesCheckbox, debugFeaturePointsCheckbox, darkmodeCheckbox, wireframeCheckbox, mapoutlineCheckbox, depthMultiplierSlider, exagerationSlider, depthPostMultiplierSlider, depthBiaisSlider, dateSlider, viewingDistanceSlider, cameraCheckbox, normalsInDebugCheckbox, drawElevationsCheckbox, elevationLabel, generateColorsCheckBox;

const compass = document.getElementById('compass') as HTMLDivElement;
const compassSlice = document.getElementById('compass_slice') as HTMLDivElement;
const compassLabel = document.getElementById('compass_label') as HTMLLabelElement;
document.body.style.backgroundColor = darkTheme ? 'black' : 'white';
const cameraButton = document.getElementById('camera_button');
cameraButton.style.visibility = FORCE_MOBILE || isMobile?'visible':'hidden';

if (!EXTERNAL_APP) 
{
	debugMapCheckBox = document.getElementById('debugMap') as HTMLInputElement;
	debugMapCheckBox.onchange = (event: any) => { return setDebugMode(event.target.checked); };
	debugMapCheckBox.value = debug as any;

	mapMapCheckBox = document.getElementById('mapMap') as HTMLInputElement;
	mapMapCheckBox.onchange = (event: any) => { return setMapMode(event.target.checked); };
	mapMapCheckBox.checked = mapMap as any;

	generateColorsCheckBox = document.getElementById('generateColors') as HTMLInputElement;
	generateColorsCheckBox.onchange = (event: any) => { return setGenerateColors(event.target.checked); };
	generateColorsCheckBox.checked = generateColor as any;

	dayNightCycleCheckBox = document.getElementById('dayNightCycle') as HTMLInputElement;
	dayNightCycleCheckBox.onchange = (event: any) => { return setDayNightCycle(event.target.checked); };
	dayNightCycleCheckBox.checked = dayNightCycle as any;

	debugGPUPickingCheckbox = document.getElementById('debugGPUPicking') as HTMLInputElement;
	debugGPUPickingCheckbox.onchange = (event: any) => { return setDebugGPUPicking(event.target.checked); };
	debugGPUPickingCheckbox.checked = debugGPUPicking as any;

	readFeaturesCheckbox = document.getElementById('readFeatures') as HTMLInputElement;
	readFeaturesCheckbox.onchange = (event: any) => { return setReadFeatures(event.target.checked); };
	readFeaturesCheckbox.checked = readFeatures as any;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';

	debugFeaturePointsCheckbox = document.getElementById('debugFeaturePoints') as HTMLInputElement;
	debugFeaturePointsCheckbox.onchange = (event: any) => { return setDebugFeaturePoints(event.target.checked); };
	debugFeaturePointsCheckbox.checked = debugFeaturePoints as any;

	darkmodeCheckbox = document.getElementById('darkmode') as HTMLInputElement;
	darkmodeCheckbox.onchange = (event: any) => { return setDarkMode(event.target.checked); };
	darkmodeCheckbox.checked = darkTheme as any;
	wireframeCheckbox = document.getElementById('wireframe') as HTMLInputElement;
	wireframeCheckbox.onchange = (event: any) => { return setWireFrame(event.target.checked); };
	wireframeCheckbox.checked = wireframe as any;

	mapoutlineCheckbox = document.getElementById('mapoutline') as HTMLInputElement;
	mapoutlineCheckbox.onchange = (event: any) => { return setMapOultine(event.target.checked); };
	mapoutlineCheckbox.checked = mapoutline as any;

	elevationSlider = document.getElementById('elevationSlider') as HTMLInputElement;
	elevationSlider.oninput = (event: any) => { return setElevation(event.target.value); };
	elevationSlider.value = currentElevation as any;

	exagerationSlider = document.getElementById('exagerationSlider') as HTMLInputElement;
	exagerationSlider.oninput = (event: any) => { return setExageration(event.target.value); };
	exagerationSlider.value = exageration as any;
	depthMultiplierSlider = document.getElementById('depthMultiplierSlider') as HTMLInputElement;
	depthMultiplierSlider.oninput = (event: any) => { return setDepthMultiplier(event.target.value); };
	depthMultiplierSlider.value = depthMultiplier as any;
	depthPostMultiplierSlider = document.getElementById('depthMultiplierSlider') as HTMLInputElement;
	depthPostMultiplierSlider.oninput = (event: any) => { return setDepthPostMultiplier(event.target.value); };
	depthPostMultiplierSlider.value = depthPostMultiplier as any;
	depthBiaisSlider = document.getElementById('depthBiaisSlider') as HTMLInputElement;
	depthBiaisSlider.oninput = (event: any) => { return setDepthBiais(event.target.value); };
	depthBiaisSlider.value = depthBiais as any;

	dateSlider = document.getElementById('dateSlider') as HTMLInputElement;

	
	dateSlider.oninput = (event: any) => { return setDate(event.target.value); };
	dateSlider.value = currentSecondsInDay as any;
	datelabel = document.getElementById('dateLabel') as HTMLLabelElement;
	datelabel.innerText = new Date().toLocaleString();
	viewingDistanceLabel = document.getElementById('viewingDistanceLabel') as HTMLLabelElement;

	viewingDistanceSlider = document.getElementById('viewingDistanceSlider') as HTMLInputElement;
	viewingDistanceSlider.oninput = (event: any) => { return setViewingDistance(event.target.value); };

	cameraCheckbox = document.getElementById('camera') as HTMLInputElement;
	cameraCheckbox.onchange = (event: any) => { return toggleCamera(); };
	cameraCheckbox.value = showingCamera as any;

	drawElevationsCheckbox = document.getElementById('drawElevations') as HTMLInputElement;
	drawElevationsCheckbox.onchange = (event: any) => { return toggleDrawElevations(); };
	drawElevationsCheckbox.value = drawElevations as any;
	normalsInDebugCheckbox = document.getElementById('normalsInDebug') as HTMLInputElement;
	normalsInDebugCheckbox.onchange = (event: any) => { return toggleNormalsInDebug(); };
	normalsInDebugCheckbox.value = drawNormals as any;

	selectedPeakLabel = document.getElementById('selectedPeakLabel') as HTMLLabelElement;
	elevationLabel = document.getElementById('elevationLabel') as HTMLLabelElement;
	selectedPeakDiv = document.getElementById('selectedPeak') as HTMLDivElement;
}

const hammertime = new Hammer(canvas);
hammertime.on('tap', function(event) 
{
	mousePosition = new Vector2(event.center.x, event.center.y);
	requestRenderIfNotRequested(true);
});
const heightProvider = new LocalHeightProvider(devLocal);
// const heightProvider = new LocalHeightTerrainProvider(devLocal);
setTerrarium(heightProvider.terrarium);

const updateLODThrottle = debounce(function(force = false)
{
	if (!sized || !map || !currentPosition)
	{
		return;
	}
	map.lod.updateLOD(map, camera, renderer, scene, force);
}, FORCE_MOBILE || isMobile? 200: 0) as any;

function updateCompass() 
{
	if (compass) 
	{
		let angle;
		if (controls.deviceOrientationEnabled) 
		{
			angle = controls.orientationAzimuth * TO_DEG % 360;
		}
		else 
		{
			angle = controls.azimuthAngle * TO_DEG % 360;
		}
		if (compassLabel) 
		{
			compassLabel.innerText = angle.toFixed() + '°';

		}
		const hFOV = cameraFOV * viewWidth / viewHeight;
		compassSlice.style.backgroundImage = `conic-gradient(transparent 0deg,transparent ${180 - hFOV / 2}deg, #15BFCC ${180 - hFOV / 2}deg, #15BFCC ${180 + hFOV / 2}deg, transparent ${180 + hFOV / 2}deg)`;
		compassSlice.style.transform = `rotateZ(${-angle - 180}deg)`;
	}
}
function onControlUpdate(forceLOD = false) 
{
	controls.getPosition(tempVector);
	updateLODThrottle(forceLOD);
	updateCompass();
	requestRenderIfNotRequested();
}
function setupLOD() 
{
	const scale = MaterialHeightShader.scaleRatio;
	heightProvider.maxOverZoom = FORCE_MOBILE || isMobile?0:2;
	if (FORCE_MOBILE || isMobile) 
	{
		lod.subdivideDistance = 60 * scale;
		lod.simplifyDistance = 160 * scale;
	}
	else 
	{
		lod.subdivideDistance = 70 * scale;
		lod.simplifyDistance = 170 * scale;
	}
}
const lod = new LODFrustum();
setupLOD();
function createProvider() 
{
	let provider;
	if (mapMap) 
	{
		provider = new RasterMapProvider(devLocal);
		provider.zoomDelta = 2;
	}
	else if (debug) 
	{
		provider = new DebugProvider();
	}
	else 
	{
		provider = new EmptyProvider();
	}
	provider.minZoom = 5;
	provider.maxZoom = heightProvider.maxZoom + heightProvider.maxOverZoom;
	provider.minLevelForZoomDelta = 11;
	return provider;
}

function onNodeReady(node: MaterialHeightShader) 
{
	requestRenderIfNotRequested();
	if (currentPosition && needsCurrentPositionElevation && node.level > heightProvider.maxZoom - 3) 
	{
		const tileBox = tileToBBOX([node.x, node.y, node.level]);
		// console.log('onNodeReady', node.level, node.x, node.y, tileBox, currentPosition, map.provider['buildURL'](node.level, node.x, node.y) );
		if (currentPosition.lat >= tileBox[1] && currentPosition.lat <= tileBox[3] && 
			currentPosition.lon >= tileBox[0] && currentPosition.lon <= tileBox[2]) 
		{
			updateCurrentMinElevation(currentPosition, node);
		}
	// lon 	bbox[0] + (bbox[2] - bbox[0])/2
	}
}
function createMap() 
{	
	if (!canCreateMap) 
	{
		return;
	}
	if (map !== undefined) 
	{
		scene.remove(map);
		clearCacheRecursive(map.root);
	}
	const provider = createProvider();
	map = new MapView(null, provider, heightProvider, false, onNodeReady);
	// map.lowMemoryUsage = isMobile;
	map.lowMemoryUsage = true;
	map.maxZoomForObjectHolders = 13;
	map.setRoot(new MaterialHeightShader(null, map, MapNode.root, 0, 0, 0));
	map.lod = lod;
	map.updateMatrixWorld(true);
	scene.add(map);
	renderer.shadowMap.type = VSMShadowMap;
	renderer.shadowMap.enabled = true;
}

let orientation = (screen.orientation || {}).type ;

function getCameraFOV() 
{
	if (FORCE_MOBILE || isMobile) 
	{
		const scale = viewWidth > viewHeight ? viewHeight / viewWidth : viewWidth / viewHeight;
		return (/landscape/.test(orientation) ? scale : 1) * cameraFOVFactor;
	}
	return cameraFOVFactor;
}

let cameraFOV = getCameraFOV();
const worldScale = MaterialHeightShader.scaleRatio;
const camera = new PerspectiveCamera(cameraFOV, viewWidth / viewHeight, NEAR * worldScale, FAR * worldScale);
window.addEventListener('orientationchange', function(event: any)
{
	orientation = event.target.screen.orientation.type;
	camera.fov = cameraFOV = getCameraFOV();
	// const hFOV = cameraFOV * viewWidth / viewHeight;
	camera.updateProjectionMatrix();
	controls.azimuthRotateSpeed = controls.polarRotateSpeed = cameraSpeedFactor() / zoom; // negative value to invert rotation direction
	updateCompass();
}, false);
camera.position.set(0, 0, EPS);
// scene.add(camera);

// let csm = new CSM({
// 	maxFar: camera.far,
// 	cascades: 4,
// 	shadowMapSize: 4096,
// 	lightDirection: new Vector3(0.7, -0.2, -0.6),
// 	camera: camera,
// 	parent: scene
// });
// for ( var i = 0; i < csm.lights.length; i ++ ) 
// {
// 	csm.lights[i].shadow.camera.near = camera.near;
// 	csm.lights[i].shadow.camera.far = camera.far;
// 	csm.lights[i].shadow.camera.updateProjectionMatrix();

// }
// csm.setupMaterial(sharedMaterial); // must be called to pass all CSM-related uniforms to the shader

const controls = new CameraControlsWithOrientation(camera, canvas);


function updateControls() 
{
	controls.update(1);
}
function cameraSpeedFactor() 
{
	if (FORCE_MOBILE || isMobile) 
	{
		const scale = viewWidth > viewHeight ? viewHeight / viewWidth : viewWidth / viewHeight;
		return (/landscape/.test(orientation) ? scale : 1) * -0.12;
	}
	else 
	{
		return -0.1;
	}
}
controls.azimuthRotateSpeed = cameraSpeedFactor(); // negative value to invert rotation direction
controls.polarRotateSpeed = cameraSpeedFactor(); // negative value to invert rotation direction
controls.minZoom = 1;
controls.maxZoom = 20;
controls.truckSpeed = 1 / EPS * 100000 * worldScale;
controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK;
controls.verticalDragToForward = true;
controls.saveState();
let keyboardMoveSpeed = 5;
let keyboardRotateSpeed = 0.05;

export function setKeyboardRotateSpeed(value) 
{
	keyboardRotateSpeed = value;
}
export function setKeyboardMoveSpeed(value) 
{
	keyboardMoveSpeed = value;
}
if (!(FORCE_MOBILE || isMobile)) 
{
	const KEYCODE = {
		W: 87,
		A: 65,
		S: 83,
		D: 68,
		ARROW_LEFT: 37,
		ARROW_UP: 38,
		ARROW_RIGHT: 39,
		ARROW_DOWN: 40
	};
	const wKey = new KeyboardKeyHold(KEYCODE.W, 16.666);
	const aKey = new KeyboardKeyHold(KEYCODE.A, 16.666);
	const sKey = new KeyboardKeyHold(KEYCODE.S, 16.666);
	const dKey = new KeyboardKeyHold(KEYCODE.D, 16.666);
	aKey.addEventListener('holding', function(event) 
	{
		controls.truck(- keyboardMoveSpeed * worldScale * event.deltaTime, 0, false);
		controls.update(event.deltaTime);
	});
	dKey.addEventListener('holding', function(event) 
	{
		controls.truck(keyboardMoveSpeed * worldScale * event.deltaTime, 0, false);
		controls.update(event.deltaTime);
	});
	wKey.addEventListener('holding', function(event) 
	{
		controls.forward(keyboardMoveSpeed * worldScale * event.deltaTime, false);
		controls.update(event.deltaTime);
	});
	sKey.addEventListener('holding', function(event) 
	{
		controls.forward(- keyboardMoveSpeed * worldScale * event.deltaTime, false);
		controls.update(event.deltaTime);
	});

	const leftKey = new KeyboardKeyHold(KEYCODE.ARROW_LEFT, 16.666);
	const rightKey = new KeyboardKeyHold(KEYCODE.ARROW_RIGHT, 16.666);
	const upKey = new KeyboardKeyHold(KEYCODE.ARROW_UP, 16.666);
	const downKey = new KeyboardKeyHold(KEYCODE.ARROW_DOWN, 16.666);
	leftKey.addEventListener('holding', function(event) 
	{
		controls.rotate(keyboardRotateSpeed * MathUtils.DEG2RAD * event.deltaTime, 0, true);
		controls.update(event.deltaTime);
	});
	rightKey.addEventListener('holding', function(event) 
	{
		controls.rotate(-keyboardRotateSpeed * MathUtils.DEG2RAD * event.deltaTime, 0, true);
		controls.update(event.deltaTime);
	});
	upKey.addEventListener('holding', function(event) 
	{
		controls.rotate(0, - keyboardRotateSpeed * MathUtils.DEG2RAD * event.deltaTime, true);
		controls.update(event.deltaTime);
	});
	downKey.addEventListener('holding', function(event) 
	{
		controls.rotate(0, keyboardRotateSpeed * MathUtils.DEG2RAD * event.deltaTime, true);
		controls.update(event.deltaTime);
	});

}
let sunLight: SunLight;
let sky: Sky;
// Add an ambient light
const ambientLight = new AmbientLight(0xffffff);
scene.add(ambientLight);


// const hemiLight = new HemisphereLight( '#1f467f', '#7f643f', 3 ); 
// hemiLight.position.set( 0, 500* worldScale, 0 );
// scene.add(hemiLight);
// ambientLight.intensity = dayNightCycle ? 0.1875 : 1;

// const directionalLight = new DirectionalLight( 0xffffff, 2);
// directionalLight.position.set( -1, 1, 1 );
// directionalLight.position.multiplyScalar( 50);
// scene.add( directionalLight );
// scene.add( directionalLight.target );

// directionalLightHelper = new DirectionalLightHelper(directionalLight, 0.02, 0xff0000);
// scene.add(directionalLightHelper);

const axesHelper = new AxesHelper(1);
scene.add( axesHelper );

function updateAmbientLight() 
{
	if (mapMap && dayNightCycle) 
	{
		ambientLight.intensity = 1 ;

	}
	else if (generateColor) 
	{
		ambientLight.intensity = dayNightCycle? 1:3 ;
	}
	else
	{
		ambientLight.intensity = 3;
	}
}
function updateSkyPosition() 
{
	if (!sky) {return;}
	const phi = Math.PI / 2 - sunLight.elevation;
	const theta = Math.PI - sunLight.azimuth;
	const sun = new Vector3();
	sun.setFromSphericalCoords(1, phi, theta);

	sky.material.uniforms['sunPosition'].value.copy(sun);
}

function updateCurrentViewingDistance() 
{
	currentViewingDistance = getViewingDistance();
	if (window['nsWebViewBridge']) 
	{
		window['nsWebViewBridge'].emit('viewingDistance', currentViewingDistance);
	}
	if (viewingDistanceLabel) 
	{
		viewingDistanceLabel.innerText = Math.round(currentViewingDistance / 1000) + 'km';
	}
}

function getRhumbLineBearing(originLL, destLL) 
{
	// difference of longitude coords
	let diffLon = destLL.lon * TO_RAD - originLL.lon * TO_RAD;

	// difference latitude coords phi
	const diffPhi = Math.log(
		Math.tan(destLL.lat * TO_RAD / 2 + PI_DIV4) / Math.tan(originLL.lat * TO_RAD / 2 + PI_DIV4)
	);

	// recalculate diffLon if it is greater than pi
	if (Math.abs(diffLon) > Math.PI) 
	{
		if (diffLon > 0) 
		{
			diffLon = (PI_X2 - diffLon) * -1;
		}
		else 
		{
			diffLon = PI_X2 + diffLon;
		}
	}

	// return the angle, normalized
	return (Math.atan2(diffLon, diffPhi) * TO_DEG + 360) % 360;
}
export function setPosition(coords: {lat, lon, altitude?}, animated = false, updateCtrls = true) 
{
	if (coords === currentPosition) 
	{
		return;
	}
	controls.getPosition(tempVector);
	const scale = MaterialHeightShader.scaleRatio;
	const currentCoords = UnitsUtils.sphericalToDatums(tempVector.x / scale, -tempVector.z / scale);
	
	setSelectedItem(null);

	const newPosition = UnitsUtils.datumsToSpherical(coords.lat, coords.lon, null, scale);
	if (animated) 
	{
		const distance = getDistance(currentCoords, coords);
		const startElevation = currentElevation;
		let endElevation = startElevation;
		if (coords.altitude) 
		{
			currentPositionAltitude = coords.altitude + 100;
			endElevation = currentPositionAltitude;
		}
		// always move to be "over" the peak
		const topElevation = distance > 100000 ? 11000 * exageration : endElevation;
		startAnimation({
			from: {...{x: tempVector.x, y: -tempVector.z}, progress: 0},
			to: {...newPosition, progress: 1},
			duration: Math.min(distance / 20, 3000),
			preventComputeFeatures: true,
			onUpdate: (value) => 
			{
				const {progress, ...newPos} = value;
				// currentPosition = newPos;
				if (progress <= 0.2) 
				{
					const cProgress = 5 * progress;
					// controls.azimuthAngle = (startAimingAngle + cProgress * (endAimingAngle - startAimingAngle)) * TO_RAD;
				}
				if (progress <= 0.5) 
				{
					const cProgress = 2 * progress;
					controls.moveTo(newPos.x, (startElevation + cProgress * (topElevation - startElevation)) * exageration * scale, -newPos.y, false);
				}
				else 
				{
					const cProgress = (progress - 0.5) * 2;
					controls.moveTo(newPos.x, (topElevation + cProgress * (endElevation - topElevation)) * exageration * scale, -newPos.y, false);
				}
				updateControls();
			},
			onEnd: () => 
			{
				currentPosition = coords;
				setElevation(endElevation, false);
				updateCurrentViewingDistance();
				updateExternalPosition();
			}
		});
	}
	else 
	{
		if (coords.altitude) 
		{
			setElevation(coords.altitude, false);
		}
		// currentPosition = coords;
		controls.moveTo(newPosition.x, currentElevation * exageration * scale, -newPosition.y, false);
		updateCurrentViewingDistance();
		if (updateCtrls) 
		{
			updateControls();
		}
		axesHelper.position.set(newPosition.x, 2000 * worldScale, -newPosition.y);
		// directionalLight.position.set(newPosition.x, 20000 * worldScale, -newPosition.y);
		// if (directionalLight) {

		// 	directionalLight.target.position.set(newPosition.x, 2000 * worldScale, -newPosition.y);
		// 	directionalLight.target.updateMatrix();
		// 	directionalLight.target.updateMatrixWorld(true);
		// }
		if (sky) 
		{
			sunLight.setPosition(coords.lat, coords.lon);
			controls.getPosition(tempVector);
			sunLight.setWorldPosition(tempVector);
			
			// sunLight.updateMatrix();
			// sunLight.updateMatrixWorld(true);
			updateAmbientLight();
			updateSkyPosition();
		}
	}
}

function updateCurrentMinElevation(pos = currentPosition, node?, diff = 60) 
{
	needsCurrentPositionElevation = false;
	if (pos) 
	{
		const groundElevation = getElevation(pos, node);
		if (groundElevation === -100000 || isNaN(groundElevation)) 
		{
			needsCurrentPositionElevation = true;
		}
		else 
		{
			const oldGroundElevation = currentGroundElevation ||groundElevation;
			const currentDiff = currentElevation - oldGroundElevation;
			currentGroundElevation = groundElevation;
			if (currentDiff > 0 && currentDiff < 500) 
			{
				setElevation(currentGroundElevation + Math.max(currentDiff, diff), true);
			}
		}
	}
	else 
	{
		currentGroundElevation = undefined;
	}
}

export function getElevation(coord: {lat, lon}, node?: MaterialHeightShader): number
{
	const maxZoom = map.heightProvider.maxZoom;
	let zoom = maxZoom;
	let fractionTile;
	while (!node && zoom > maxZoom - 3) 
	{
		fractionTile = pointToTileFraction(coord.lon, coord.lat, zoom);
		node = getNode(fractionTile[2], Math.floor(fractionTile[0]), Math.floor(fractionTile[1])) as MaterialHeightShader;
		zoom -= 1;
	}
	if (node && node.heightLoaded && node.userData.heightMap.value) 
	{
		const texture = node.userData.heightMap.value as Texture;
		const heightMapLocation =node.userData.heightMapLocation.value;
		const pixel = getPixel(getImageData(texture.image as ImageBitmap), heightMapLocation, coord, node.level);
		const elevation = pixel[0]/255* elevationDecoder[0] + pixel[1]/255* elevationDecoder[1] + pixel[2]/255* elevationDecoder[2]+ elevationDecoder[3];

		return elevation;
	}
	else 
	{
		return -100000;
	}
}

export function setElevation(newValue, updateCtrls = true) 
{
	if (typeof newValue === 'string') 
	{
		newValue = parseFloat(newValue);
	}
	if (currentGroundElevation !== undefined && newValue < currentGroundElevation) 
	{
		newValue = currentGroundElevation;
	}
	if (currentElevation === newValue) {return;}
	currentElevation = newValue;
	controls.getPosition(tempVector);
	const scale = MaterialHeightShader.scaleRatio;
	controls.moveTo(tempVector.x, currentElevation * exageration * scale, tempVector.z);
	if (!EXTERNAL_APP) 
	{
		elevationSlider.value = currentElevation;
	}
	if (updateCtrls) 
	{
		updateControls();
	}
}
export function setExageration(newValue, shouldRender = true) 
{
	if (exageration === newValue) {return;}
	exageration = newValue;
	sharedMaterial.uniforms.displacementScale.value = newValue;
	sharedPointMaterial.uniforms.exageration.value = newValue;
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function setDepthBiais(newValue, shouldRender = true) 
{
	depthBiais = newValue;
	outlineEffect.uniforms.get('multiplierParameters').value.set(depthBiais, depthMultiplier, depthPostMultiplier);
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function setDepthMultiplier(newValue, shouldRender = true) 
{
	depthMultiplier = newValue;
	outlineEffect.uniforms.get('multiplierParameters').value.set(depthBiais, depthMultiplier, depthPostMultiplier);
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function setDepthPostMultiplier(newValue, shouldRender = true) 
{
	depthPostMultiplier = newValue;
	outlineEffect.uniforms.get('multiplierParameters').value.set(depthBiais, depthMultiplier, depthPostMultiplier);
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
export function setCameraFOVFactor(newValue, shouldRender = true) 
{
	cameraFOVFactor = newValue;
	camera.fov = cameraFOV = getCameraFOV();
	camera.updateProjectionMatrix();
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}

export function setDate(secondsInDay, shouldRender = true) 
{
	if (currentSecondsInDay === secondsInDay) 
	{
		return;
	}

	currentSecondsInDay = secondsInDay;
	let date = new Date();
	const hours = Math.floor(secondsInDay / 3600);
	const minutes = Math.floor((secondsInDay - hours * 3600) / 60);
	const seconds = secondsInDay - hours * 3600 - minutes * 60;
	date.setHours(hours);
	date.setMinutes(minutes);
	date.setSeconds(seconds);
	if (sunLight) 
	{
		sunLight.setDate(date);
		controls.getPosition(tempVector);
		sunLight.setWorldPosition(tempVector);
		updateAmbientLight();
	}
	if (datelabel) 
	{
		datelabel.innerText = date.toLocaleString();
		dateSlider.value = secondsInDay as any;
	}

	updateSkyPosition();
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
let updateExternalPosition;
export function setUpdateExternalPositionThrottleTime(value) 
{
	updateExternalPosition = throttle(function() 
	{

		if (window['electron']) 
		{
			const ipcRenderer = window['electron'].ipcRenderer;
			ipcRenderer.send('message', {...currentPosition, altitude: currentElevation});
		}
		if (window['nsWebViewBridge']) 
		{
			window['nsWebViewBridge'].emit('position', {...currentPosition, altitude: currentElevation});
		}
	}, value);
}
setUpdateExternalPositionThrottleTime(100);

function updateCurrentPosition() 
{
	controls.getPosition(tempVector);
	const scale = MaterialHeightShader.scaleRatio;
	const point = UnitsUtils.sphericalToDatums(tempVector.x/scale, -tempVector.z/scale);
	// console.log('point', tempVector, point);
	if (sunLight) 
	{
		sunLight.setWorldPosition(tempVector);
	}

	if (!currentPosition || currentPosition.lat !== point.lat || currentPosition.lon !== point.lon) 
	{
		currentPosition = point;
		updateCurrentMinElevation();
		updateExternalPosition();
	}
}

controls.addEventListener('update', () => 
{
	if (!animating) 
	{
		updateCurrentPosition();
	}
	onControlUpdate();
});
controls.addEventListener('controlend', () => 
{
	updateLODThrottle();
	controls.getPosition(tempVector);
	const scale = MaterialHeightShader.scaleRatio;
	const point = UnitsUtils.sphericalToDatums(tempVector.x/scale, -tempVector.z/scale);
	if (!currentPosition || currentPosition.lat !== point.lat || currentPosition.lon !== point.lon || currentPosition.altitude !== currentElevation ) 
	{
		currentPosition = {...point, altitude: currentElevation};
		updateCurrentViewingDistance();
	}
	// force a render at the end of the movement to make sure we show the correct peaks
	requestRenderIfNotRequested(true);
});

let zoom = camera.zoom;
controls.addEventListener('control', (event) => 
{
	const zooming = controls.zooming;
	const trucking = controls.trucking;
	// @ts-ignore
	// if (event.originalEvent && event.originalEvent.buttons) 
	// {
	// 	shouldClearSelectedOnClick = false;
	// }
	if (zoom !== camera.zoom) 
	{
		zoom = camera.zoom;
		controls.azimuthRotateSpeed = controls.polarRotateSpeed = cameraSpeedFactor() / zoom; // negative value to invert rotation direction
	}
	updateControls();
	if (selectedItem && trucking) 
	{
		sendSelectedToNS();
	}
	if (zooming) 
	{
		if (window['nsWebViewBridge']) 
		{
			window['nsWebViewBridge'].emit('zoom', camera.zoom);
		}
	}
	requestRenderIfNotRequested();
});

class OutlinePass extends POSTPROCESSING.EffectPass 
{
	enabled;

	renderToScreen;

	constructor(camera, outlineEffect) 
	{
		super(camera, outlineEffect);
	}

	render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) 
	{
		map.visible = false;
		super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
		map.visible = true;
	}
}
const mainPass = new POSTPROCESSING.RenderPass(scene, camera);
composer.addPass(mainPass);
mainPass.renderToScreen = true;
const outlineEffect = new CustomOutlineEffect();
const outlinePass = new OutlinePass(camera, outlineEffect);
outlinePass.renderToScreen = true;
outlinePass.enabled = !withoutOutline();
mainPass.renderToScreen = !outlinePass.enabled;
composer.addPass(outlinePass);
// function crop(x, y, w, h) {
// renderer.setViewport(x, y, w, h);
// renderer.setScissor(x, y, w, h);
// renderer.setScissorTest(true);
// }
let minYPx = 0;
function actualComputeFeatures() 
{
	let oldSyVisible;
	let oldSunLightVisible ;
	let oldAmbientLightVisible = ambientLight.visible;
	ambientLight.visible = false;
	if (sky) 
	{
		oldSyVisible = sky.visible;
		oldSunLightVisible = sunLight.visible;
		sky.visible = false;
		sunLight.visible = false;
	}
	sharedPointMaterial.uniforms.depthTexture.value = composer.depthTexture;
	applyOnNodes((node) => 
	{
		const visible = node.isVisible();
		if (visible) 
		{
			node.wasVisible = visible;
			node.hide();
		}
		node.objectsHolder.visible = visible || node.level === map.maxZoomForObjectHolders && node.parentNode.subdivided;
		// if (node.pointsMesh) 
		// {
		// 	node.pointsMesh.userData.depthTexture.value = depthTexture;
		// }
	});
	if (debugFeaturePoints) 
	{
		renderer.render(scene, camera);
	}
	renderer.setRenderTarget(pointBufferTarget);
	renderer.clear();
	renderer.render(scene, camera);
	renderer.setRenderTarget(null);
	readShownFeatures();

	sharedPointMaterial.uniforms.depthTexture.value = null;
	applyOnNodes((node) => 
	{
		if (node.wasVisible) 
		{
			delete node.wasVisible;
			node.show();
		}
		node.objectsHolder.visible = node.isVisible() && debugFeaturePoints || node.level === map.maxZoomForObjectHolders && node.parentNode.subdivided;
		// if (node.pointsMesh) 
		// {
		// 	node.pointsMesh.userData.depthTexture.value = null;
		// }

	});
	if (sky) 
	{
		sky.visible = oldSyVisible;
		sunLight.visible = oldSunLightVisible;
	}
	ambientLight.visible = oldAmbientLightVisible;
}
const computeFeatures = throttle(actualComputeFeatures, FORCE_MOBILE || isMobile? 300: 100) as any;
document.body.onresize = function() 
{
	sized= true;
	viewWidth = window.innerWidth;
	viewHeight = window.innerHeight;
	const scale = viewWidth / viewHeight;
	if (scale > 1) 
	{
		offWidth = FORCE_MOBILE || isMobile ? 800: 800;
		offHeight = Math.round(offWidth / scale);
	}
	else 
	{
		offHeight = FORCE_MOBILE || isMobile ? 800: 800;
		offWidth = Math.round(offHeight * scale);
	}

	minYPx = TEXT_HEIGHT / viewHeight * offHeight;

	canvas4.width = Math.floor(viewWidth * devicePixelRatio);
	canvas4.height = Math.floor(viewHeight * devicePixelRatio);
	rendererScaleRatio = 1 + (devicePixelRatio - 1) / 2;

	renderer.setSize(viewWidth, viewHeight);
	renderer.setPixelRatio(rendererScaleRatio);

	pixelsBuffer = new Uint8Array(offWidth * offHeight * 4);
	pointBufferTarget.setSize(offWidth, offHeight);

	composer.setSize(viewWidth, viewHeight);
	camera.aspect = scale;
	camera.updateProjectionMatrix();

	// rendererMagnify.setSize(width, height);
	// rendererMagnify.setPixelRatio(rendererScaleRatio);
	// magnify3dTarget.setSize(width *devicePixelRatio, height *devicePixelRatio);

	// screenQuad.setScreenSize( viewWidth, viewHeight );

	// if (!renderTargetHelper) 
	// {
	// 	renderTargetHelper = RenderTargetHelper( renderer, pointBufferTarget );
	// 	document.body.append( renderTargetHelper );
	// }
	if (!map && currentPosition) 
	{
		createMap();
	}
	updateLODThrottle();
	requestRenderIfNotRequested(true);
};
// @ts-ignore
document.body.onresize();
updateControls();

function toScreenXY(pos3D) 
{
	const pos = pos3D.clone();
	pos.project(camera);
	const widthHalf = viewWidth / 2,
		heightHalf = viewHeight / 2;

	pos.x = pos.x * widthHalf + widthHalf;
	pos.y = -(pos.y * heightHalf) + heightHalf;
	pos.z = camera.position.distanceTo(pos3D);
	return pos;
}

function applyOnNode(node, cb) 
{
	cb(node);
	node.children.forEach((n) => 
	{
		if (n instanceof MapNode) 
		{
			applyOnNode(n, cb);
		}
	});
	if (node.childrenCache) 
	{
		node.childrenCache.forEach((n) => 
		{
			if (n instanceof MapNode) 
			{
				applyOnNode(n, cb);
			}
		});
	}
}
function applyOnNodes(cb) 
{
	if (map) 
	{
		applyOnNode(map.children[0], cb);
	}
}

function wrapText(context, text, x, y, maxWidth, lineHeight, measureOnly = false) 
{
	const words = text.split(' ');
	let line = '';
	let nbLines = 1;
	for (let n = 0; n < words.length; n++) 
	{
		const testLine =line + (n>0?' ' : '') + words[n];
		const testWidth = context.measureText(testLine).width;
		if (testWidth > maxWidth && n > 0) 
		{
			if (!measureOnly) 
			{
				context.fillText(line, x, y);
			}
			line = words[n];
			y += lineHeight;
			nbLines++;
		}
		else 
		{
			line = testLine;
		}
	}
	if (!measureOnly) 
	{
		context.fillText(line, x, y);
	}
	if (measureOnly) 
	{
		return {x: x + context.measureText(line).width, y: y, nbLines: nbLines};
	}
}
function roundRect(ctx, x, y, w, h, r) 
{
	if (w < 2 * r) 
	{
		r = w / 2;
	}
	if (h < 2 * r) 
	{
		r = h / 2;
	}
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function truncate(str, maxlength) 
{
	return str.length > maxlength ?
		str.slice(0, maxlength - 1) + '…' : str;
}
function updateSelectedPeakLabel() 
{
	const point2 = {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele};
	const distance = getDistance(currentPosition, point2);
	selectedPeakLabel.innerText = selectedItem.properties.name + ' ' + selectedItem.properties.ele + 'm(' + Math.round(distance / 100) / 10 + 'km)';
}

function sendSelectedToNS() 
{
	if (window['nsWebViewBridge']) 
	{
		let distance = 0;
		if (selectedItem) 
		{
			controls.getPosition(tempVector);
			const scale = MaterialHeightShader.scaleRatio;
			const point1 = UnitsUtils.sphericalToDatums(tempVector.x/scale, -tempVector.z/scale);
			const point2 = {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele};
			distance = getDistance(point1, point2);
		}

		window['nsWebViewBridge'].emit('selected', selectedItem ? {...selectedItem, distance: distance} : null);
	}
}
function setSelectedItem(f) 
{
	mousePosition = null;
	if (f === selectedItem) 
	{
		return;
	}
	selectedItem = f;
	sendSelectedToNS();
	if (selectedPeakLabel) 
	{
		if (selectedItem) 
		{
			updateSelectedPeakLabel();
		}
		else 
		{
			selectedPeakLabel.innerText = null;
		}
		selectedPeakDiv.style.visibility = selectedItem ? 'visible' : 'hidden';
	}
}
export function goToSelectedItem() 
{
	if (selectedItem) 
	{
		// ensure we dont end up in the mesh
		const point2 = {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele + 100};
		setPosition(point2, true);
	}

}
export function focusSelectedItem() 
{
	if (selectedItem) 
	{
		controls.getPosition(tempVector);
		const scale = MaterialHeightShader.scaleRatio;
		const point1 = UnitsUtils.sphericalToDatums(tempVector.x/scale, -tempVector.z/scale);
		const point2 = {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0]};
		const angle = 360 - getRhumbLineBearing(point1, point2);
		setAzimuth(angle);
	}
}

function isSelectedFeature(f) 
{
	if (devLocal) 
	{
		return selectedItem && f.properties.osmid === selectedItem.properties.osmid;
	}
	return selectedItem && f.properties.name === selectedItem.properties.name && f.properties.ele === selectedItem.properties.ele;
}

function getDistanceToMouse(f) 
{
	return Math.sqrt(Math.pow(mousePosition.x - f.x, 2) + Math.pow(mousePosition.y - f.y, 2));
}
const minDistance = isMobile ? 26 : 44;
const windowSize = minDistance;
function drawFeatures() 
{
	if (!readFeatures || animating) 
	{
		return;
	}

	const featuresGroupedX = new Array(viewWidth);
	let lastX = 0;
	let maxEle = -10000;
	let maxEleX;
	// console.log(featuresToShow.length, featuresToShow.findIndex((f) => {return f.properties.name.endsWith('Monte Bianco');}));
	const featuresToDraw = [];
	const scale = MaterialHeightShader.scaleRatio;
	featuresToShow.forEach((f) => 
	{
		const coords = UnitsUtils.datumsToSpherical(f.geometry.coordinates[1], f.geometry.coordinates[0], null, scale);
		const ele = f.properties.ele || 0;
		tempVector.set(coords.x, ele * exageration * scale, -coords.y);
		const vector = toScreenXY(tempVector);
		const x = Math.floor(vector.x);
		const y = vector.y;
		const z = vector.z;
		if (y < TEXT_HEIGHT- 20 || z > FAR * scale + 1000 || z / ele > FAR * scale / 3000) 
		{
			// if (f.properties.name.endsWith('Monte Bianco')) 
			// {
			// 	console.log('ignoring', f.properties.name, z, z / ele > FAR / 3000, z > FAR + 1000 );

			// }
			return;
		}
		
		// lastX = Math.max(lastX, x);
		// if (f.properties.name.endsWith('Monte Bianco')) 
		// {
		// 	console.log('test', x );

		// }
		if (ele > maxEle) 
		{
			maxEleX = x;
			maxEle = ele;
		}
		const array = featuresGroupedX[x] = featuresGroupedX[x] || [];
		array.push({...f, x: x, y: y, z: z});
	});
	let windowStartX = maxEleX;
	function handleWindowSize(startX, endX, distance) 
	{
		// console.log('test1', windowStartX);
		const array = featuresGroupedX.slice(startX, endX).filter((s) => {return Boolean(s);}).flat();
		if (array.length === 0) 
		{
			windowStartX += distance;
			return true;
		}
		// const indexTet = array.findIndex((f) => {return f.properties.name.endsWith('Monte Bianco');});
		// if (indexTet !== -1) 
		// {
		// 	console.log('found Monte Bianco!');
		// }
		let nextFeature;
		if (mousePosition && mousePosition.x >=startX && mousePosition.x <= endX) 
		{
			const mouseObj= array.reduce((p, c) => 
			{
				return getDistanceToMouse(p) < getDistanceToMouse(c) ?p : c;
			});
			if (getDistanceToMouse(mouseObj) < 20) 
			{
				nextFeature = mouseObj;
				setSelectedItem(nextFeature);
			}
		}
		if (!nextFeature && selectedItem) 
		{
			const index= array.findIndex((f) => {return isSelectedFeature(f);});
			if (index !== -1) 
			{
				nextFeature = array[index];
			}
		}
		if (!nextFeature) 
		{
			nextFeature = array.reduce((p, c) => {return Math.pow(p.properties.ele, 2) >Math.pow(c.properties.ele, 2) ? p : c;});
		}
		windowStartX = nextFeature.x + distance;
		featuresToDraw.push(nextFeature);
	}
	// console.log('maxEleX', maxEleX, maxEle);
	windowStartX = maxEleX - minDistance /2;
	while (windowStartX < viewWidth) 
	{
		if (handleWindowSize(windowStartX, windowStartX+ minDistance, minDistance)) 
		{
			continue;
		}
	}
	windowStartX = maxEleX - minDistance;
	while (windowStartX >= 0) 
	{
		if (handleWindowSize(windowStartX - minDistance, windowStartX, -minDistance)) 
		{
			continue;
		}
	}

	// console.log('featuresToDraw', featuresToDraw );
	drawFeaturesLabels(featuresToDraw);

}

const labelFontSize = 15;
const textRotation = -Math.PI / 4;
const textMaxWidth = Math.round(TEXT_HEIGHT / Math.cos(textRotation) - 20);
const rectTop = -16;
const rectBottom = 21;
const canWrap = !(FORCE_MOBILE || isMobile);
function drawFeaturesLabels(featuresToDraw: any[]) 
{
	const screenRatio = devicePixelRatio;
	const toShow = featuresToDraw.length;
	ctx2d.save();
	ctx2d.clearRect(0, 0, canvas4.width, canvas4.height);
	ctx2d.scale(screenRatio, screenRatio);

	const textColor = darkTheme ? 'white' : 'black';
	const color = darkTheme ? '#000000' : '#ffffff';
	let f, y, isSelected, text, realTextWidth, textWidth, textWidth2, transform, point, test;
	for (let index = 0; index < toShow; index++) 
	{
		f = featuresToDraw[index];
		y = f.y;
		isSelected = selectedItem && isSelectedFeature(f);
		if (drawLines && y>TEXT_HEIGHT) 
		{
			ctx2d.beginPath();
			ctx2d.strokeStyle = textColor;
			ctx2d.lineWidth = isSelected?3:1;
			ctx2d.moveTo(f.x, TEXT_HEIGHT);
			ctx2d.lineTo(f.x, y);
			ctx2d.closePath();
			ctx2d.stroke();
		}
		
		ctx2d.save();
		ctx2d.translate(f.x, TEXT_HEIGHT);
		ctx2d.rotate(textRotation);
		if (isSelected) 
		{
			ctx2d.font = `bold ${labelFontSize}px Noto Sans`;
		}
		else 
		{
			ctx2d.font = `${labelFontSize}px Noto Sans`;
		}
		text = canWrap? f.properties.name: truncate(f.properties.name, 30);
		realTextWidth = ctx2d.measureText(text).width;
		textWidth = Math.min(realTextWidth, textMaxWidth);
		let wrapValues = {y: canWrap && drawElevations?labelFontSize:0, x: canWrap? 0 :textWidth};
		if (canWrap && realTextWidth !== textWidth) 
		{
			wrapValues = wrapText(ctx2d, text, 5, 0, textWidth, labelFontSize, true);
		}
		let totalWidth = textWidth + 10;
		let text2;
		if (drawElevations) 
		{
			text2 = f.properties.ele + 'm';
			textWidth2 = ctx2d.measureText(text2).width;
			totalWidth += textWidth2 - 5;
		}
		if (mousePosition) 
		{
			transform = ctx2d.getTransform().inverse();
			point = new DOMPoint(mousePosition.x * screenRatio, mousePosition.y * screenRatio);
			test = point.matrixTransform(transform);
			if (test.x >= 0 && test.x < totalWidth &&
				test.y < -rectTop && test.y >= -(rectBottom + wrapValues.y)) 
			{
				let changed = selectedItem !== f;
				setSelectedItem(f);
				if (changed) 
				{
					// we need to redraw again as the previously selected text 
					// might already be drawn bold
					ctx2d.restore();
					ctx2d.restore();
					return drawFeaturesLabels(featuresToDraw);
				}
			}
		}
		ctx2d.fillStyle = color + 'cc';
	
		roundRect(ctx2d, 0, rectTop, totalWidth, rectBottom + wrapValues.y, 8);
		ctx2d.fill();
		ctx2d.fillStyle = textColor;
		if (wrapValues.y !== 0) 
		{
			wrapText(ctx2d, text, 5, 0, textWidth, labelFontSize);
		}
		else 
		{
			ctx2d.fillText(text, 5, 0);
		}
		if (drawElevations) 
		{
			ctx2d.font = 'normal 11px Courier';
			ctx2d.fillText(text2, wrapValues.x + 10, wrapValues.y);
		}
		
		ctx2d.restore();
	}
	ctx2d.restore();
	if (mousePosition && selectedItem) 
	{
		setSelectedItem(null);
		drawFeaturesLabels(featuresToDraw);
	}
}

function readShownFeatures() 
{
	const width = offWidth;
	renderer.readRenderTargetPixels(pointBufferTarget, 0, 0, offWidth, offHeight, pixelsBuffer);
	const readColors = [];
	const rFeatures = [];
	let needsToClearSelectedItem = Boolean(selectedItem);
	let lastColor;
	function handleLastColor(pixelIndex) 
	{
		
		const colorIndex = readColors.indexOf(lastColor);
		if (colorIndex === -1) 
		{
			const feature = featuresByColor[lastColor];
			if (feature) 
			{
				readColors.push(lastColor);
				const result = {...feature};
				rFeatures.push(result);
				if (needsToClearSelectedItem && isSelectedFeature(feature)) 
				{
					needsToClearSelectedItem = false;
				}
				return result;
			}
		}
		else 
		{
			const result = rFeatures[colorIndex];
			return result;
		}
	}

	const endIndex = pixelsBuffer.length - minYPx * 4 * width;
	for (let index = 0; index < endIndex; index += 4) 
	{
		if (pixelsBuffer[index + 3] !== 0 && (pixelsBuffer[index] !== 0 || pixelsBuffer[index + 1] !== 0 || pixelsBuffer[index + 2] !== 0)) 
		{
			const color = (pixelsBuffer[index] << 16) + (pixelsBuffer[index + 1] << 8) + pixelsBuffer[index + 2];
			
			if (lastColor !== color) 
			{
				if (lastColor) 
				{
					const feature = handleLastColor(index - 4);

				}
				lastColor = color;
			}
		}
		else 
		{
			if (lastColor) 
			{
				handleLastColor(index - 4);
				lastColor = null;
			}
		}
	}
	if (lastColor) 
	{
		handleLastColor(endIndex - 4);
		lastColor = null;
	}
	if (needsToClearSelectedItem) 
	{
		setSelectedItem(null);
	}
	featuresToShow = rFeatures;
}

function withoutOutline() 
{
	return (debug || mapMap || generateColor) && !mapoutline;
}
function actualRender(forceComputeFeatures) 
{
	composer.render(clock.getDelta());
	if (!animating && readFeatures && pixelsBuffer) 
	{
		if (forceComputeFeatures) 
		{
			actualComputeFeatures();
		}
		else 
		{
			computeFeatures();
		}
	}
	drawFeatures();
}
export function requestRenderIfNotRequested(forceComputeFeatures = false) 
{
	if (!sized) 
	{
		return;
	}
	if (!renderForceComputeFeatures && forceComputeFeatures) 
	{
		renderForceComputeFeatures = forceComputeFeatures;
	}
	if (!renderRequested) 
	{
		renderRequested = true;
		requestAnimationFrame(render);
	}
}
export function render() 
{
	renderRequested = false;
	if (!renderer || !composer || !map) 
	{
		return;
	}
	// csm.update(camera.matrix);
	if (directionalLightHelper) 
	{

		directionalLightHelper.position.setFromMatrixPosition(directionalLightHelper.light.matrixWorld);
		directionalLightHelper.updateMatrix();
		directionalLightHelper.update();
	}
	// if (showMagnify) 
	// {
	// 	const toComposer = withoutComposer();
	// 	if (!toComposer )
	// 	{
	// 		renderer.setRenderTarget(magnify3dTarget);
	// 	}
	// 	else 
	// 	{
	// 		pass.renderToScreen = false;
	// 	}
	// 	actualRender(forceComputeFeatures);
	// 	// renderer.setRenderTarget(null);
	// 	magnify3d.render({
	// 		renderer: renderer,
	// 		rendererOut: rendererMagnify,
	// 		pos: mousePosition,
	// 		inputBuffer: magnify3dTarget,
	// 		renderSceneCB: (target) => 
	// 		{
	// 			// rendering in the zoom lens
	// 			renderer.setRenderTarget(target);
	// 			renderer.render(scene, camera);
	// 		}

	// 	});
	// }
	// else 
	// {
	actualRender(renderForceComputeFeatures);
	renderForceComputeFeatures = false;
	// }
	if (renderTargetHelper) 
	{
		renderTargetHelper.update();
	}
	if (stats) 
	{
		stats.update();
	}
}

if (datelabel) 
{
	exports.init = function() 
	{
		const now =new Date();
		const secondsInDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
		callMethods({'setPosition': {'lat': 45.1811, 'lon': 5.8141, 'altitude': 2144}, 'setAzimuth': 0, 'setDarkMode': false, 'setMapMode': false, 'setMapOultine': false, 'setDayNightCycle': true, 'setDrawElevations': true, 'setViewingDistance': 173000, 'setCameraFOVFactor': 28.605121612548828, 'setDate': 48025, 'setDebugMode': true, 'setReadFeatures': false, 'setShowStats': true, 'setWireFrame': false, 'setDebugGPUPicking': false, 'setDebugFeaturePoints': false, 'setComputeNormals': false, 'setNormalsInDebug': false, 'setGenerateColors': false, 'setExageration': 1.622511863708496, 'setDepthBiais': 0.44782665371894836, 'setDepthMultiplier': 110.65267944335938, 'setDepthPostMultiplier': 0.9277091026306152});
	};
}

function startAnimation({from, to, duration, onUpdate, onEnd, preventComputeFeatures}: { from, to, duration, onUpdate?, onEnd?, preventComputeFeatures?}) 
{
	animating = preventComputeFeatures;
	if (animating) 
	{
		ctx2d.clearRect(0, 0, canvas4.width, canvas4.height);
	}

	const anim = new AdditiveTweening({
		onRender: onUpdate,
		onFinish: () => 
		{
			if (onEnd) 
			{
				onEnd();
			}
			animating = false;
			requestRenderIfNotRequested(true);
		}
	});
	anim.tween(from, to, duration);
}

export function setAzimuth(value: number, animated = true, updateCtrls = true) 
{
	const current = controls.azimuthAngle * TO_DEG % 360;
	if (current === value) {return;}

	if (Math.abs(value - 360 - current) < Math.abs(value - current)) 
	{
		value = value - 360;
	}
	if (animated) 
	{
		startAnimation({
			from: {progress: current},
			to: {progress: value},
			duration: 200,
			onUpdate: function(values) 
			{
				controls.azimuthAngle = values.progress * TO_RAD;
				updateControls();
			}
		});
	}
	else 
	{
		controls.azimuthAngle = value * TO_RAD;
		if (updateCtrls) 
		{
			updateControls();
		}
	}
	
}

export function setNear(value) 
{
	if (NEAR === value) {return;}
	NEAR = value;
	camera.near = NEAR * worldScale;
}
export function setViewingDistance(meters: number, shouldRender = true) 
{
	if (FAR === meters) {return;}
	FAR = meters;
	const scale = MaterialHeightShader.scaleRatio;
	camera.far = FAR * scale;
	camera.updateProjectionMatrix();
	updateCurrentViewingDistance();

	sharedPointMaterial.uniforms.cameraNear.value = camera.near;
	sharedPointMaterial.uniforms.cameraFar.value = camera.far;
	if (shouldRender) 
	{
		requestRenderIfNotRequested(true);
	}
}
export function callMethods(json) 
{
	try 
	{
		canCreateMap = false;
		Object.keys(json).sort().forEach((key) => 
		{
			const func = window['webapp'][key];
			const newValue = json[key];
			if (typeof func === 'function') 
			{
				func(newValue, false, false);
			}
			if (!EXTERNAL_APP) 
			{
				const actualKey = key[3].toLowerCase() + key.slice(4);
				if (typeof newValue === 'boolean') 
				{

				}
			}
		});
		canCreateMap = true;
		if (!map) 
		{
			createMap();
		}
		updateControls();
		requestRenderIfNotRequested(true);
	}
	catch (err) 
	{
		console.error(err);
	}
}

function getDistance(start, end) 
{
	const slat = (start.latitude || start.lat) * TO_RAD;
	const slon = (start.longitude || start.lon) * TO_RAD;
	const elat = (end.latitude || end.lat) * TO_RAD;
	const elon = (end.longitude || end.lon) * TO_RAD;
	return Math.round(
		Math.acos(Math.sin(elat) * Math.sin(slat) + Math.cos(elat) * Math.cos(slat) * Math.cos(slon - elon)) * UnitsUtils.EARTH_RADIUS
	);
}
function getViewingDistance() 
{
	if (!currentPosition) 
	{
		return 0;
	}
	var farPoint = new Vector3(0, 0, -camera.far);
	farPoint.applyMatrix4(camera.matrixWorld);
	const scale = MaterialHeightShader.scaleRatio;
	const point2 = UnitsUtils.sphericalToDatums(farPoint.x/scale, -farPoint.z/scale);
	return getDistance(currentPosition, point2);
}
