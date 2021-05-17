/* eslint-disable camelcase */
CameraControls.install({THREE: THREE});

var stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);
var devicePixelRatio = window.devicePixelRatio; // Change to 1 on retina screens to see blurry canvas.

Array.prototype.sortOn = function(key) 
{
	return this.sort(function(a, b) 
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
};

class CustomOutlineEffect extends POSTPROCESSING.Effect 
{

	constructor() 
	{

		super("CustomEffect", `
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
`, {
			attributes: POSTPROCESSING.EffectAttribute.DEPTH,
			uniforms: new Map([
				['outlineColor', new THREE.Uniform(new THREE.Color(darkTheme ? 0xffffff : 0x000000))],
				['multiplierParameters', new THREE.Uniform(new THREE.Vector2(0.6, 30))]
				// ['multiplierParameters', new THREE.Uniform(new THREE.Vector2(1, 40))]
				
			])

		});

	}

}
// Follows the structure of
// 		https://github.com/mrdoob/three.js/blob/master/examples/jsm/postprocessing/OutlinePass.js
class CustomOutlinePass extends POSTPROCESSING.Pass 
{
	constructor() 
	{
		super('CustomOutlinePass');

		// this.renderScene = scene;
		// this.renderCamera = camera;
		// this.resolution = new THREE.Vector2(
		// 	resolution.x,
		// 	resolution.y
		// );

		// this.fsQuad = new THREE.Pass.FullScreenQuad(null);
		this.fsQuad.material = this.createOutlinePostProcessMaterial();

		this.setFullscreenMaterial(this.createOutlinePostProcessMaterial());
	}

	// dispose() 
	// {
	// 	this.fsQuad.dispose();
	// }

	// setSize(width, height) 
	// {
	// 	this.resolution.set(width, height);

	// 	this.fsQuad.material.uniforms.screenSize.value.set(width,
	// 		height,
	// 		1 / width,
	// 		1 / height);

	// }

	render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) 
	{

		// const depthBufferValue = writeBuffer.depthBuffer;
		// writeBuffer.depthBuffer = false;
		// renderer.render(this.renderScene, this.renderCamera);
		const material = this.getFullscreenMaterial();
		material.uniforms.inputBuffer.value = inputBuffer.texture;

		renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
		renderer.render(this.scene, this.camera);
		// this.fsQuad.material.uniforms["sceneColorBuffer"].value =
		//                 readBuffer.texture;
		// this.fsQuad.material.uniforms["depthBuffer"].value =
		// 				readBuffer.depthTexture;
		// renderer.setRenderTarget(null);
		// this.fsQuad.render(renderer);
		// writeBuffer.depthBuffer = depthBufferValue;
	}

	get vertexShader() 
	{
		return `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
		`;
	}

	get fragmentShader() 
	{
		return `
		#include <packing>
		// The above include imports "perspectiveDepthToViewZ"
		// and other GLSL functions from ThreeJS we need for reading depth.
		uniform sampler2D inputBuffer;
		uniform sampler2D depthBuffer;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform vec4 screenSize;
		uniform vec3 outlineColor;
		uniform vec2 multiplierParameters;
		varying vec2 vUv;
		
		// Helper functions for reading from depth buffer.
		float readDepth (sampler2D depthSampler, vec2 coord) {
			// #if DEPTH_PACKING == 3201
				// float fragCoordZ = unpackRGBAToDepth(texture2D(depthSampler, coord));
				// float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				// return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			// #else
				float fragCoordZ = texture2D(depthSampler, coord).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			// #endif
		}
			float getPixelDepth(int x, int y) {
			// screenSize.zw is pixel size 
			// vUv is current position
			return readDepth(depthBuffer, vUv + screenSize.zw * vec2(x, y));
		}
		float saturate(float num) {
			return clamp(num, 0.0, 1.0);
		}
		void main() {
			// vec4 sceneColor = vec4(1.0,1.0,1.0,1.0);
			vec4 sceneColor = texture2D(inputBuffer, vUv);
			float delta =  1.0;
			int delta2 = 1;

			float depthDiff = 0.0;
			float depth = getPixelDepth(0, 0);
			depthDiff += abs(depth - getPixelDepth(delta2, 0));
			depthDiff += abs(depth - getPixelDepth(-delta2, 0));
			depthDiff += abs(depth - getPixelDepth(0, delta2));
			depthDiff += abs(depth - getPixelDepth(0, -delta2));
			depthDiff = depthDiff /depth;
			// Apply multiplier & bias to each
				float depthBias = multiplierParameters.x;
			float depthMultiplier = multiplierParameters.y;
				depthDiff = depthDiff * multiplierParameters.y;
			depthDiff = saturate(depthDiff);
			if (depthDiff < 0.04) {
				depthDiff = pow(depthDiff, depthBias);
			}

			// Combine outline with scene color.
			vec4 outlineColor = vec4(outlineColor, 1.0);
			gl_FragColor = vec4(mix(sceneColor, outlineColor, depthDiff));

			// optional depth rendering
			//  gl_FragColor = vec4(vec3(depth), 1.0);
			//  gl_FragColor = vec4(vec3(1.0 -pow(1.0-depth, 2.0)), 1.0);

		}
        `;
	}

	createOutlinePostProcessMaterial() 
	{
		const result = new THREE.ShaderMaterial({
			type: "CustomMaterial",
			toneMapped: false,
			depthWrite: true,
			depthTest: false,
			uniforms: {
				inputBuffer: {},
				// depthBuffer: {},
				outlineColor: {value: new THREE.Color(darkTheme ? 0xffffff : 0x000000)},
				// 4 scalar values packed in one uniform: depth multiplier, depth bias, and same for normals.
				multiplierParameters: {value: new THREE.Vector2(2, 4)},
				// cameraNear: {value: this.renderCamera.near},
				// cameraFar: {value: this.renderCamera.far},
				screenSize: {
					value: new THREE.Vector4(
						this.resolution.x,
						this.resolution.y,
						1 / this.resolution.x,
						1 / this.resolution.y
					)
				}
			},
			blending: THREE.NoBlending,
			vertexShader: this.vertexShader,
			fragmentShader: this.fragmentShader
		});
		result.toneMapped = false;
		return result;
	}
}

let debug = false;
let debugFeaturePoints = false;
let debugGPUPicking = false;
let readFeatures = true;
let drawLines = true;
let darkTheme = false;
let pointBufferTargetScale = 10;
let featuresToShow = [];
let renderingIndex =-1;
let linesToDraw = [];
const tempVector = new THREE.Vector3(0, 0, 0);
const exageration = 1.7;
let currentColor = 0xffffff;
const featuresByColor = {};
let elevationDecoder = [256* 255, 255, 1 / 256* 255, -32768];
const FAR = 200000;
const TEXT_HEIGHT = 200;
let currentPosition;
let elevation = 7000;
const clock = new THREE.Clock();
const position = {lat: 45.19177, lon: 5.72831};
// updSunPos(45.16667, 5.71667);
const EPS = 1e-5;
// let elevationDecoder = [6553.6* 255, 25.6* 255, 0.1* 255, -10000];
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let pixelsBuffer;
const AA = devicePixelRatio <= 1;
let showingCamera =false;

const canvas = document.getElementById("canvas");
const canvas3 = document.getElementById("canvas3");
const canvas4 = document.getElementById("canvas4");
const video = document.getElementById( 'video' );
const ctx2d = canvas4.getContext("2d");

const renderer = new THREE.WebGLRenderer({
	canvas: canvas,
	// logarithmicDepthBuffer: true,
	antialias: AA,
	alpha: true,
	powerPreference: "high-performance",
	antialias: false,
	stencil: false,
	depth: false
	// precision: isMobile ? 'mediump' : 'highp'
});
document.body.style.backgroundColor = darkTheme ? "black" : "white";

renderer.setClearColor(0x000000, 0); // the default
const rendereroff = new THREE.WebGLRenderer({
	canvas: canvas3,
	antialias: false,
	alpha: false,
	powerPreference: "high-performance",
	stencil: false
	// precision: isMobile ? 'mediump' : 'highp'
});
const pointBufferTarget = new THREE.WebGLRenderTarget(0, 0);
pointBufferTarget.texture.minFilter = THREE.NearestFilter;
pointBufferTarget.texture.magFilter = THREE.NearestFilter;
pointBufferTarget.texture.generateMipmaps = false;
pointBufferTarget.stencilBuffer = false;
pointBufferTarget.texture.format = THREE.RGBFormat;

function createSky() 
{
	// Add Sky
	const sky = new THREE.Sky();
	sky.scale.setScalar(1e8);

	// GUI
	const effectController = {
		turbidity: 0,
		rayleigh: 0.5,
		mieCoefficient: 0.005,
		mieDirectionalG: 0.7,
		inclination: 0.48,
		azimuth: 0.25,
		exposure: 0.5
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
const ambientLight = new THREE.HemisphereLight(0xffeeb1, 0x080820, 0.7);
const curSunLight = new THREE.SpotLight(0xffffff, 200, 100, 0.7, 1, 1);
const sky = createSky();
scene.add(sky);
scene.add(ambientLight);
// scene.add(directionalLight);
sky.visible = debug;
ambientLight.visible = debug;
curSunLight.visible = debug;

let devicecontrols;
let listeningForDeviceSensors = false;
function toggleDeviceSensors() 
{
	if (!listeningForDeviceSensors) 
	{
		listeningForDeviceSensors = true;
		devicecontrols	= new THREE.DeviceOrientationControls( camera );
		devicecontrols.alphaOffset = Math.PI;
		animate();
	}
	else 
	{
		listeningForDeviceSensors = false;
		if (devicecontrols) 
		{
			devicecontrols.dispose();
			devicecontrols = null;
		}
		controls.polarAngle = 0;
	}
}

function startCam() 
{
	console.log('navigator.mediaDevices', navigator.mediaDevices);
	if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) 
	{

		const constraints = {video: {width: 1280, height: 720, facingMode: 'environment'}};

		navigator.mediaDevices.getUserMedia( constraints ).then( function( stream ) 
		{

			// apply the stream to the video element used in the texture
			showingCamera = true;
			video.style.visibility = "visible";
			video.srcObject = stream;
			video.play();
			toggleDeviceSensors();

		} ).catch( function( error ) 
		{

			console.error( 'Unable to access the camera/webcam.', error );

		} );

	}
	else 
	{

		console.error( 'MediaDevices interface not available.' );

	}
}
// =============================================================================================================
// Sun Position
// params: (date, latitude in radian, longitude in degree)
// return: {altitude, azimuth, declinaison all in radians}
// source:  http://www.psa.es/sdg/archive/SunPos.cpp
function sunPos(d, dLatitudeInRadians, udtLocationdLongitude) 
{
	// setup the input variables
		 const udtTimeiYear = d.getUTCFullYear();
		 const udtTimeiMonth=d.getUTCMonth()+1;
		 const udtTimeiDay=d.getUTCDate();
		 const udtTimedHours=d.getUTCHours();
		 const udtTimedMinutes=d.getUTCMinutes();
		 const udtTimedSeconds=d.getUTCSeconds();
		   
		   const pi = 3.14159265358979323846;
		   const twopi=2*pi;
		   const rad=pi/180;
		   const dEarthMeanRadius=6371.01; // In km
		   const dAstronomicalUnit=149597890; // In km

		   const dDecimalHours = udtTimedHours + (udtTimedMinutes + udtTimedSeconds / 60.0 ) / 60.0;

		   // Calculate current Julian Day not use of trunc since Javascript doesn't support div for integters like C++
		   const liAux1 =Math.trunc((udtTimeiMonth-14)/12);
		   const liAux2=Math.trunc(1461*(udtTimeiYear + 4800 + liAux1)/4) + Math.trunc(367*(udtTimeiMonth - 2-12*liAux1)/12)- Math.trunc(3*Math.trunc((udtTimeiYear + 4900 + liAux1)/100)/4)+udtTimeiDay-32075;
		   const dJulianDate=liAux2-0.5+dDecimalHours/24.0;
		   const dElapsedJulianDays = dJulianDate-2451545.0;
		   const dOmega=2.1429-0.0010394594*dElapsedJulianDays;
		   const dMeanLongitude = 4.8950630+ 0.017202791698*dElapsedJulianDays; // Radians
		   const dMeanAnomaly = 6.2400600+ 0.0172019699*dElapsedJulianDays;
		   const dEclipticLongitude = dMeanLongitude + 0.03341607*Math.sin( dMeanAnomaly ) + 0.00034894*Math.sin( 2*dMeanAnomaly )-0.0001134 -0.0000203*Math.sin(dOmega);
		   const dEclipticObliquity = 0.4090928 - 6.2140e-9*dElapsedJulianDays +0.0000396*Math.cos(dOmega);
		   const dSin_EclipticLongitude= Math.sin( dEclipticLongitude );
		   let dY = Math.cos( dEclipticObliquity ) * dSin_EclipticLongitude;
		   let dX = Math.cos( dEclipticLongitude );
		   const dRightAscension = Math.atan2( dY, dX );
		   if ( dRightAscension < 0.0 ) {dRightAscension = dRightAscension + twopi;}
		   const dDeclination = Math.asin( Math.sin( dEclipticObliquity )*dSin_EclipticLongitude );
		   const dGreenwichMeanSiderealTime = 6.6974243242 + 0.0657098283*dElapsedJulianDays + dDecimalHours;
		   const dLocalMeanSiderealTime = (dGreenwichMeanSiderealTime*15 + udtLocationdLongitude)*rad;
		   const dHourAngle = dLocalMeanSiderealTime - dRightAscension;
		 
		   const dCos_Latitude = Math.cos( dLatitudeInRadians );
		   const dSin_Latitude = Math.sin( dLatitudeInRadians );
		   const dCos_HourAngle= Math.cos( dHourAngle );
		   let udtSunCoordinatesdZenithAngle = Math.acos( dCos_Latitude*dCos_HourAngle*Math.cos(dDeclination) + Math.sin( dDeclination )*dSin_Latitude);
		    dY = -Math.sin( dHourAngle );
		    dX = Math.tan( dDeclination )*dCos_Latitude - dSin_Latitude*dCos_HourAngle;
		   let udtSunCoordinatesdAzimuth = Math.atan2( dY, dX );
		   if ( udtSunCoordinatesdAzimuth < 0.0 ) 
			   {udtSunCoordinatesdAzimuth = udtSunCoordinatesdAzimuth + twopi;}

			   const dParallax=dEarthMeanRadius/dAstronomicalUnit*Math.sin(udtSunCoordinatesdZenithAngle);
			    udtSunCoordinatesdZenithAngle=udtSunCoordinatesdZenithAngle + dParallax;
			   const alt = Math.PI/2 - udtSunCoordinatesdZenithAngle; // (90-udtSunCoordinatesdZenithAngle)

		   return {'alt': alt, 'azi': udtSunCoordinatesdAzimuth, 'dec': dDeclination};
	   }
// Update SUN position.
function updSunPos(lat, lon) 
{
	var d0 = new Date();

	// hete = canvasData.loc.dst ? d0.dst()*3600 : 0;
	// hete += canvasData.loc.gmt;
	// d0.setUTCSeconds(d0.getUTCSeconds() - hete);

	const coord = sunPos(d0, lat, lon);
	const groundRadius = 200000;

	x = -Math.cos(coord.alt) * Math.cos(coord.azi) * groundRadius;
	y = Math.sin(coord.alt) * 10000;   
	z = -Math.cos(coord.alt) * Math.sin(coord.azi) * groundRadius;
	// curSun.position.set(x, y, z);

	// Send sun position back to app
	// if (typeof WebViewBridge !== "undefined" && WebViewBridge) {
	//    window.postMessage( JSON.stringify({
	// 	'sunpos': {
	// 		'alt': Math.round( THREE.Math.radToDeg(coord.alt) * 100) / 100,
	// 		'azi': Math.round( THREE.Math.radToDeg(coord.azi) * 100) / 100
	// 	}
	// }));
	// }
	console.log('updSunPos', lat, lon, coord, x, y, z);
	var coords = Geo.UnitsUtils.datumsToSpherical(lat, lon);
	curSunLight.position.set( coords.x, 4000, -coords.y );
}
function setDebugMode(value) 
{
	debug = value;

	sky.visible = debug;
	ambientLight.visible = debug;
	curSunLight.visible = debug;
	// if (debug) 
	// {
		 
	// 	lod.subdivideDistance = 120;
	// 	lod.simplifyDistance =150;
	// }
	// else 
	// {

	// 	lod.subdivideDistance = 40;
	// 	lod.simplifyDistance = 140;
	// }
	createMap();
	onControlUpdate();
}
function setDebugGPUPicking(value) 
{
	debugGPUPicking = value;
	canvas3.style.visibility = debugGPUPicking ? 'visible' : 'hidden';
	render();
}
function setReadFeatures(value) 
{
	readFeatures = value;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	render();
}
function setDrawLines(value) 
{
	drawLines = value;
	canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	render();
}
function setDebugFeaturePoints(value) 
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
function setDarkMode(value) 
{
	darkTheme = value;
	outlineEffect.uniforms.get('outlineColor').value.set(darkTheme ? 0xffffff : 0x000000);
	document.body.style.backgroundColor = darkTheme ? 'black' : 'white';
	render();
}

function toggleCamera() 
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

const debugMapCheckBox = document.getElementById('debugMap');
debugMapCheckBox.onchange = (event) => {return setDebugMode(event.target.checked);};
debugMapCheckBox.value = debugMapCheckBox;

const debugGPUPickingCheckbox = document.getElementById('debugGPUPicking');
debugGPUPickingCheckbox.onchange = (event) => {return setDebugGPUPicking(event.target.checked);};
debugGPUPickingCheckbox.value = debugGPUPicking;
canvas3.style.visibility = debugGPUPicking ? 'visible' : 'hidden';

const readFeaturesCheckbox = document.getElementById('readFeatures');
readFeaturesCheckbox.onchange = (event) => {return setReadFeatures(event.target.checked);};
readFeaturesCheckbox.value = readFeatures;
canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';

const drawLinesCheckbox = document.getElementById('drawLines');
drawLinesCheckbox.onchange = (event) => {return setDrawLines(event.target.checked);};
drawLinesCheckbox.value = drawLines;
canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';

const debugFeaturePointsCheckbox = document.getElementById('debugFeaturePoints');
debugFeaturePointsCheckbox.onchange = (event) => {return setDebugFeaturePoints(event.target.checked);};
debugFeaturePointsCheckbox.value = debugFeaturePoints;

const darkmodeCheckbox = document.getElementById('darkmode');
darkmodeCheckbox.onchange = (event) => {return setDarkMode(event.target.checked);};
darkmodeCheckbox.value = darkTheme;

const elevationSlider = document.getElementById('elevationSlider');
elevationSlider.oninput = (event) => {return setElevation(event.target.value);};
elevationSlider.value = elevation;

const cameraCheckbox = document.getElementById('camera');
cameraCheckbox.onchange = (event) => {return toggleCamera();};
cameraCheckbox.value = showingCamera;

class EmptyProvider extends Geo.MapProvider 
{
	constructor() 
	{
		super();
		this.name = "local";
		this.minZoom = 0;
		this.maxZoom = 20;
	}

	fetchTile(zoom, x, y) 
	{
		return Promise.resolve();
	}
}
class LocalHeightProvider extends Geo.MapProvider 
{
	constructor() 
	{
		super();
		this.name = "local";
		this.minZoom = 5;
		this.maxZoom = 15;
	}

	async fetchTile(zoom, x, y) 
	{
		const result = await Promise.all([
			new Geo.CancelablePromise((resolve, reject) => 
			{
				var image = document.createElement("img");
				image.onload = function() 
				{
					resolve(image);
				};
				image.onerror = () => 
				{
					resolve();
				};
				image.crossOrigin = "Anonymous";
				image.src = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/" +
					zoom +
					"/" +
					x +
					"/" +
					y +
					".png";
			})
		]);
		return result[0];
	}
}

class MaterialHeightShader extends Geo.MapHeightNode 
{
                /**
                 * Empty texture used as a placeholder for missing textures.
                 *
                 * @static
                 * @attribute EMPTY_TEXTURE
                 * @type {Texture}
                 */
                static EMPTY_TEXTURE = new THREE.Texture();

                /**
                 * Size of the grid of the geometry displayed on the scene for each tile.
                 *
                 * @static
                 * @attribute GEOMETRY_SIZE
                 * @type {number}
                 */
                static GEOMETRY_SIZE = 200;

				static geometries = {};

				static getGeometry(level) 
				{
                	let size = MaterialHeightShader.GEOMETRY_SIZE;
                	if (level < 11) 
                	{
                		// size /= Math.pow(2, 11 - level 	);
                		size /= 11 - level;
                		size = Math.max(16, size);
                	}
                	let geo = MaterialHeightShader.geometries[size];
                	if (!MaterialHeightShader.geometries[size]) 
                	{
                		geo = MaterialHeightShader.geometries[
                			size
                		] = new Geo.MapNodeGeometry(1, 1, size, size);
                	}
                	return geo;
				}

				static getSoftGeometry(level) 
				{
                	return MaterialHeightShader.getGeometry(level - 1);
				}

				constructor(parentNode, mapView, location, level, x, y) 
				{
                	var material = new THREE.MeshPhongMaterial({
                		map: MaterialHeightShader.EMPTY_TEXTURE,
                		color: 0xffffff,
                		side: THREE.DoubleSide
                	});
                	material = MaterialHeightShader.prepareMaterial(
                		material,
                		level
                	);
                	super(
                		parentNode,
                		mapView,
                		location,
                		level,
                		x,
                		y,
                		material,
                		MaterialHeightShader.GEOMETRY
                	);

                	this.frustumCulled = false;
                	this.exageration = exageration;
				}

				static prepareMaterial(material, level) 
				{
                	material.userData = {
                		heightMap: {value: MaterialHeightShader.EMPTY_TEXTURE},
                		drawNormals: {value: 0},
                		computeNormals: {value: debug},
                		drawTexture: {value: debug},
                		drawBlack: {value: 0},
                		zoomlevel: {value: level},
                		exageration: {value: exageration},
                		elevationDecoder: {value: elevationDecoder}
                	};
			
                	material.onBeforeCompile = (shader) => 
                	{
                		// Pass uniforms from userData to the
                		for (const i in material.userData) 
                		{
                			shader.uniforms[i] = material.userData[i];
                		}
                		// Vertex variables
                		shader.vertexShader =
							`
						uniform bool computeNormals;
						uniform float exageration;
						uniform float zoomlevel;
						uniform sampler2D heightMap;
						uniform vec4 elevationDecoder;
					//  varying vec3 vNormal;

						float getPixelElevation(vec4 e) {
							// Convert encoded elevation value to meters
							return ((e.r * elevationDecoder.x + e.g * elevationDecoder.y  + e.b * elevationDecoder.z) + elevationDecoder.w) * exageration;
						}
						float getElevation(vec2 coord) {
						vec4 e = texture2D(heightMap, coord);
						return getPixelElevation(e);
						}
						float getElevationMean(vec2 coord, float width, float height) {
						float x0 = coord.x;
						float x1= coord.x;
						float y0 = coord.y;
						float y1= coord.y;
						if (x0 <= 0.0) {
							x1 = 1.0 / width;
						}
						if (x0 >= 1.0) {
							x1 = 1.0 - 1.0 / width;
						}
						if (y0 <= 0.0) {
							y1 = 1.0 / height;
						}
						if (y0 >= 1.0) {
							y1 = 1.0 - 1.0 / height;
						}
						if (x0 == x1 && y0 == y1) {
								vec4 e = texture2D(heightMap, coord);
							return getPixelElevation(e);
						} else {
							vec4 e1 = texture2D(heightMap, vec2(x0,y0));
							vec4 e2 = texture2D(heightMap, vec2(x1,y1));
							return 2.0 * getPixelElevation(e1) -  getPixelElevation(e2);
						}
						}
						` + shader.vertexShader;
                		shader.fragmentShader =
							`
							uniform bool drawNormals;
							uniform bool drawBlack;
							uniform bool drawTexture;
							` + shader.fragmentShader;
			
                		// Vertex depth logic
                		shader.fragmentShader = shader.fragmentShader.replace(
                			'#include <dithering_fragment>',
                			`
							if(drawBlack) {
								gl_FragColor = vec4( 0.0,0.0,0.0, 1.0 );
							 } else if(drawNormals) {
								gl_FragColor = vec4( ( 0.5 * vNormal + 0.5 ), 1.0 );
							} else if (!drawTexture) {
								gl_FragColor = vec4( 0.0,0.0,0.0, 0.0 );
							}
							`
                		);
                		shader.vertexShader = shader.vertexShader.replace(
                			'#include <fog_vertex>',
                			`
							#include <fog_vertex>

							// queried pixels:
							// +-----------+
							// |   |   |   |
							// | a | b | c |
							// |   |   |   |
							// +-----------+
							// |   |   |   |
							// | d | e | f |
							// |   |   |   |
							// +-----------+
							// |   |   |   |
							// | g | h | i |
							// |   |   |   |
							// +-----------+

							// vec4 theight = texture2D(heightMap, vUv);
							ivec2 size = textureSize(heightMap, 0);
							float width = float(size.x);
							float height = float(size.y);
							float e = getElevationMean(vUv, width,height);
							if (computeNormals ) {
								float offset = 1.0 / width;
								float a = getElevationMean(vUv + vec2(-offset, -offset), width,height);
								float b = getElevationMean(vUv + vec2(0, -offset), width,height);
								float c = getElevationMean(vUv + vec2(offset, -offset), width,height);
								float d = getElevationMean(vUv + vec2(-offset, 0), width,height);
								float f = getElevationMean(vUv + vec2(offset, 0), width,height);
								float g = getElevationMean(vUv + vec2(-offset, offset), width,height);
								float h = getElevationMean(vUv + vec2(0, offset), width,height);
								float i = getElevationMean(vUv + vec2(offset,offset), width,height);

								float NormalLength = 500.0 / zoomlevel;

								vec3 v0 = vec3(0.0, 0.0, 0.0);
								vec3 v1 = vec3(0.0, NormalLength, 0.0);
								vec3 v2= vec3(NormalLength, 0.0, 0.0);
								v0.z = (e + d + g + h) / 4.0;
								v1.z = (e + b + a + d) / 4.0;
								v2.z = (e + h + i + f) / 4.0;
								vec3 res = (normalize(cross(v2 - v0, v1 - v0)));
								vNormal = res.rbg;
							}

							vec3 _transformed = position + e * normal;
							vec3 worldNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );

							gl_Position = projectionMatrix * modelViewMatrix * vec4(_transformed, 1.0);
							`
                		);
                	};
			
                	return material;
				}

				loadTexture() 
				{
                	this.geometry = MaterialHeightShader.getGeometry(
                		this.level
                	);
                	this.isReady = true;
                	var self = this;

                	this.mapView
                		.fetchTile(this.level, this.x, this.y)
                		.then(function(image) 
                		{
                			if (image) 
                			{
                				var texture = new THREE.Texture(image);
                				texture.generateMipmaps = false;
                				texture.format = THREE.RGBFormat;
                				texture.magFilter = THREE.LinearFilter;
                				texture.minFilter = THREE.LinearFilter;
                				texture.needsUpdate = true;

                				self.material.map = texture;
                			}

                			self.textureLoaded = true;
                			self.nodeReady();
                		})
                		.catch(function(err) 
                		{
                			console.error(
                				"GeoThree: Failed to load color node data.",
                				err
                			);
                			self.textureLoaded = true;
                			self.nodeReady();
                		});

                	this.loadHeightGeometry();
				}

				loadHeightGeometry() 
				{
                	if (this.mapView.heightProvider === null) 
                	{
                		throw new Error(
                			"GeoThree: MapView.heightProvider provider is null."
                		);
                	}
                	this.mapView.heightProvider
                		.fetchTile(this.level, this.x, this.y)
                		.then(async(image) => 
                		{
                			this.onHeightImage(image);
                		})
                		.finally(() => 
                		{
                			this.heightLoaded = true;
                			this.nodeReady();
                		});
				}

				async onHeightImage(image) 
				{
                	if (image) 
                	{
                		new Geo.CancelablePromise((resolve, reject) => 
                		{
                			const url = `https://api.maptiler.com/tiles/v3/${this.level}/${this.x}/${this.y}.pbf?key=V7KGiDaKQBCWTYsgsmxh`;
                			try 
                			{
                				Geo.XHRUtils.getRaw(
                					url,
                					async(data) => 
                					{
                						let result = await MVTLoader.parse(
                							data,
                							{
                								mvt: {
                									tileIndex: {
                										x: this.x,
                										y: this.y,
                										z: this.level
                									},
                									coordinates: "wgs84",
                									layers: ["mountain_peak"]
                								}
                							}
                						);
                						result = result.filter(
                							(f) => {return f.properties.name && f.properties.class==="peak";}
                						);
                						if (result.length > 0) 
                						{
                							const features = [];
                							const exageration = this
                								.exageration;
                							var colors = [];
                							var points = [];
                							// var sizes = [];
                							var elevations = [];
                							const vec = new THREE.Vector3(
                								0,
                								0,
                								0
                							);
                							result.forEach((f, index) => 
                							{
                								var coords = Geo.UnitsUtils.datumsToSpherical(
                									f.geometry.coordinates[1],
                									f.geometry.coordinates[0]
                								);
                								vec.set(coords.x, 0, -coords.y);
                								f.localCoords = this.worldToLocal(
                									vec
                								);
                								if (
                									Math.abs(f.localCoords.x) <=
                                                        0.5 &&
                                                    Math.abs(f.localCoords.z) <=
                                                        0.5
                								) 
                								{
                									const id = f.geometry.coordinates.join(
                										","
                									);
                									f.id = id;
                									f.pointIndex =
                                                        features.length;
                									features.push(f);
                									f.level = this.level;
                									f.x = this.x;
                									f.y = this.y;
                									const color = f.color = currentColor--;
                									featuresByColor[color] = f;
                									f.localCoords.y =
                                                        f.properties.ele *
                                                        exageration;
                									colors.push(
                										(color >> 16 & 255) /
                                                            255,
                										(color >> 8 & 255) /
                                                            255,
                										(color & 255) / 255
                									);
                									points.push(
                										f.localCoords.x,
                										f.localCoords.y,
                										f.localCoords.z
                									);
                									elevations.push(
                										f.properties.ele
                									);
                								}
                							});
                							if (points.length > 0) 
                							{
                								const geometry = new THREE.BufferGeometry();
                								geometry.setAttribute(
                									"position",
                									new THREE.Float32BufferAttribute(
                										points,
                										3
                									)
                								);
                								geometry.setAttribute(
                									"color",
                									new THREE.Float32BufferAttribute(
                										colors,
                										3
                									)
                								);
                								geometry.setAttribute(
                									"elevation",
                									new THREE.Float32BufferAttribute(
                										elevations,
                										1
                									)
                								);
                								var mesh = new THREE.Points(
                									geometry,
                									new THREE.ShaderMaterial({
                										vertexShader: `
                                                             attribute float elevation;
                                                             attribute vec4 color;
                                                             varying vec4 vColor;
                                                             void main() {
                                                                 vColor = color;
                                                                 vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                                                                //  gl_PointSize =  floor(elevation / 1000.0)* 2.0;
                                                                //  gl_PointSize = gl_Position.z ;
                                                                gl_Position = projectionMatrix * mvPosition;
                                                    			gl_Position.z -= (elevation / 1000.0 - floor(elevation / 1000.0)) * gl_Position.z / 1000.0;
												}
                                                         `,
                										fragmentShader: `
                                                            varying vec4 vColor;
                                                            void main() {
                                                                gl_FragColor = vec4( vColor );
                                                            }
                                                         `,
                										transparent: true
                									})
                								);
                								mesh.features = features;

                								mesh.updateMatrix();
                								mesh.updateMatrixWorld(true);
                								this.objectsHolder.visible = debugFeaturePoints;
                								this.objectsHolder.add(mesh);
                							}
                						}

                						render();
                					},
                					resolve
                				);
                			}
                			catch (err) 
                			{
                				console.error(err);
                			}
                		});
                	}
                	if (image) 
                	{
                		var texture = new THREE.Texture(image);
                		texture.generateMipmaps = false;
                		texture.format = THREE.RGBFormat;
                		texture.magFilter = THREE.NearestFilter;
                		texture.minFilter = THREE.NearestFilter;
                		texture.needsUpdate = true;

                		this.material.userData.heightMap.value = texture;
                	}
				}

				/**
                 * Overrides normal raycasting, to avoid raycasting when isMesh is set to false.
                 *
                 * Switches the geometry for a simpler one for faster raycasting.
                 *
                 * @method raycast
                 */
				raycast(raycaster, intersects) 
				{
                	if (this.isMesh === true) 
                	{
                		const oldGeometry = this.geometry;
                		this.geometry = Geo.MapPlaneNode.GEOMETRY;

                		var result = THREE.Mesh.prototype.raycast.call(
                			this,
                			raycaster,
                			intersects
                		);

                		this.geometry = oldGeometry;

                		return result;
                	}

                	return false;
				}
}

function onControlUpdate() 
{
	map.lod.updateLOD(map, camera, renderer, scene);
	render();
}
const lod = new Geo.LODFrustum();
lod.subdivideDistance = 40;
lod.simplifyDistance = 140;
let map;

function createMap() 
{
	if (map !== undefined) 
	{
		scene.remove(map);
	}
	// const provider = new Geo.OpenStreetMapsProvider('https://a.tile.openstreetmap.org');
	const provider = debug
		? new Geo.DebugProvider('https://a.tile.openstreetmap.org')
		// ? new Geo.OpenStreetMapsProvider('https://a.tile.openstreetmap.org')
		: new EmptyProvider();
	provider.minZoom = 5;
	provider.maxZoom = 15	;
	map = new Geo.MapView(
		null,
		// new Geo.DebugProvider(),
		// debug ? new Geo.DebugProvider() : new EmptyProvider(),
		provider,
		new LocalHeightProvider(),
		render
	);
	map.lod = lod;
	map.scale.set(
		Geo.UnitsUtils.EARTH_PERIMETER,
		Geo.MapHeightNode.USE_DISPLACEMENT
			? Geo.MapHeightNode.MAX_HEIGHT
			: 1,
		Geo.UnitsUtils.EARTH_PERIMETER
	);
	map.root = new MaterialHeightShader(
		null,
		map,
		Geo.MapNode.ROOT,
		0,
		0,
		0,
		undefined,
		{meshMaxError: (level) => {return Math.pow(12 - level, 2) * 10;}}
	);
	map.add(map.root);
	map.mode = Geo.MapView.HEIGHT_SHADER;
	map.updateMatrixWorld(true);
	scene.add(map);
}

createMap();
var camera = new THREE.PerspectiveCamera(
	40,
	window.innerWidth/ window.innerHeight,
	100,
	FAR
);
camera.position.set( 0, 0, EPS );
var controls = new CameraControls(camera, canvas);
controls.azimuthRotateSpeed = - 0.3; // negative value to invert rotation direction
controls.polarRotateSpeed = - 0.3; // negative value to invert rotation direction
controls.minZoom = 1;
controls.truckSpeed = 1 / EPS * 30000;
controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
controls.touches.two = CameraControls.ACTION.TOUCH_TRUCK;
controls.verticalDragToForward = true;
controls.saveState();

function setPosition(coords) 
{
	currentPosition = Geo.UnitsUtils.datumsToSpherical(coords.lat, coords.lon);
	if (coords.altitude) 
	{
		elevation = coords.altitude;
	}
	controls.moveTo(currentPosition.x, elevation, -currentPosition.y);
	controls.update(clock.getDelta());
}
function setElevation(newValue) 
{
	elevation = newValue ;
	controls.getTarget(tempVector);
	controls.moveTo(tempVector.x, elevation* exageration, tempVector.z);
	controls.update(clock.getDelta());
}
controls.addEventListener("update", () => 
{
	onControlUpdate();
});

controls.addEventListener("control", () => 
{
	const delta = clock.getDelta();
	controls.update(delta);
});

// Create a multi render target with Float buffers
// const renderTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight );
// renderTarget.texture.format = THREE.RGBAFormat;
// renderTarget.texture.minFilter = THREE.NearestFilter;
// renderTarget.texture.magFilter = THREE.NearestFilter;
// renderTarget.texture.generateMipmaps = false;
// renderTarget.stencilBuffer = false;
// renderTarget.depthBuffer = true;
// renderTarget.depthTexture = new THREE.DepthTexture();
// renderTarget.depthTexture.type = renderer.capabilities.isWebGL2 ? THREE.FloatType : THREE.UnsignedShortType;

const composer = new POSTPROCESSING.EffectComposer(renderer);
composer.addPass(new POSTPROCESSING.RenderPass(scene, camera));
const outlineEffect = new CustomOutlineEffect();
composer.addPass(new POSTPROCESSING.EffectPass(camera, outlineEffect));

// const customOutline = new CustomOutlinePass(
// 	new THREE.Vector2(window.innerWidth, window.innerHeight),
// 	scene,
// 	camera
// );
// composer.addPass(customOutline);

let minYPx = 0;
function roundToNearest( number, multiple )
{
	var half = multiple/2;
	return number+half - (number+half) % multiple;
}
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
		offHeight = roundToNearest(offWidth / scale, 4);
	}
	else 
	{
		offHeight = 200;
		offWidth = roundToNearest(offHeight * scale, 4);
	}
	pointBufferTargetScale = width / offWidth;

	minYPx = Math.round(TEXT_HEIGHT / height * offHeight);

	canvas4.width = Math.floor(width * devicePixelRatio);
	canvas4.height = Math.floor(height* devicePixelRatio);
	const rendererScaleRatio = 1 + (devicePixelRatio - 1) / 2;

	renderer.setSize(width, height);
	renderer.setPixelRatio(1);
	// renderTarget.setSize(width, height);

	pixelsBuffer = new Uint8Array(offWidth * offHeight * 3);
	rendereroff.setSize(offWidth, offHeight);
	rendereroff.setPixelRatio(1);
	pointBufferTarget.setSize(offWidth, offHeight);

	composer.setSize(width, height);
	// composer.setPixelRatio(1);
	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	render();
};
document.body.onresize();
controls.update(clock.getDelta());

function toScreenXY(pos3D) 
{
	var pos = pos3D.clone();
	pos.project(camera);
	var width = window.innerWidth,
		height = window.innerHeight;
	var widthHalf = width / 2,
		heightHalf = height / 2;

	pos.x = pos.x * widthHalf + widthHalf;
	pos.y = -(pos.y * heightHalf) + heightHalf;
	pos.z = camera.position.distanceTo(pos3D);
	return pos;
}

function applyOnNode(node, cb) 
{
	if (node.isMesh) 
	{
		cb(node);
	}
	node.children.forEach((n) => 
	{
		if (n !== node.objectsHolder) 
		{
			applyOnNode(n, cb);
		}
	});
}
function applyOnNodes(cb) 
{
	const child = applyOnNode(map.children[0], cb);
}
function wrapText(context, text, x, y, maxWidth, lineHeight) 
{
	var words = text.split(' ');
	var line = '';
	let nbLines = 1;
	for (var n = 0; n < words.length; n++) 
	{
	  var testLine = line + words[n] + ' ';
	  var metrics = context.measureText(testLine);
	  var testWidth = metrics.width;
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

function drawFeatures() 
{
	if (!drawLines) 
	{
		return;
	}

	let lastFeature;
	const minDistance = 20;
	featuresToShow = featuresToShow.map((f) => 
	{
		var coords = Geo.UnitsUtils.datumsToSpherical(
			f.geometry.coordinates[1],
			f.geometry.coordinates[0]
		);
		tempVector.set(
			coords.x,
			f.properties.ele * exageration,
			-coords.y
		);
		const vector = toScreenXY(tempVector);
		return {...f, x: vector.x, y: vector.y, z: vector.z};
	});
	let deltaY;
	featuresToShow = featuresToShow.sortOn("x");

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
		
		if (f.y < TEXT_HEIGHT
			|| f.z >= FAR
			 || f.z / f.properties.ele > FAR / 3000
			 ) 
		{
			continue;
		}

		const textColor = darkTheme? 'white':'black';
		const color = darkTheme? '#000000':'#ffffff';
		ctx2d.beginPath();
		ctx2d.strokeStyle = textColor;
		ctx2d.moveTo(f.x, TEXT_HEIGHT);
		ctx2d.lineTo(f.x, f.y);
		ctx2d.closePath();
		ctx2d.stroke();
		ctx2d.save();
		ctx2d.translate(f.x, TEXT_HEIGHT);
		ctx2d.rotate(-Math.PI / 4);
		ctx2d.font = "bold 12px Courier";
		const text = f.properties.name;
		const text2 = f.properties.ele + "m";
		var textWidth = ctx2d.measureText(text).width;
		var textWidth2 = ctx2d.measureText(text2).width;
		// const res = wrapText(ctx2d, text, 0, 0, 110, 12);
		ctx2d.fillStyle = color + "aa";
		ctx2d.rect(0, 3, textWidth + 5 + textWidth2, -14);
		ctx2d.fill();
		ctx2d.fillStyle = textColor;
		ctx2d.fillText(text, 0, 0);
		ctx2d.font = "normal 9px Courier";
		ctx2d.fillText(
			text2,
			textWidth + 5,
			0
		);
		ctx2d.restore();
	}
	ctx2d.restore();
}

function readShownFeatures() 
{
	const width = pointBufferTarget.width;
	const height = pointBufferTarget.height;
	rendereroff.readRenderTargetPixels(
		pointBufferTarget,
		0,
		0,
		width,
		height,
		pixelsBuffer
	);
	let readColors = [];
	let rFeatures = [];
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

	const endIndex = pixelsBuffer.length - minYPx * 3 * width;
	for (let index = 0; index < endIndex; index += 3) 
	{
		if (
			pixelsBuffer[index] !== 0 ||
                        pixelsBuffer[index + 1] !== 0 ||
                        pixelsBuffer[index + 2] !== 0
		) 
		{
			const color =
                            (pixelsBuffer[index] << 16) +
                            (pixelsBuffer[index + 1] << 8) +
                            pixelsBuffer[index + 2];
			if (lastColor === color) 
			{
				lastColorNb++;
			}
			else 
			{
				if (lastColor) 
				{
					handleLastColor(index - 1);
				}
				lastColor = color;
				lastColorNb = 1;
			}
		}
		else 
		{
			if (lastColor) 
			{
				handleLastColor(index - 1);
				lastColor = null;
				lastColorNb = 0;
			}
		}
	}
	if (lastColor) 
	{
		handleLastColor(pixelsBuffer.length - 1);
		lastColor = null;
		lastColorNb = 0;
	}
	featuresToShow = rFeatures;
	
	
}

function render(forceDrawFeatures = false) 
{
	if (!renderer || !composer) 
	{
		return;
	}
	if (readFeatures && pixelsBuffer) 
	{
		renderingIndex = (renderingIndex + 1) % 5;
		if (!isMobile || forceDrawFeatures || renderingIndex === 0) 
		{
			let skyWasVisible = sky.visible;
			sky.visible = false;
			applyOnNodes((node) => 
			{
				node.material.userData.drawBlack.value = true;
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
				node.objectsHolder.visible = debugFeaturePoints;
			});
			sky.visible = skyWasVisible;
		}
		drawFeatures();
	}
	else 
	{
		// applyOnNodes((node) => 
		// {
		// 	// node.material.userData.drawBlack.value = false;
		// 	// node.material.userData.drawNormals.value = false;
		// 	node.objectsHolder.visible = debugFeaturePoints;
		// });
	}

	if (debug) 
	{
		renderer.render(scene, camera);
	}
	else 
	{
		composer.render(clock.getDelta());
	}
	stats.end();
}

function animate() 
{

	if (listeningForDeviceSensors) 
	{
		window.requestAnimationFrame( animate );

	}

	devicecontrols && devicecontrols.update();
	onControlUpdate();

}
setPosition(position);
