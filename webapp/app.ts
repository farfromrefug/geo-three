/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import CameraControls from 'camera-controls';
import Stats from 'stats.js';

import * as THREE from 'three';
import Magnify3d from './Magnify3d';

// @ts-ignore
window.THREE = THREE;

import {DeviceOrientationControls} from 'three/examples/jsm/controls/DeviceOrientationControls';
import {Sky} from 'three/examples/jsm/objects/Sky';
import * as POSTPROCESSING from 'postprocessing';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {MapView} from '../source/MapView';
import {MapNode} from '../source/nodes/MapNode';
import {MapMartiniHeightNode} from '../source/nodes/MapMartiniHeightNode';
import {DebugProvider} from '../source/providers/DebugProvider';
import {LODFrustum} from '../source/lod/LODFrustum';
import {EmptyProvider} from './EmptyProvider';
import {MaterialHeightShader} from './MaterialHeightShader';
import {LocalHeightProvider} from './LocalHeightProvider';
import RasterMapProvider from './RasterMapProvider';
import {OpenStreetMapsProvider} from '../source/providers/OpenStreetMapsProvider';
import {SunLight} from './SunLight';


class CustomOutlineEffect extends POSTPROCESSING.Effect 
{
	constructor() 
	{
		super(
			'CustomEffect',
			`
		uniform vec3 weights;
		uniform vec3 outlineColor;
		uniform vec2 multiplierParameters;

		float readZDepth(vec2 uv) {
			return viewZToOrthographicDepth( getViewZ(readDepth(uv)), cameraNear, cameraFar );
		}
		void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {

			// outputColor = vec4(inputColor.rgb * weights, inputColor.a);
			// outputColor = vec4(vec3(viewZToOrthographicDepth( getViewZ(depth), cameraNear, cameraFar )), 1.0);
			float depthDiff = 0.0;
			float zdepth = viewZToOrthographicDepth( getViewZ(depth), cameraNear, cameraFar );
			// depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(1, 0)));
			depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(-1, 0)));
			depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(0, 1)));
			// depthDiff += abs(zdepth - readZDepth(uv + texelSize * vec2(0, -1)));
			depthDiff = depthDiff /depth;
			depthDiff = depthDiff * multiplierParameters.y;
			depthDiff = pow(depthDiff, multiplierParameters.x);
			// Combine outline with scene color.
			vec4 outlineColor = vec4(outlineColor, 1.0);
			outputColor = vec4(mix(inputColor, outlineColor, depthDiff));
		}
`,
			{
				attributes: POSTPROCESSING.EffectAttribute.DEPTH,
				uniforms: new Map([
					['outlineColor', new THREE.Uniform(new THREE.Color(darkTheme ? 0xffffff : 0x000000))],
					['multiplierParameters', new THREE.Uniform(new THREE.Vector2(depthBiais, depthMultiplier))]
					// ['multiplierParameters', new THREE.Uniform(new THREE.Vector2(1, 40))]
				])
			}
		);
	}
}

CameraControls.install({THREE: THREE});
// @ts-ignore
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);

function throttle (callback, limit) {
    var waiting = false;                      // Initially, we're not waiting
    return function () {                      // We return a throttled function
        if (!waiting) {                       // If we're not waiting
            callback.apply(this, arguments);  // Execute users function
            waiting = true;                   // Prevent future invocations
            setTimeout(function () {          // After a period of time
                waiting = false;              // And allow future invocations
            }, limit);
        }
    }
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
const devicePixelRatio = window.devicePixelRatio; // Change to 1 on retina screens to see blurry canvas.

export let debug = false;
export let mapMap = false;
export let drawTexture = true;
export let computeNormals = true;
export let debugFeaturePoints = false;
export let wireframe = false;
export let dayNightCycle = false;
let debugGPUPicking = false;
let readFeatures = true;
let drawLines = true;
let drawElevations = false;
let darkTheme = false;
export let drawNormals = false;
let featuresToShow = [];
const tempVector = new THREE.Vector3(0, 0, 0);
export let exageration = 1.7;
export let depthBiais =0.6;
export let depthMultiplier =30;
export const featuresByColor = {};
// export let elevationDecoder = [6553.6 * 255, 25.6 * 255, 0.1 * 255, -10000];
export let elevationDecoder = [256* 255, 255, 1 / 256* 255, -32768];
const FAR = 200000;
const TEXT_HEIGHT = 180;
let currentPosition;
let elevation = 1000;
const clock = new THREE.Clock();
let renderingIndex = -1;
const position = {lat: 45.19177, lon: 5.72831};
let map;
// updSunPos(45.16667, 5.71667);
const EPS = 1e-5;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let pixelsBuffer;
const AA = devicePixelRatio <= 1;
let showingCamera = false;
let showMagnify = false;
let mousePosition = new THREE.Vector2();

export function shouldComputeNormals() {
	return  drawNormals || ((debug || mapMap) && (computeNormals && dayNightCycle));
}

export function shouldRenderSy() {
	return  ((debug || mapMap) && dayNightCycle);
}

export function needsLights() {
	return  (debug || mapMap);
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
			node.material.userData.elevationDecoder.value = elevationDecoder;
		});
	}
}

setTerrarium(false);
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const canvas3 = document.getElementById('canvas3') as HTMLCanvasElement;
const canvas4 = document.getElementById('canvas4') as HTMLCanvasElement;
const video = document.getElementById('video') as HTMLVideoElement;
const ctx2d = canvas4.getContext('2d');

const renderer = new THREE.WebGLRenderer({
	canvas: canvas,
	// logarithmicDepthBuffer: true,
	antialias: AA,
	alpha: true,
	powerPreference: 'high-performance',
	stencil: false
	// depth: false
	// precision: isMobile ? 'mediump' : 'highp'
});
const magnify3d = new Magnify3d();
const magnify3dTarget = new THREE.WebGLRenderTarget(0, 0); 

renderer.setClearColor(0x000000, 0);
const rendereroff = new THREE.WebGLRenderer({
	canvas: canvas3,
	antialias: false,
	alpha: false,
	powerPreference: 'high-performance',
	stencil: false
	// precision: isMobile ? 'mediump' : 'highp'
});
const pointBufferTarget = new THREE.WebGLRenderTarget(0, 0);
pointBufferTarget.texture.minFilter = THREE.NearestFilter;
pointBufferTarget.texture.magFilter = THREE.NearestFilter;
pointBufferTarget.texture.generateMipmaps = false;
pointBufferTarget.stencilBuffer = false;
// pointBufferTarget.texture.format = THREE.RGBFormat;

function createSky() 
{
	// Add Sky
	const sky = new Sky();
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

	const sun = new THREE.Vector3();
	sun.x = Math.cos(phi);
	sun.y = Math.sin(phi) * Math.sin(theta);
	sun.z = Math.sin(phi) * Math.cos(theta);
	uniforms['sunPosition'].value.copy(sun);

	return sky;
}

const scene = new THREE.Scene();
const sky = createSky();
scene.add(sky);
let devicecontrols;
let listeningForDeviceSensors = false;

function onSensorUpdate() 
{
	if (!listeningForDeviceSensors) 
	{
		return;
	}

	devicecontrols && devicecontrols.update();
	onControlUpdate();
}

export function toggleDeviceSensors() 
{
	if (!listeningForDeviceSensors) 
	{
		listeningForDeviceSensors = true;
		devicecontrols = new DeviceOrientationControls(camera);
		devicecontrols.alphaOffset = Math.PI;
		window.addEventListener('orientationchange', onSensorUpdate);
		window.addEventListener('deviceorientation', onSensorUpdate);
	}
	else 
	{
		window.removeEventListener('orientationchange', onSensorUpdate);
		window.removeEventListener('deviceorientation', onSensorUpdate);
		listeningForDeviceSensors = false;
		if (devicecontrols) 
		{
			devicecontrols.dispose();
			devicecontrols = null;
		}
		controls.polarAngle = 0;
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
				// video.play();
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

export function setDebugMode(value) 
{
	debug = value;
	setupLOD();

	sky.visible = sunLight.visible = shouldRenderSy();
	ambientLight.visible = needsLights();
	if (map) {
		map.provider = createProvider();
		applyOnNodes((node) => 
		{
			node.isTextureReady = !debug;
			node.material.userData.computeNormals.value = shouldComputeNormals();
			node.material.userData.drawTexture.value = (debug || mapMap) && drawTexture;
			// node.material.flatShading = (mapMap && !mapMapNormal);
		});
		onControlUpdate();
	}
}

export function toggleDebugMode() 
{
	setDebugMode(!debug);
}
export function setMapMode(value) 
{
	mapMap = value;
	
	sky.visible = sunLight.visible = shouldRenderSy();
	ambientLight.visible = needsLights();
	setupLOD();
	if (map) {
		map.provider = createProvider();
		applyOnNodes((node) => 
		{
			node.isTextureReady = false;
			node.material.userData.computeNormals.value = shouldComputeNormals();
			node.material.userData.drawTexture.value = (debug || mapMap) && drawTexture;
			// node.material.flatShading = (mapMap && !mapMapNormal);
		});
		onControlUpdate();
	}
	// createMap();
	// onControlUpdate();
}

export function toggleMapMode() 
{
	setMapMode(!mapMap);
}
export function setMapModeNormals(value) 
{
	let oldVal = mapMap && !computeNormals;
	computeNormals = value;
	if (map) 
	{
		let newVal = mapMap && !computeNormals;
		applyOnNodes((node) => 
		{
			node.material.userData.computeNormals.value = shouldComputeNormals();
			// node.material.flatShading = newVal;
			// node.material.needsUpdate = newVal !== oldVal;
			
		});
	}
	render();
}

export function toggleMapModeNormals() 
{
	setMapModeNormals(!computeNormals);
}
export function setDrawTexture(value) 
{
	drawTexture = value;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.material.userData.drawTexture.value = (debug || mapMap) && drawTexture;
		});
	}
	render();
}

export function toggleDrawTexture() 
{
	setDrawTexture(!drawTexture);
}
export function toggleNormalsInDebug() 
{
	setNormalsInDebug(!drawNormals);
}
export function setNormalsInDebug(value) 
{
	drawNormals = value;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.material.userData.computeNormals.value = shouldComputeNormals();
			node.material.userData.drawNormals.value = drawNormals;
		});
	}
	render();
}
export function setDayNightCycle(value) 
{
	dayNightCycle = value;
	sky.visible = sunLight.visible = shouldRenderSy();
	ambientLight.intensity = value ? 0.1875 : 1;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.material.userData.computeNormals.value = shouldComputeNormals();
		});
	}
	render();
}
export function toggleDayNightCycle() 
{
	setDayNightCycle(!dayNightCycle);
}
export function setDebugGPUPicking(value) 
{
	debugGPUPicking = value;
	canvas3.style.visibility = debugGPUPicking ? 'visible' : 'hidden';
	render();
}
export function toggleDebugGPUPicking() 
{
	setDebugGPUPicking(!debugGPUPicking);
}
export function setReadFeatures(value) 
{
	readFeatures = value;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	render();
}
export function toggleReadFeatures() 
{
	setReadFeatures(!readFeatures);
}
export function setDrawLines(value) 
{
	drawLines = value;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	render();
}
export function toggleDrawLines() 
{
	setDrawLines(!drawLines);
}
export function setDebugFeaturePoints(value) 
{
	debugFeaturePoints = value;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.objectsHolder.visible = debugFeaturePoints;
		});
	}
	render();
}
export function toggleDebugFeaturePoints() 
{
	setDebugFeaturePoints(!debugFeaturePoints);
}
export function setDarkMode(value) 
{
	darkTheme = value;
	outlineEffect.uniforms.get('outlineColor').value.set(darkTheme ? 0xffffff : 0x000000);
	document.body.style.backgroundColor = (darkTheme) ? 'black' : 'white';
	render();
}
export function toggleDarkMode() 
{
	setDarkMode(!darkTheme);
}
export function setWireFrame(value) 
{
	wireframe = value;
	applyOnNodes((node) => 
		{
			node.material.wireframe = wireframe;
		});
	render();
}
export function toggleWireFrame() 
{
	setWireFrame(!wireframe);
}

export function setDrawElevations(value) 
{
	drawElevations = value;
	render();
}
export function toggleDrawElevations() 
{
	setDrawElevations(!drawElevations);
	render();
}

export function toggleCamera() 
{
	if (showingCamera) 
	{
		video.pause();
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

let datelabel;
try 
{
	document.body.style.backgroundColor = (darkTheme || mapMap) ? 'black' : 'white';
	const debugMapCheckBox = document.getElementById('debugMap') as HTMLInputElement;
	debugMapCheckBox.onchange = (event: any) => {return setDebugMode(event.target.checked);};
	debugMapCheckBox.value = debug as any;
	
	
	const mapMapCheckBox = document.getElementById('mapMap') as HTMLInputElement;
	mapMapCheckBox.onchange = (event: any) => {return setMapMode(event.target.checked);};
	mapMapCheckBox.checked = mapMap as any;

	const mapModeNormalsCheckBox = document.getElementById('mapModeNormals') as HTMLInputElement;
	mapModeNormalsCheckBox.onchange = (event: any) => {return setMapModeNormals(event.target.checked);};
	mapModeNormalsCheckBox.checked = computeNormals as any;
	
	const dayNightCycleCheckBox = document.getElementById('dayNightCycle') as HTMLInputElement;
	dayNightCycleCheckBox.onchange = (event: any) => {return setDayNightCycle(event.target.checked);};
	dayNightCycleCheckBox.checked = dayNightCycle as any;
	
	const debugGPUPickingCheckbox = document.getElementById('debugGPUPicking') as HTMLInputElement;
	debugGPUPickingCheckbox.onchange = (event: any) => {return setDebugGPUPicking(event.target.checked);};
	debugGPUPickingCheckbox.checked = debugGPUPicking as any;
	canvas3.style.visibility = debugGPUPicking ? 'visible' : 'hidden';
	
	const readFeaturesCheckbox = document.getElementById('readFeatures') as HTMLInputElement;
	readFeaturesCheckbox.onchange = (event: any) => {return setReadFeatures(event.target.checked);};
	readFeaturesCheckbox.checked = readFeatures as any;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	
	const drawLinesCheckbox = document.getElementById('drawLines') as HTMLInputElement;
	drawLinesCheckbox.onchange = (event: any) => {return setDrawLines(event.target.checked);};
	drawLinesCheckbox.checked = drawLines as any;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	
	const debugFeaturePointsCheckbox = document.getElementById('debugFeaturePoints') as HTMLInputElement;
	debugFeaturePointsCheckbox.onchange = (event: any) => {return setDebugFeaturePoints(event.target.checked);};
	debugFeaturePointsCheckbox.checked = debugFeaturePoints as any;
	
	const darkmodeCheckbox = document.getElementById('darkmode') as HTMLInputElement;
	darkmodeCheckbox.onchange = (event: any) => {return setDarkMode(event.target.checked);};
	darkmodeCheckbox.checked = darkTheme as any;
	const wireframeCheckbox = document.getElementById('wireframe') as HTMLInputElement;
	wireframeCheckbox.onchange = (event: any) => {return setWireFrame(event.target.checked);};
	wireframeCheckbox.checked = wireframe as any;
	
	const elevationSlider = document.getElementById('elevationSlider') as HTMLInputElement;
	elevationSlider.oninput = (event: any) => {return setElevation(event.target.value);};
	elevationSlider.value = elevation as any;
	
	const exagerationSlider = document.getElementById('exagerationSlider') as HTMLInputElement;
	exagerationSlider.oninput = (event: any) => {return setExageration(event.target.value);};
	exagerationSlider.value = exageration as any;
	const depthMultiplierSlider = document.getElementById('depthMultiplierSlider') as HTMLInputElement;
	depthMultiplierSlider.oninput = (event: any) => {return setDepthMultiplier(event.target.value);};
	depthMultiplierSlider.value = depthMultiplier as any;
	const depthBiaisSlider = document.getElementById('depthBiaisSlider') as HTMLInputElement;
	depthBiaisSlider.oninput = (event: any) => {return setDepthBiais(event.target.value);};
	depthBiaisSlider.value = depthBiais as any;
	
	const now = new Date();
	const secondsInDay = now.getHours() * 3600 + now.getMinutes()* 60 + now.getSeconds();
	
	const dateSlider = document.getElementById('dateSlider') as HTMLInputElement;
	dateSlider.oninput = (event: any) => {return setDate(event.target.value);};
	dateSlider.value = secondsInDay as any;
	datelabel = document.getElementById('dateLabel') as HTMLLabelElement;
	datelabel.innerText = new Date().toLocaleString();
	
	const cameraCheckbox = document.getElementById('camera') as HTMLInputElement;
	cameraCheckbox.onchange = (event: any) => {return toggleCamera();};
	cameraCheckbox.value = showingCamera as any;
	
	const drawElevationsCheckbox = document.getElementById('drawElevations') as HTMLInputElement;
	drawElevationsCheckbox.onchange = (event: any) => {return toggleDrawElevations();};
	drawElevationsCheckbox.value = drawElevations as any;
	
	const normalsInDebugCheckbox = document.getElementById('normalsInDebug') as HTMLInputElement;
	normalsInDebugCheckbox.onchange = (event: any) => {return toggleNormalsInDebug();};
	normalsInDebugCheckbox.value = drawNormals as any;
}
catch (err) {}

const heightProvider = new LocalHeightProvider();

function onControlUpdate() 
{	
	map.lod.updateLOD(map, camera, renderer, scene);
	render();
}
function setupLOD() {
	heightProvider.maxOverZoom = debug || mapMap ? 1: 0;
	// if (debug || mapMap){
	// 	lod.subdivideDistance = 100;
	// 	lod.simplifyDistance = 230;
	// } else {
		lod.subdivideDistance = 40;
		lod.simplifyDistance = 140;
	// }
}
const lod = new LODFrustum();
setupLOD();
function createProvider() {
	let provider;
	if (mapMap) 
	{
		provider = new RasterMapProvider();
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
	provider.maxZoom = 11 + heightProvider.maxOverZoom;
	provider.zoomDelta = 2 ;
	return provider;
}

function createMap() 
{
	if (map !== undefined)
	{
		scene.remove(map);
	}
	const provider = createProvider();
	map = new MapView(null, provider, heightProvider, false, render);
	map.setRoot(new MaterialHeightShader(null, map, MapNode.ROOT, 0, 0, 0));
	// map.setRoot(new MapMartiniHeightNode(null, map, MapNode.ROOT, 0, 0, 0));
	map.lod = lod;
	map.updateMatrixWorld(true);
	scene.add(map);
	// renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	// renderer.shadowMap.enabled = mapMap;

}

createMap();

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 100, FAR);
camera.position.set(0, 0, EPS);
const controls = new CameraControls(camera, canvas);
controls.azimuthRotateSpeed = -0.15; // negative value to invert rotation direction
controls.polarRotateSpeed = -0.15; // negative value to invert rotation direction
controls.minZoom = 1;
controls.minDistance = -10000;
controls.maxDistance = 1000;
// controls.dollyToCursor = true;
controls.truckSpeed = 1 / EPS * 30000;
controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK;
controls.verticalDragToForward = true;
controls.saveState();


const sunLight = new SunLight(
	new THREE.Vector2( 45.05, 25.47 ),
	new THREE.Vector3( 0.0, 0.0, -1.0 ),
	new THREE.Vector3( 1.0, 0.0, 0.0 ),
	new THREE.Vector3( 0.0, -1.0, 0.0 ),
	0.001
);
camera.add( sunLight as any );
// camera.add( sunLight.directionalLight );
// Add an ambient light
const ambientLight = new THREE.AmbientLight( 0xffffff, 1)
scene.add( ambientLight );
scene.add(camera );
sky.visible = sunLight.visible = shouldRenderSy();
ambientLight.visible = needsLights();


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

// const axesHelper = new THREE.AxesHelper( 50 );
// scene.add( axesHelper );

function updateSky() 
{
	const phi = Math.PI /2 - sunLight.elevation;
	const theta = Math.PI - sunLight.azimuth;
	const sun = new THREE.Vector3();
	sun.setFromSphericalCoords( 1, phi, theta );

	sky.material.uniforms['sunPosition'].value.copy( sun );
}
export function setPosition(coords) 
{

	currentPosition = UnitsUtils.datumsToSpherical(coords.lat, coords.lon);
	// axesHelper.position.set(currentPosition.x, 1300, -currentPosition.y - 1000);
	sunLight.setPosition(coords.lat, coords.lon);
	sunLight.setDate(new Date());
	updateSky();

	if (coords.altitude) 
	{
		elevation = coords.altitude;
	}
	controls.moveTo(currentPosition.x, elevation * exageration, -currentPosition.y);
	controls.update(clock.getDelta());
}
export function setElevation(newValue) 
{
	elevation = newValue;
	controls.getTarget(tempVector);
	controls.moveTo(tempVector.x, elevation * exageration, tempVector.z);
	controls.update(clock.getDelta());
}
export function setExageration(newValue) 
{
	exageration = newValue;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.material.userData.exageration.value = exageration;
			if (node.objectsHolder && node.objectsHolder.children.length > 0) 
			{
				node.objectsHolder.children[0].material.uniforms.exageration.value = exageration;

			}
		});
	}
	render();
}
export function setDepthBiais(newValue) 
{
	depthBiais = newValue;
	outlineEffect.uniforms.get('multiplierParameters').value.set(depthBiais, depthMultiplier);
	render();
}
export function setDepthMultiplier(newValue) 
{
	depthMultiplier = newValue;
	outlineEffect.uniforms.get('multiplierParameters').value.set(depthBiais, depthMultiplier);
	render();
}


function setDate(secondsInDay) 
{
	let date = new Date();
	const hours = Math.floor(secondsInDay/3600);
	const minutes = Math.floor((secondsInDay - hours*3600)/ 60);
	const seconds = secondsInDay - hours*3600 - minutes*60;
	date.setHours(hours);
	date.setMinutes(minutes);
	date.setSeconds(seconds);
	sunLight.setDate(date);
	datelabel.innerText = date.toLocaleString();

	updateSky();
	render();
} 
controls.addEventListener('update', () => 
{
	onControlUpdate();
});
controls.addEventListener('control', () => 
{
	const delta = clock.getDelta();
	controls.update(delta);
});
const composer = new POSTPROCESSING.EffectComposer(renderer);
composer.addPass(new POSTPROCESSING.RenderPass(scene, camera));
const outlineEffect = new CustomOutlineEffect();
composer.addPass(new POSTPROCESSING.EffectPass(camera, outlineEffect));

let minYPx = 0;

const computeFeatures = throttle(function(){
	sky.visible = false;
	sunLight.visible = false;
	ambientLight.visible = false;


	applyOnNodes((node) => 
	{
		node.material.userData.drawBlack.value = true;
		node.material.userData.computeNormals.value = false;
		node.objectsHolder.visible = true;
	});
	if (debugGPUPicking) 
	{
		rendereroff.setRenderTarget(null);
		rendereroff.render(scene, camera);
	}
	rendereroff.setRenderTarget(pointBufferTarget);
	rendereroff.render(scene, camera);

	readShownFeatures();
	applyOnNodes((node) => 
	{
		node.material.userData.drawBlack.value = false;
		node.material.userData.computeNormals.value = shouldComputeNormals();
		node.objectsHolder.visible = debugFeaturePoints;
	});
	sky.visible = sunLight.visible = shouldRenderSy();
	ambientLight.visible = needsLights();
}, 100);
document.body.onresize = function() 
{
	const width = window.innerWidth;
	const height = window.innerHeight;
	const scale = width / height;
	let offWidth;
	let offHeight;
	if (scale > 1) 
	{
		offWidth = 200;
		offHeight = Math.round(offWidth / scale);
	}
	else 
	{
		offHeight = 200;

		offWidth = Math.round(offHeight * scale);
	}

	minYPx = TEXT_HEIGHT / height * offHeight;

	canvas4.width = Math.floor(width * devicePixelRatio);
	canvas4.height = Math.floor(height * devicePixelRatio);
	const rendererScaleRatio = 1 + (devicePixelRatio - 1) / 2;

	renderer.setSize(width, height);
	renderer.setPixelRatio(rendererScaleRatio);
	magnify3dTarget.setSize(width *devicePixelRatio, height *devicePixelRatio);

	pixelsBuffer = new Uint8Array(offWidth * offHeight * 4);
	rendereroff.setSize(offWidth, offHeight);
	rendereroff.setPixelRatio(1);
	pointBufferTarget.setSize(offWidth, offHeight);

	composer.setSize(width, height);
	// composer.setPixelRatio(rendererScaleRatio);
	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	render();
};
// @ts-ignore
document.body.onresize();
controls.update(clock.getDelta());

function toScreenXY(pos3D) 
{
	const pos = pos3D.clone();
	pos.project(camera);
	const width = window.innerWidth,
		height = window.innerHeight;
	const widthHalf = width / 2,
		heightHalf = height / 2;

	pos.x = pos.x * widthHalf + widthHalf;
	pos.y = -(pos.y * heightHalf) + heightHalf;
	pos.z = camera.position.distanceTo(pos3D);
	return pos;
}

function applyOnNode(node, cb) 
{
	// if (node.isMesh) 
	// {
		cb(node);
	// }
	node.children.forEach((n) => 
	{
		if (n !== node.objectsHolder) 
		{
			applyOnNode(n, cb);
		}
	});
	node.childrenCache && node.childrenCache.forEach((n) => 
	{
		if (n !== node.objectsHolder) 
		{
			applyOnNode(n, cb);
		}
	});
}
function applyOnNodes(cb) 
{
	applyOnNode(map.children[0], cb);
}

function wrapText(context, text, x, y, maxWidth, lineHeight) 
{
	const words = text.split(' ');
	let line = '';
	let nbLines = 1;
	for (let n = 0; n < words.length; n++) 
	{
		const testLine = line + words[n] + ' ';
		const metrics = context.measureText(testLine);
		const testWidth = metrics.width;
		if (testWidth > maxWidth && n > 0) 
		{
			context.fillText(line, x, y);
			line = words[n] + ' ';
			y += lineHeight;
			nbLines++;
		}
		else 
		{
			line = testLine;
		}
	}
	context.fillText(line, x, y);
	return {x: x + context.measureText(line).width, y: y, nbLines: nbLines};
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

function drawFeatures() 
{
	if (!drawLines) 
	{
		return;
	}

	let lastFeature;
	const minDistance = 24;
	featuresToShow = featuresToShow.map((f) => 
	{
		const coords = UnitsUtils.datumsToSpherical(f.geometry.coordinates[1], f.geometry.coordinates[0]);
		tempVector.set(coords.x, f.properties.ele * exageration, -coords.y);
		const vector = toScreenXY(tempVector);
		return {...f, x: vector.x, y: vector.y, z: vector.z};
	});
	let deltaY;
	featuresToShow = ArraySortOn(featuresToShow, 'x');

	const featuresToDraw = [];
	featuresToShow.forEach((f, index) => 
	{
		if (!lastFeature) 
		{
			// first
			lastFeature = f;
		}
		else if (f.x - lastFeature.x <= minDistance) 
		{
			deltaY = f.properties.ele - lastFeature.properties.ele;
			if (deltaY > 0) 
			{
				lastFeature = f;
			}
		}
		else 
		{
			featuresToDraw.push(lastFeature);
			lastFeature = f;
		}
	});
	if (lastFeature) 
	{
		featuresToDraw.push(lastFeature);
	}

	const toShow = featuresToDraw.length;
	ctx2d.save();
	ctx2d.clearRect(0, 0, canvas4.width, canvas4.height);
	ctx2d.scale(devicePixelRatio, devicePixelRatio);
	for (let index = 0; index < toShow; index++) 
	{
		const f = featuresToDraw[index];

		if (f.y < TEXT_HEIGHT || f.z >= FAR || f.z / f.properties.ele > FAR / 3000) 
		{
			continue;
		}

		const textColor = darkTheme ? 'white' : 'black';
		const color = darkTheme ? '#000000' : '#ffffff';
		ctx2d.beginPath();
		ctx2d.strokeStyle = textColor;
		ctx2d.moveTo(f.x, TEXT_HEIGHT);
		ctx2d.lineTo(f.x, f.y);
		ctx2d.closePath();
		ctx2d.stroke();
		ctx2d.save();
		ctx2d.translate(f.x, TEXT_HEIGHT);
		ctx2d.rotate(-Math.PI / 4);
		ctx2d.font = '14px Noto Sans';
		const text = f.properties.name;
		const textWidth = ctx2d.measureText(text).width;
		let totalWidth = textWidth + 10;
		let text2;
		if (drawElevations) 
		{
			text2 = f.properties.ele + 'm';
			const textWidth2 = ctx2d.measureText(text2).width;
			totalWidth += textWidth2 - 5;
		}
		ctx2d.fillStyle = color + 'cc';
		roundRect(ctx2d, 0, -12, totalWidth, 17, 8);
		ctx2d.fill();
		ctx2d.fillStyle = textColor;
		ctx2d.fillText(text, 5, 0);
		if (drawElevations) 
		{
			ctx2d.font = 'normal 9px Courier';
			ctx2d.fillText(text2, textWidth + 10, 0);
		}
		ctx2d.restore();
	}
	ctx2d.restore();
}

function readShownFeatures() 
{
	const width = pointBufferTarget.width;
	const height = pointBufferTarget.height;
	rendereroff.readRenderTargetPixels(pointBufferTarget, 0, 0, width, height, pixelsBuffer);
	const readColors = [];
	const rFeatures = [];
	let lastColor;
	function handleLastColor(index) 
	{
		if (readColors.indexOf(lastColor) === -1) 
		{
			readColors.push(lastColor);
			const feature = featuresByColor[lastColor];
			if (feature) 
			{
				rFeatures.push(feature);
			}
		}
	}

	const endIndex = pixelsBuffer.length - minYPx * 4 * width;
	for (let index = 0; index < endIndex; index += 4) 
	{
		if (pixelsBuffer[index] !== 0 || pixelsBuffer[index + 1] !== 0 || pixelsBuffer[index + 2] !== 0) 
		{
			const color = (pixelsBuffer[index] << 16) + (pixelsBuffer[index + 1] << 8) + pixelsBuffer[index + 2];
			if (lastColor === color) 
			{
				// lastColorNb++;
			}
			else 
			{
				if (lastColor) 
				{
					handleLastColor(index - 1);
				}
				lastColor = color;
				// lastColorNb = 1;
			}
		}
		else 
		{
			if (lastColor) 
			{
				handleLastColor(index - 1);
				lastColor = null;
				// lastColorNb = 0;
			}
		}
	}
	if (lastColor) 
	{
		handleLastColor(pixelsBuffer.length - 1);
		lastColor = null;
		// lastColorNb = 0;
	}
	featuresToShow = rFeatures;
}
function isTouchEvent(event) 
{
	return 'TouchEvent' in window && event instanceof TouchEvent;
}
function onMouseDown(event) 
{	
	if (showMagnify) 
	{
		showMagnify = false;
	}
	else 
	{
		if (isTouchEvent(event)) 
		{
			var touchEvent = event;
			for (var i = 0; i < touchEvent.touches.length; i++) 
			{
				mousePosition.x += touchEvent.touches[i].clientX;
				mousePosition.y += window.innerHeight - touchEvent.touches[i].clientY;
			}
			mousePosition.x /= touchEvent.touches.length;
			mousePosition.y /= touchEvent.touches.length;
		}
		else 
		{
			mousePosition.set(event.clientX, window.innerHeight - event.clientY);
		}
		showMagnify = true;
	}
	console.log('onMouseDown', showMagnify, mousePosition);
	render();
}
// window.addEventListener('mousedown', onMouseDown);
// window.addEventListener('touchstart', onMouseDown, {passive: true});


function actualRender(forceDrawFeatures) 
{
	if (readFeatures && pixelsBuffer) 
	{
		computeFeatures();
		drawFeatures();
	}
	else 
	{
		applyOnNodes((node) =>
		{
			// node.material.userData.drawBlack.value = false;
			// node.material.userData.drawNormals.value = false;
			node.objectsHolder.visible = debugFeaturePoints;
		});
	}

	if (debug || mapMap) 
	{
		renderer.render(scene, camera);
	}
	else 
	{
		composer.render(clock.getDelta());
	}
}
export function render(forceDrawFeatures = false) 
{
	if (!renderer || !composer) 
	{
		return;
	}
	
	if (showMagnify) 
	{
		renderer.setRenderTarget(magnify3dTarget);
		actualRender(forceDrawFeatures);
		renderer.setRenderTarget(null);
		magnify3d.render({
			renderer: renderer,
			pos: mousePosition,
			inputBuffer: magnify3dTarget,
			renderSceneCB: (target) => 
			{
				renderer.setRenderTarget(target);
				renderer.render(scene, camera);
				renderer.setRenderTarget(null);
			}
			
		});
	}
	else 
	{
		actualRender(forceDrawFeatures);
	}
	stats.end();
}
setPosition(position);
