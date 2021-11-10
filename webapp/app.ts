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
	Box3, Clock, Color, Euler, MathUtils, Matrix4, Mesh, MOUSE, NearestFilter, PerspectiveCamera, Quaternion, Raycaster, Scene, Sphere, Spherical, Uniform, Vector2,
	Vector3,
	Vector4,
	WebGLRenderer,
	WebGLRenderTarget
} from 'three';
import {Sky} from 'three/examples/jsm/objects/Sky';
import {LODFrustum} from '../source/lod/LODFrustum';
import {MapView} from '../source/MapView';
import {clearCacheRecursive, MapNode} from '../source/nodes/MapNode';
import {DebugProvider} from '../source/providers/DebugProvider';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {EmptyProvider} from './EmptyProvider';
import {LocalHeightProvider} from './LocalHeightProvider';
import {MaterialHeightShader} from './MaterialHeightShader';
import RasterMapProvider from './TestMapProvider';
import {SunLight} from './SunLight';
import {KeyboardKeyHold} from 'hold-event';
import RenderTargetHelper from 'three-rt-helper';

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
					// ['multiplierParameters', new Uniform(new Vector2(1, 40))]
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
export let featuresByColor = {};
export let elevationDecoder = [6553.6 * 255, 25.6 * 255, 0.1 * 255, -10000];
export let currentViewingDistance = 0;
export let FAR = FORCE_MOBILE || isMobile? 163000: 173000;
export let NEAR = 10;
const TEXT_HEIGHT = 120;
let currentPositionAltitude = -1;
let currentPosition;
let elevation = -1;
const clock = new Clock();
let selectedItem = null;
let map: MapView;
const EPS = 1e-5;
let pixelsBuffer;
const AA = true;
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

let stats;


const canvas = document.getElementById('canvas') as HTMLCanvasElement;
// const canvas3 = document.getElementById('canvas3') as HTMLCanvasElement;
const canvas4 = document.getElementById('canvas4') as HTMLCanvasElement;
const video = document.getElementById('video') as HTMLVideoElement;
const ctx2d = canvas4.getContext('2d');
canvas.addEventListener('touchstart', () => { return clock.getDelta(); }, {passive: true});

const renderer = new WebGLRenderer({
	canvas: canvas,
	// logarithmicDepthBuffer: true,
	antialias: false,
	alpha: true,
	powerPreference: 'high-performance',
	stencil: false
	// precision: isMobile ? 'mediump' : 'highp'
});
renderer.debug.checkShaderErrors = true;
// const magnify3d = new Magnify3d();
// const magnify3dTarget = new WebGLRenderTarget(0, 0); 

renderer.setClearColor(0x000000, 0);

// const squadScene = new Scene();
// const screenQuad = new ScreenQuad({
// 	width: 0.25,
// 	height: 0.25,
// 	top: '150px',
// 	left: '0px'
// })
// squadScene.add(screenQuad);

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
	return drawNormals || (debug || mapMap) && (computeNormals || dayNightCycle);
}

export function shouldRenderSky() 
{
	return dayNightCycle;
}

export function needsLights() 
{
	return debug || mapMap;
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
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.setMaterialValues({elevationDecoder: elevationDecoder});
		});
	}
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
		// if (currentPositionAltitude !== -1) 
		// {
		// 	setElevation(currentPositionAltitude, true);
		// }
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

	if (map) 
	{
		map.provider = createProvider();
		applyOnNodes((node) => 
		{
			node.isTextureReady = !debug;

			node.setMaterialValues({
				computeNormals: shouldComputeNormals(),
				drawTexture: (debug || mapMap) && drawTexture
			});
			// node.material.flatShading = (mapMap && !mapMapNormal);
		});
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
export function setMapMode(value, shouldRender = true) 
{
	if (mapMap === value) {return;}
	mapMap = value;
	outlinePass.enabled = !withoutOutline();
	mainPass.renderToScreen = !outlinePass.enabled;
	updateSky();
	if (map) 
	{
		map.provider = createProvider();
		applyOnNodes((node: MapNode) => 
		{
			if (mapMap && !(node.material['map'] && node.material['map'].image)) 
			{
				node.isTextureReady = false;
				node.initialize();
			}
			node.setMaterialValues({
				computeNormals: shouldComputeNormals(),
				drawTexture: (debug || mapMap) && drawTexture
			});
			// node.material.flatShading = (mapMap && !mapMapNormal);
		});
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
	if (map) 
	{
		map.provider = createProvider();
		applyOnNodes((node) => 
		{
			if (mapMap && !(node.material['map'] && node.material['map'].image)) 
			{
				node.isTextureReady = false;
				node.initialize();
			}
			node.setMaterialValues({
				computeNormals: shouldComputeNormals(),
				drawTexture: (debug || mapMap) && drawTexture
			});
		});
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
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.setMaterialValues({drawTexture: (debug || mapMap) && drawTexture});
		});
	}
	requestRenderIfNotRequested();
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
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.setMaterialValues({
				computeNormals: shouldComputeNormals(),
				drawTexture: (debug || mapMap) && drawTexture
			});
		});
	}
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
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.setMaterialValues({computeNormals: shouldComputeNormals()});

		});
	}
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
	ambientLight.visible = needsLights();
	ambientLight.intensity = computeNormals || dayNightCycle ? 0.1875 : 1;
	if (!sky) {return;}
	sky.visible = sunLight.visible = shouldRenderSky();
}
export function setDayNightCycle(value, shouldRender = true) 
{
	if (dayNightCycle === value) {return;}
	dayNightCycle = value;
	if (!sky) 
	{
		sky = createSky();
		scene.add(sky);
		sunLight = new SunLight(
			new Vector2(45.05, 25.47),
			new Vector3(0.0, 0.0, -1.0),
			new Vector3(1.0, 0.0, 0.0),
			new Vector3(0.0, -1.0, 0.0),
			0.001
		);
		camera.add(sunLight as any);
	}
	updateSky();
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.setMaterialValues({computeNormals: shouldComputeNormals()});
		});
	}
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
			// node.objectsHolder.visible = node.isVisible() && debugFeaturePoints;
			node.objectsHolder.visible = debugFeaturePoints && (node.isVisible() || node.level === map.maxZoomForObjectHolders && node.parentNode.subdivided);
			if (node.pointsMesh) 
			{
				node.pointsMesh.userData.forViewing.value = debugFeaturePoints;
			}
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

let datelabel, viewingDistanceLabel, selectedPeakLabel, selectedPeakDiv, elevationSlider, debugMapCheckBox, mapMapCheckBox, dayNightCycleCheckBox, debugGPUPickingCheckbox, readFeaturesCheckbox, debugFeaturePointsCheckbox, darkmodeCheckbox, wireframeCheckbox, mapoutlineCheckbox, depthMultiplierSlider, exagerationSlider, depthPostMultiplierSlider, depthBiaisSlider, dateSlider, viewingDistanceSlider, cameraCheckbox, normalsInDebugCheckbox, drawElevationsCheckbox, elevationLabel;

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

	dayNightCycleCheckBox = document.getElementById('dayNightCycle') as HTMLInputElement;
	dayNightCycleCheckBox.onchange = (event: any) => { return setDayNightCycle(event.target.checked); };
	dayNightCycleCheckBox.checked = dayNightCycle as any;

	debugGPUPickingCheckbox = document.getElementById('debugGPUPicking') as HTMLInputElement;
	debugGPUPickingCheckbox.onchange = (event: any) => { return setDebugGPUPicking(event.target.checked); };
	debugGPUPickingCheckbox.checked = debugGPUPicking as any;
	// canvas3.style.visibility = debugGPUPicking ? 'visible' : 'hidden';

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
	elevationSlider.value = elevation as any;

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

	const now = new Date();
	const secondsInDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
	dateSlider.oninput = (event: any) => { return setDate(event.target.value); };
	dateSlider.value = secondsInDay as any;
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
		// compass.style.transform = `rotateX(${90 - pitch}deg)`;
	}
}
function onControlUpdate(forceLOD = false) 
{
	updateLODThrottle(forceLOD);
	updateCompass();
	// if (window['nsWebViewBridge']) 
	// {
	// 	window['nsWebViewBridge'].emit('controls', {
	// 		// distance: controls.distance,
	// 		azim: controls.azimuthAngle * TO_DEG
	// 	});
	// }
	requestRenderIfNotRequested();
}
function setupLOD() 
{
	heightProvider.maxOverZoom = FORCE_MOBILE || isMobile?0:2;
	// lod.subdivideDistance = 60;
	// lod.simplifyDistance = 150;
	if (FORCE_MOBILE || isMobile) 
	{

		lod.subdivideDistance = 60;
		lod.simplifyDistance = 160;
	}
	else 
	{

		lod.subdivideDistance = 70;
		lod.simplifyDistance = 170;
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
	else if (debug && !drawNormals) 
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
function createMap() 
{	
	if (map !== undefined) 
	{
		scene.remove(map);
		clearCacheRecursive(map.root);
	}
	const provider = createProvider();
	map = new MapView(null, provider, heightProvider, false, requestRenderIfNotRequested);
	// map.lowMemoryUsage = isMobile;
	map.lowMemoryUsage = true;
	map.maxZoomForObjectHolders = 13;
	// map.setRoot(new MapQuantizedMeshHeightNode(null, map, MapNode.root, 0, 0, 0),{exageration:exageration});
	map.setRoot(new MaterialHeightShader(null, map, MapNode.root, 0, 0, 0));
	// map.setRoot(new MapMartiniHeightNode(null, map, MapNode.root, 0, 0, 0,{exageration:exageration, meshMaxError:(level)=>480 / level, elevationDecoder:elevationDecoder}));
	// map.setRoot(new MapDelatinHeightNode(null, map, MapNode.root, 0, 0, 0,{exageration:exageration, meshMaxError:(level)=>480 / level, elevationDecoder:elevationDecoder} ));
	map.lod = lod;
	map.updateMatrixWorld(true);
	scene.add(map);
	// renderer.shadowMap.type = PCFSoftShadowMap;
	// renderer.shadowMap.enabled = mapMap;

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
const camera = new PerspectiveCamera(cameraFOV, viewWidth / viewHeight, NEAR, FAR);
window.addEventListener('orientationchange', function(event: any)
{
	orientation = event.target.screen.orientation.type;
	camera.fov = cameraFOV = getCameraFOV();
	const hFOV = cameraFOV * viewWidth / viewHeight;
	camera.updateProjectionMatrix();
	controls.azimuthRotateSpeed = controls.polarRotateSpeed = cameraSpeedFactor() / zoom; // negative value to invert rotation direction
	updateCompass();
}, false);
camera.position.set(0, 0, EPS);
scene.add(camera);
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
controls.truckSpeed = 1 / EPS * 100000;
controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK;
controls.verticalDragToForward = true;
controls.saveState();
let keyboardMoveSpeed = 0.05;
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
		controls.truck(- keyboardMoveSpeed * event.deltaTime, 0, false);
		controls.update(event.deltaTime);
	});
	dKey.addEventListener('holding', function(event) 
	{
		controls.truck(keyboardMoveSpeed * event.deltaTime, 0, false);
		controls.update(event.deltaTime);
	});
	wKey.addEventListener('holding', function(event) 
	{
		controls.forward(keyboardMoveSpeed * event.deltaTime, false);
		controls.update(event.deltaTime);
	});
	sKey.addEventListener('holding', function(event) 
	{
		controls.forward(- keyboardMoveSpeed * event.deltaTime, false);
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
const ambientLight = new AmbientLight(0xffffff, 1);
scene.add(ambientLight);
ambientLight.intensity = computeNormals || dayNightCycle ? 0.1875 : 1;

// const fog = new Fog(0xffffff, camera.near, camera.far * 2);

// Adjust the directional light's shadow camera dimensions
// sunLight.directionalLight.shadow.camera.right = 30.0;
// sunLight.directionalLight.shadow.camera.left = -30.0;
// sunLight.directionalLight.shadow.camera.top = 30.0;
// sunLight.directionalLight.shadow.camera.bottom = -30.0;
// sunLight.directionalLight.shadow.camera.near = camera.near;
// sunLight.directionalLight.shadow.camera.far = camera.far;
// sunLight.directionalLight.shadow.mapSize.width = 512;
// sunLight.directionalLight.shadow.mapSize.height = 512;
// sunLight.directionalLight.castShadow = true;

// const axesHelper = new AxesHelper(50);
// scene.add( axesHelper );

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
export function setPosition(coords, animated = false, updateCtrls = true) 
{
	if (coords === currentPosition) 
	{
		return;
	}
	// axesHelper.position.set(newPosition.x, 1300, -newPosition.y - 1000);
	controls.getPosition(tempVector);
	const point = UnitsUtils.sphericalToDatums(tempVector.x, -tempVector.z);
	const currentCoords = {lat: point.latitude, lon: point.longitude};
	if (coords.lat === currentCoords.lat && coords.lon === currentCoords.lon) {return;}
	if (sky) 
	{
		sunLight.setPosition(coords.lat, coords.lon);
		sunLight.setDate(new Date());
		updateSkyPosition();
	}
	setSelectedItem(null);

	const newPosition = UnitsUtils.datumsToSpherical(coords.lat, coords.lon);
	if (animated) 
	{
		const distance = getDistance(currentCoords, coords);
		const startAimingAngle = controls.azimuthAngle * TO_DEG % 360;
		let endAimingAngle = -getRhumbLineBearing(currentCoords, coords);
		// if (Math.abs(topAimingAngle - 360 -startAimingAngle ) < Math.abs(topAimingAngle-startAimingAngle )) 
		// {
		// 	topAimingAngle -= 360;
		// }
		const startElevation = elevation * exageration;
		let endElevation = startElevation;
		if (coords.altitude) 
		{
			currentPositionAltitude = coords.altitude + 100;
			endElevation = currentPositionAltitude * exageration;
		}
		currentPosition = coords;
		// else 
		// {
		// 	currentPositionAltitude = -1;
		// }
		// always move to be "over" the peak
		const topElevation = distance > 100000 ? 11000 * exageration : endElevation;
		startAnimation({
			from: {...currentPosition, progress: 0},
			to: {...newPosition, progress: 1},
			duration: Math.min(distance / 20, 3000),
			preventComputeFeatures: true,
			onUpdate: (value) => 
			{
				const {progress, ...newPos} = value;
				currentPosition = newPos;
				if (progress <= 0.2) 
				{
					const cProgress = 5 * progress;
					// controls.azimuthAngle = (startAimingAngle + cProgress * (endAimingAngle - startAimingAngle)) * TO_RAD;
				}
				if (progress <= 0.5) 
				{
					const cProgress = 2 * progress;
					controls.moveTo(currentPosition.x, startElevation + cProgress * (topElevation - startElevation), -currentPosition.y, false);
				}
				else 
				{
					const cProgress = (progress - 0.5) * 2;
					controls.moveTo(currentPosition.x, topElevation + cProgress * (endElevation - topElevation), -currentPosition.y, false);
				}
				updateControls();
			},
			onEnd: () => 
			{
				setElevation(Math.round(endElevation / exageration), false);
				updateCurrentViewingDistance();
				if (window['nsWebViewBridge']) 
				{
					controls.getPosition(tempVector);
					const point = UnitsUtils.sphericalToDatums(tempVector.x, -tempVector.z);
					window['nsWebViewBridge'].emit('position', {...point, altitude: elevation});
				}
			}
		});
	}
	else 
	{
		if (coords.altitude) 
		{
			setElevation(coords.altitude, false);
		}
		currentPosition = newPosition;

		controls.moveTo(currentPosition.x, elevation * exageration + 30, -currentPosition.y, false);
		updateCurrentViewingDistance();
		if (updateCtrls) 
		{
			updateControls();
		}
	}
}
export function setElevation(newValue, updateCtrls = true) 
{
	if (typeof newValue === 'string') 
	{
		newValue = parseFloat(newValue);
	}
	if (elevation === newValue) {return;}
	elevation = newValue;
	controls.getTarget(tempVector);
	controls.moveTo(tempVector.x, elevation * exageration, tempVector.z);
	if (updateCtrls) 
	{
		updateControls();
	}
}
export function setExageration(newValue, shouldRender = true) 
{
	if (exageration === newValue) {return;}
	exageration = newValue;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.setMaterialValues({exageration: newValue});

			if (node.pointsMesh) 
			{
				node.pointsMesh.userData.exageration.value = newValue;
			}
		});
	}
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
	}
	if (datelabel) 
	{
		datelabel.innerText = date.toLocaleString();
	}

	updateSkyPosition();
	if (shouldRender) 
	{
		requestRenderIfNotRequested();
	}
}
let lastPosition;
let updateExternalPosition;
export function setUpdateExternalPositionThrottleTime(value) 
{
	updateExternalPosition = throttle(function() 
	{
		controls.getPosition(tempVector);
		const point = UnitsUtils.sphericalToDatums(tempVector.x, -tempVector.z);
		if (!lastPosition || lastPosition.latitude !== point.latitude || lastPosition.longitude !== point.longitude) 
		{
			// console.log('updateExternalPosition')
			lastPosition = point;
			if (window['electron']) 
			{
				const ipcRenderer = window['electron'].ipcRenderer;
				ipcRenderer.send('message', {...lastPosition, altitude: elevation});
			}
			if (window['nsWebViewBridge']) 
			{
				window['nsWebViewBridge'].emit('position', {...lastPosition, altitude: elevation});
			}
		}
	}, value);
}
setUpdateExternalPositionThrottleTime(100);
controls.addEventListener('update', () => 
{
	if (!animating) 
	{
		updateExternalPosition();
	}
	onControlUpdate();
});
let lastFinalPosition;
controls.addEventListener('controlend', () => 
{
	updateLODThrottle();
	controls.getPosition(tempVector);
	const point = UnitsUtils.sphericalToDatums(tempVector.x, -tempVector.z);
	if (!lastFinalPosition || lastFinalPosition.latitude !== point.latitude || lastFinalPosition.longitude !== point.longitude || lastFinalPosition.altitude !== elevation ) 
	{
		lastFinalPosition = {...point, altitude: elevation};
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
		// scene.remove(map)
		super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
		// scene.add(map)
		map.visible = true;
	}
}
const mainPass = new POSTPROCESSING.RenderPass(scene, camera);
composer.addPass(mainPass);
mainPass.renderToScreen = true;
// const peaksPass = new PeaksPass();
// composer.addPass(peaksPass);
// peaksPass.renderToScreen = true;
// mainPass.clear = false;
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
	const depthTexture = composer.depthTexture;
	applyOnNodes((node) => 
	{
		const visible = node.isVisible();
		if (visible) 
		{
			node.wasVisible = visible;
			node.hide();
		}
		node.objectsHolder.visible = visible || node.level === map.maxZoomForObjectHolders && node.parentNode.subdivided;
		if (node.pointsMesh) 
		{
			node.pointsMesh.userData.depthTexture.value = depthTexture;
			node.pointsMesh.userData.forViewing.value = debugFeaturePoints;
		}
	});
	if (debugFeaturePoints) 
	{
		renderer.render(scene, camera);
		applyOnNodes((node) => 
		{
			if (node.pointsMesh) 
			{
				node.pointsMesh.userData.forViewing.value = false;
			}
		});
	}
	renderer.setRenderTarget(pointBufferTarget);
	renderer.clear();
	renderer.render(scene, camera);
	renderer.setRenderTarget(null);
	readShownFeatures();

	applyOnNodes((node) => 
	{
		if (node.wasVisible) 
		{
			delete node.wasVisible;
			node.show();
		}
		node.objectsHolder.visible = node.isVisible() && debugFeaturePoints || node.level === map.maxZoomForObjectHolders && node.parentNode.subdivided;
		if (node.pointsMesh) 
		{
			node.pointsMesh.userData.depthTexture.value = null;
		}

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
		offWidth = FORCE_MOBILE || isMobile ? 200: 400;
		offHeight = Math.round(offWidth / scale);
	}
	else 
	{
		offHeight = FORCE_MOBILE || isMobile ? 200: 400;
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
	if (!map) 
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
	// if (node.isVisible()) 
	// {
	cb(node);
	// }
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
function applyOnVisibleNode(node, cb) 
{
	if (node.isVisible()) 
	{
		cb(node);
	}
	node.children.forEach((n) => 
	{
		if (n instanceof MapNode) 
		{
			applyOnVisibleNode(n, cb);
		}
	});
	if (node.childrenCache) 
	{
		node.childrenCache.forEach((n) => 
		{
			if (n instanceof MapNode) 
			{
				applyOnVisibleNode(n, cb);
			}
		});
	}
}
function applyOnNodes(cb) 
{
	applyOnNode(map.children[0], cb);
}
function applyOnVisibleNodes(cb) 
{
	applyOnVisibleNode(map.children[0], cb);
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
	const point1 = UnitsUtils.sphericalToDatums(currentPosition.x, currentPosition.y);
	const point2 = {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele};
	const distance = getDistance(point1, point2);
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
			const point1 = UnitsUtils.sphericalToDatums(tempVector.x, -tempVector.z);
			const point2 = {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele};
			distance = getDistance(point1, point2);
		}

		window['nsWebViewBridge'].emit('selected', selectedItem ? {...selectedItem, distance: distance} : null);
	}
}
function setSelectedItem(f) 
{
	// console.log('setSelectedItem', f);
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
		const point1 = UnitsUtils.sphericalToDatums(tempVector.x, -tempVector.z);
		const point2 = {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0]};
		const angle = 360 - getRhumbLineBearing({lat: point1.latitude, lon: point1.longitude}, point2);
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

function getDistanceToMouse(f) {
	return Math.sqrt(Math.pow(mousePosition.x - f.x, 2) + Math.pow(mousePosition.y - f.y, 2))
}
function drawFeatures() 
{
	if (!readFeatures || !drawLines || animating) 
	{
		return;
	}

	const minDistance = 44;
	const featuresGroupedX = new Array(viewWidth);
	let lastX = 0;
	// console.log('featuresToShow', featuresToShow.findIndex((f) => {return f.properties.name.startsWith('Monte Bianco');}) );
	featuresToShow.forEach((f) => 
	{
		const coords = UnitsUtils.datumsToSpherical(f.geometry.coordinates[1], f.geometry.coordinates[0]);
		tempVector.set(coords.x, (f.properties.ele || 0) * exageration, -coords.y);
		const vector = toScreenXY(tempVector);
		const x = Math.floor(vector.x);
		const y = vector.y;
		const z = vector.z;
		if (y < TEXT_HEIGHT || z > FAR + 1000 || z / f.properties.ele > FAR / 3000) 
		{
			return;
		}
		lastX = Math.max(lastX, x);
		const array = featuresGroupedX[x] = featuresGroupedX[x] || [];
		array.push({...f, x: x, y: y, z: z});
	});
	const featuresToDraw = [];
	let windowStartX = 0;
	while (windowStartX < lastX) 
	{
		const array = featuresGroupedX.slice(windowStartX, windowStartX + minDistance).filter((s) => {return Boolean(s);}).flat();
		if (array.length === 0) 
		{
			windowStartX += minDistance;
			continue;
		}
		let nextFeature;
		if (mousePosition && mousePosition.x >=windowStartX && mousePosition.x <= windowStartX + minDistance) 
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
			// console.log('test', array.findIndex((f) => {return f.properties.name.startsWith('Monte Bianco');}), array)
			nextFeature = array.reduce((p, c) => {return p.properties.ele > c.properties.ele ? p : c;});
		}
		windowStartX = nextFeature.x + minDistance;
		featuresToDraw.push(nextFeature);
	}

	// console.log('featuresToDraw', featuresToDraw );
	drawFeaturesLabels(featuresToDraw);

}

const labelFontSize = 15;
function drawFeaturesLabels(featuresToDraw: any[]) 
{
	const screenRatio = devicePixelRatio;
	const toShow = featuresToDraw.length;
	ctx2d.save();
	ctx2d.clearRect(0, 0, canvas4.width, canvas4.height);
	ctx2d.scale(screenRatio, screenRatio);
	const rectTop = -16;
	const rectBottom = 21;

	const textColor = darkTheme ? 'white' : 'black';
	const color = darkTheme ? '#000000' : '#ffffff';
	const textRotation = -Math.PI / 4;
	const textMaxWidth = Math.round(TEXT_HEIGHT / Math.cos(textRotation) - 20);
	for (let index = 0; index < toShow; index++) 
	{
		const f = featuresToDraw[index];
		// const y = f.screenY ?? f.y;
		const y = f.y;
		// if (y < TEXT_HEIGHT || f.z >= FAR || f.z / f.properties.ele > FAR / 3000) 
		// {
		// 	continue;
		// }

		ctx2d.beginPath();
		ctx2d.strokeStyle = textColor;
		ctx2d.moveTo(f.x, TEXT_HEIGHT);
		ctx2d.lineTo(f.x, y);
		ctx2d.closePath();
		ctx2d.stroke();
		ctx2d.save();
		ctx2d.translate(f.x, TEXT_HEIGHT);
		ctx2d.rotate(textRotation);
		if (selectedItem && isSelectedFeature(f)) 
		{
			ctx2d.font = `bold ${labelFontSize}px Noto Sans`;
		}
		else 
		{
			ctx2d.font = `${labelFontSize}px Noto Sans`;
		}
		const text = f.properties.name;
		const realTextWidth = ctx2d.measureText(text).width;
		const textWidth = Math.min(realTextWidth, textMaxWidth);
		let wrapValues = {y: drawElevations?labelFontSize:0, x: 0};
		if (realTextWidth !== textWidth) 
		{
			wrapValues = wrapText(ctx2d, text, 5, 0, textWidth, labelFontSize, true);
		}
		let totalWidth = textWidth + 10;
		let text2;
		if (drawElevations) 
		{
			text2 = f.properties.ele + 'm';
			const textWidth2 = ctx2d.measureText(text2).width;
			totalWidth += textWidth2 - 5;
		}
		if (mousePosition) 
		{
			const transform = ctx2d.getTransform().inverse();
			var point = new DOMPoint(mousePosition.x * screenRatio, mousePosition.y * screenRatio);
			const test = point.matrixTransform(transform);
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
	const height = offHeight;
	// const hScale = viewHeight / height;
	// const lineWidth = 4 * width;
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
				// const y = viewHeight - Math.floor((pixelIndex - 4) / lineWidth) * hScale;
				const result = {...feature/* , color: lastColor, minColorY: y, maxColorY: y */};
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
			// const y = viewHeight - Math.floor((pixelIndex - 4) / lineWidth) * hScale;
			// result.minColorY = Math.min(y, result.minColorY || 10000000);
			// result.maxColorY = Math.max(y, result.maxColorY || -10000000);
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
	// if (needsSelectedItem) 
	// {
	// 	rFeatures.push({...selectedItem, screenY: null});
	// }
	featuresToShow = rFeatures;
}

function withoutOutline() 
{
	return (debug || mapMap) && !mapoutline;
}
function actualRender(forceComputeFeatures) 
{

	// }
	// applyOnNodes((node) =>
	// {

	// 	node.objectsHolder.visible = debugFeaturePoints && (node.isVisible() || node.level === 14 && node.parentNode.subdivided);
	// 	if (node.pointsMesh) 
	// 	{
	// 		node.pointsMesh.material.uniforms.forViewing.value = debugFeaturePoints;
	// 	}
	// });

	// if (withoutComposer()) 
	// {
	// 	renderer.render(scene, camera);
	// }
	// else 
	// {
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
	// screenQuad.material.uniforms.uTexture.value = composer.depthTexture;
	// screenQuad.material.uniforms.cameraNear.value = camera.near;
	// screenQuad.material.uniforms.cameraFar.value = camera.far;
	// renderer.render(squadScene, camera)
	// }
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
	// render();
	if (!renderRequested) 
	{
		renderRequested = true;
		requestAnimationFrame(render);
	}
}
export function render() 
{
	renderRequested = false;
	if (!renderer || !composer) 
	{
		return;
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
		callMethods({'setPosition': {'lat': 45.1811, 'lon': 5.8141, 'altitude': 2144}, 'setAzimuth': -27.93156443585889, 'setDarkMode': false, 'setMapMode': false, 'setMapOultine': false, 'setDayNightCycle': false, 'setDrawElevations': true, 'setViewingDistance': 173000, 'setCameraFOVFactor': 28.605121612548828, 'setDate': 71001, 'setDebugMode': false, 'setReadFeatures': true, 'setShowStats': true, 'setWireFrame': false, 'setDebugGPUPicking': false, 'setDebugFeaturePoints': false, 'setComputeNormals': false, 'setNormalsInDebug': false, 'setExageration': 1.622511863708496, 'setDepthBiais': 0.44782665371894836, 'setDepthMultiplier': 110.65267944335938, 'setDepthPostMultiplier': 0.9277091026306152});
	};
	
	// setElevation(500, false);
	// controls.azimuthAngle = -86 * Math.PI / 180;
	// setInitialPosition();
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
	camera.near = NEAR;
}
export function setViewingDistance(meters: number, shouldRender = true) 
{
	if (FAR === meters) {return;}
	// updateCurrentViewingDistance();
	FAR = meters;
	// FAR = meters / currentViewingDistance * FAR;
	camera.far = FAR;
	camera.updateProjectionMatrix();
	updateCurrentViewingDistance();

	if (map) 
	{
		applyOnNodes((node) => 
		{
			if (node.pointsMesh) 
			{
				node.pointsMesh.userData.cameraFar.value = camera.far;
			}
		});
	}
	if (shouldRender) 
	{
		requestRenderIfNotRequested(true);
	}
}

export function callMethods(json) 
{
	try 
	{
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

	var farPoint = new Vector3(0, 0, -camera.far);
	farPoint.applyMatrix4(camera.matrixWorld);
	const point1 = UnitsUtils.sphericalToDatums(currentPosition.x, currentPosition.y);
	const point2 = UnitsUtils.sphericalToDatums(farPoint.x, -farPoint.z);
	return getDistance(point1, point2);
}
