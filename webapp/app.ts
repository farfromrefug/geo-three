/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import CameraControls from 'camera-controls';
import Stats from 'stats.js';
import TWEEN from '@tweenjs/tween.js';
import Hammer from 'hammerjs';

import * as THREE from 'three';
import Magnify3d from './Magnify3d';

import {
	Gyroscope,
	AbsoluteOrientationSensor
} from 'motion-sensors-polyfill';

// @ts-ignore
window.THREE = THREE;

const TO_RAD = Math.PI / 180;
const PI_DIV4 = Math.PI / 4;
const PI_X2 = Math.PI * 2;
const TO_DEG = 180 / Math.PI;

import {Sky} from 'three/examples/jsm/objects/Sky';
import * as POSTPROCESSING from 'postprocessing/build/postprocessing.esm';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {MapView} from '../source/MapView';
import {MapNode} from '../source/nodes/MapNode';
import {DebugProvider} from '../source/providers/DebugProvider';
import {LODFrustum} from '../source/lod/LODFrustum';
import {EmptyProvider} from './EmptyProvider';
import {MaterialHeightShader} from './MaterialHeightShader';
import {LocalHeightProvider} from './LocalHeightProvider';
import RasterMapProvider from './RasterMapProvider';
import {SunLight} from './SunLight';

let wrongOrientation = false;

export function stopEventPropagation(event) 
{
	if (event.stopPropagation) 
	{
		event.stopPropagation();
	}
	else if (window.event) 
	{
		window.event.cancelBubble=true;
	}
}    

function getURLParameter(name) 
{
	return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}

// class CameraControlsWithOrientation extends CameraControls 
// {

// 	sensor:AbsoluteOrientationSensor;
// 	screenOrientation: number = 0

// 	deviceOrientation: DeviceOrientationEvent = {} as any

// 	deviceOrientationEnabled =false

// 	alpha = 0;

// 	beta = 0;

// 	gamma = 0;

// 	alphaOffsetAngle = 0;

// 	betaOffsetAngle = 0;

// 	gammaOffsetAngle = 0;

// 	onDeviceOrientationChangeEventBound

// 	onDeviceOrientationChangeEvent( event ) 
// 	{

// 		this.deviceOrientation = event;
// 		this.dispatchEvent( {
// 			type: 'control',
// 			originalEvent: event
// 		} );
// 	}

// 	onScreenOrientationChangeEventBound

// 	onCompassNeedsCalibrationEventBound

// 	onCompassNeedsCalibrationEvent() 
// 	{
// 		console.log('onCompassNeedsCalibrationEvent');
// 	}

// 	onScreenOrientationChangeEvent(event) 
// 	{

// 		this.screenOrientation = window.orientation as any || 0;
// 		this.dispatchEvent( {
// 			type: 'control',
// 			originalEvent: event
// 		} );

// 	}
// 	quaternion:THREE.Quaternion = new THREE.Quaternion();
// 	euler:THREE.Euler = new THREE.Euler();
// 	onSensorReading(){
// 		const q = this.sensor.quaternion;
// 		let quaternion = new THREE.Quaternion(q[0], q[1],
// 			q[2], q[3]).invert();

// // euler will hold the Euler angles corresponding to the quaternion
// let euler = new THREE.Euler(0, 0, 0);

// // Order of rotations must be adapted depending on orientation
// // for portrait ZYX, for landscape ZXY
// // const angleOrder = screen.orientation.angle === 0 ? 'ZYX' : 'ZXY';
// const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3( 1,0,0 ), Math.PI / 2 ); // - PI/2 around the x-axis
// quaternion.multiply(q1);
// euler.setFromQuaternion(quaternion);
// euler.set(euler.z, euler.y, -euler.x);
// // euler.x = -euler.x;
// // euler.y = -euler.y;
// this._camera.quaternion.setFromEuler(euler);
// 		// const euler = quaternionToEuler(q);
// 		// const alpha = euler[0];
// 		// const beta = 180 - euler[2];
// 		// const gamma = euler[1] + 90;
// 		// this.euler.set(alpha * TO_RAD, beta * TO_RAD, gamma * TO_RAD);
// 		// const orient = this.screenOrientation ? this.screenOrientation * TO_RAD : 0; // O
// 		// this._camera.quaternion.setFromEuler(this.euler)
// 		// this.setObjectQuaternion(this._camera.quaternion, q);
// 		// this._camera.quaternion.fromArray(this.sensor.quaternion);
// 		// this._camera.quaternion.setFromEuler(this.euler);
// 		// let  [alpha, beta, gamma] = this.anglesFromQuaternion({
// 		// 	x:this.quaternion[0],
// 		// 	y:this.quaternion[1],
// 		// 	z:this.quaternion[2],
// 		// 	w:this.quaternion[3],
// 		// });
// 		// alpha *= TO_RAD ; // Z
// 		// beta *= TO_RAD ; // Z
// 		// gamma  *= TO_RAD ; // Z
// 		// this.alpha = alpha;
// 		// this.beta = beta;
// 		// this.gamma = -gamma;
// 		// console.log('onSensorReading', this.quaternion, this.euler, this.alphaOffsetAngle,this.betaOffsetAngle );
// 		// this.rotateTo(this.euler.z + this.alphaOffsetAngle, -this.euler.x + this.betaOffsetAngle);
// 		// this.update(1);
// 		this.dispatchEvent( {
// 			type: 'update',
// 			originalEvent: null
// 		} );
	
// 	}
// 	startDeviceOrientation() 
// 	{
// 		if (this.deviceOrientationEnabled) 
// 		{
// 			return;
// 		}
// 		this.deviceOrientationEnabled = true;
// 		this.screenOrientation = window.orientation as any || 0;
// 		if (!this.sensor) {
// 			this.sensor = new AbsoluteOrientationSensor({ frequency: 60 , referenceFrame:'screen'});
// 			this.sensor.onreading = () => this.onSensorReading();
// 		}
// 		// this.onDeviceOrientationChangeEventBound = this.onDeviceOrientationChangeEvent.bind(this);
// 		this.onScreenOrientationChangeEventBound = this.onScreenOrientationChangeEvent.bind(this);
// 		// this.onCompassNeedsCalibrationEventBound = this.onCompassNeedsCalibrationEvent.bind(this);

// 		window.addEventListener( 'orientationchange', this.onScreenOrientationChangeEventBound, false );
// 		// window.addEventListener( 'deviceorientation', this.onDeviceOrientationChangeEventBound, false );
// 		// window.addEventListener( 'compassneedscalibration', this.onCompassNeedsCalibrationEventBound, false );
// 		this.sensor.start();

// 	}

// 	stopDeviceOrientation() 
// 	{
// 		if (!this.deviceOrientationEnabled) 
// 		{
// 			return;
// 		}
// 		this.deviceOrientationEnabled = false;
// 		this.sensor.stop();
// 		const euler = new THREE.Euler();
// 		euler.setFromQuaternion(this._camera.quaternion);
// 		window.removeEventListener( 'orientationchange', this.onScreenOrientationChangeEventBound, false );
// 		// window.removeEventListener( 'deviceorientation', this.onDeviceOrientationChangeEventBound, false );
// 		// window.addEventListener( 'compassneedscalibration', this.onCompassNeedsCalibrationEventBound, false );


// 	}

// 	// anglesFromQuaternion(quaternion) {

// 	// 	let _alpha, _beta, _gamma;


// 	// 		var sqw = quaternion.w * quaternion.w;
// 	// 		var sqx = quaternion.x * quaternion.x;
// 	// 		var sqy = quaternion.y * quaternion.y;
// 	// 		var sqz = quaternion.z * quaternion.z;

// 	// 		var unitLength = sqw + sqx + sqy + sqz; // Normalised == 1, otherwise correction divisor.
// 	// 		var wxyz = quaternion.w * quaternion.x + quaternion.y * quaternion.z;
// 	// 		var epsilon = 1e-6; // rounding factor

// 	// 		if (wxyz > (0.5 - epsilon) * unitLength) {

// 	// 			_alpha = 2 * Math.atan2(quaternion.y, quaternion.w);
// 	// 			_beta = PI_X2;
// 	// 			_gamma = 0;

// 	// 		} else if (wxyz < (-0.5 + epsilon) * unitLength) {

// 	// 			_alpha = -2 * Math.atan2(quaternion.y, quaternion.w);
// 	// 			_beta = -PI_X2;
// 	// 			_gamma = 0;

// 	// 		} else {

// 	// 			var aX = sqw - sqx + sqy - sqz;
// 	// 			var aY = 2 * (quaternion.w * quaternion.z - quaternion.x * quaternion.y);

// 	// 			var gX = sqw - sqx - sqy + sqz;
// 	// 			var gY = 2 * (quaternion.w * quaternion.y - quaternion.x * quaternion.z);

// 	// 			if (gX > 0) {

// 	// 				_alpha = Math.atan2(aY, aX);
// 	// 				_beta  = Math.asin(2 * wxyz / unitLength);
// 	// 				_gamma = Math.atan2(gY, gX);

// 	// 			} else {

// 	// 				_alpha = Math.atan2(-aY, -aX);
// 	// 				_beta  = -Math.asin(2 * wxyz / unitLength);
// 	// 				_beta  += _beta < 0 ? Math.PI : - Math.PI;
// 	// 				_gamma = Math.atan2(-gY, -gX);

// 	// 			}

// 	// 		}

// 	// 		// alpha is in [-pi, pi], make sure it is in [0, 2*pi).
// 	// 		if (_alpha < 0) {
// 	// 			_alpha += PI_X2; // alpha [0, 2*pi)
// 	// 		}

// 	// 		// Convert to degrees
// 	// 		_alpha *= TO_DEG;
// 	// 		_beta  *= TO_DEG;
// 	// 		_gamma *= TO_DEG;

// 	// 		// apply derived euler angles to current object
// 	// 		return [_alpha, _beta, _gamma];

// 	// }

// 	setObjectQuaternion(quaternion:THREE.Quaternion, q) 
// 	{
// 		var zee = new THREE.Vector3( 0, 0, 1 );
// 		// var euler = new THREE.Euler();
// 		var q0 = new THREE.Quaternion();
// 		var q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3( 1,0,0 ), Math.PI / 2 ); // - PI/2 around the x-axis
// 		// euler.set( beta, alpha, - gamma, 'YXZ' ); // 'ZXY' for the device, but 'YXZ' for us
// 		quaternion.fromArray( q ).invert(); // orient the device
// 		// quaternion.fromArray( q ); // orient the device
// 		quaternion.multiply( q1 ); // camera looks out the back of the device, not the top
// 		const orient = this.screenOrientation ? this.screenOrientation * TO_RAD : 0; // O
// 		quaternion.multiply( q0.setFromAxisAngle( zee, - orient ) ); // adjust for screen orientation
// 	}

// 	rotate(azimuthAngle: number, polarAngle: number, enableTransition?: boolean) 
// 	{
// 		if ( this.deviceOrientationEnabled && this.quaternion) 
// 		{
// 			this.alphaOffsetAngle+=azimuthAngle;
// 			this.betaOffsetAngle+=polarAngle;
// 			// this.updateAlphaOffsetAngle(this.alphaOffsetAngle + azimuthAngle);
// 			// this.updateBetaOffsetAngle(this.betaOffsetAngle + polarAngle);
// 		}
// 		// else 
// 		// {
// 			return super.rotate(azimuthAngle, polarAngle, enableTransition);

// 		// }
// 	}

// 	// update(delta: number)
// 	// {
// 	// 	if ( this.deviceOrientationEnabled && this.quaternion) 
// 	// 	{
// 	// 		// alpha += this.alphaOffsetAngle ; // Z
// 	// 		// beta +=this.betaOffsetAngle ; // Z
// 	// 		// gamma +=  - this.gammaOffsetAngle ; // Z
// 	// 		// var alpha = this.deviceOrientation.alpha ? this.deviceOrientation.alpha * TO_RAD + this.alphaOffsetAngle : 0; // Z
// 	// 		// var beta = this.deviceOrientation.beta ? this.deviceOrientation.beta * TO_RAD + this.betaOffsetAngle : 0; // X'
// 	// 		// var gamma = this.deviceOrientation.gamma ? this.deviceOrientation.gamma * TO_RAD + this.gammaOffsetAngle : 0; // Y''
// 	// 		var orient = this.screenOrientation ? this.screenOrientation * TO_RAD : 0; // O

// 	// 		// if (this.screenOrientation % 180 === 0) 
// 	// 		// {
// 	// 		// 	if (Math.abs(this.deviceOrientation.beta) <10 && Math.abs(this.deviceOrientation.gamma) >80) 
// 	// 		// 	{
// 	// 		// 		wrongOrientation = true;
// 	// 		// 	}
// 	// 		// 	else 
// 	// 		// 	{
// 	// 		// 		wrongOrientation = false;
// 	// 		// 	}
// 	// 		// } 
// 	// 		// this.setObjectQuaternion( this._camera.quaternion, alpha, beta, gamma, orient );
// 	// 		// this._camera.quaternion.fromArray([alpha, beta, gamma, orient]);
// 	// 		// this.dispatchEvent( {
// 	// 		// 	type: 'update',
// 	// 		// 	originalEvent: null
// 	// 		// });
// 	// 		return true;
// 	// 	}
// 	// 	else 
// 	// 	{
// 	// 		return super.update(delta);
// 	// 	}
// 	// }

// 	updateAlphaOffsetAngle( angle ) 
// 	{

// 		this.alphaOffsetAngle = angle;

// 	}

// 	updateBetaOffsetAngle( angle ) 
// 	{

// 		this.betaOffsetAngle = angle;

// 	}

// 	updateGammaOffsetAngle( angle ) 
// 	{

// 		this.gammaOffsetAngle = angle;

// 	}

// 	dispose() 
// 	{
// 		this.stopDeviceOrientation();
// 		super.dispose();
// 	}

// }
class CameraControlsWithOrientation extends CameraControls 
{
	screenOrientation: number = 0

	deviceOrientation: DeviceOrientationEvent = {} as any

	deviceOrientationEnabled =false

	orientationAzimuth = 0;

	orientationPolar = 0;

	alphaOffsetAngle = 0;

	betaOffsetAngle = 0;

	gammaOffsetAngle = 0;

	onDeviceOrientationChangeEventBound

	updateDeviceOrientationQuaternion() 
	{
		var alpha = this.deviceOrientation.alpha ? this.deviceOrientation.alpha * TO_RAD + this.alphaOffsetAngle : 0; // Z
		var beta = this.deviceOrientation.beta ? this.deviceOrientation.beta * TO_RAD + this.betaOffsetAngle : 0; // X'
		var gamma = this.deviceOrientation.gamma ? this.deviceOrientation.gamma * TO_RAD + this.gammaOffsetAngle : 0; // Y''
		var orient = this.screenOrientation ? this.screenOrientation * TO_RAD : 0; // O

		if (this.screenOrientation % 180 === 0) 
		{
			if (Math.abs(this.deviceOrientation.beta) <10 && Math.abs(this.deviceOrientation.gamma) >80) 
			{
				wrongOrientation = true;
			}
			else 
			{
				wrongOrientation = false;
			}
		} 

		this.setObjectQuaternion( this._camera.quaternion, alpha, beta, gamma, orient );
		this._camera.getWorldDirection( this.wordVec );
		this.orientationAzimuth = Math.atan2(this.wordVec.x, this.wordVec.z) + Math.PI;
		this.orientationPolar = Math.atan2(this.wordVec.z, this.wordVec.y) + Math.PI;
	}

	onDeviceOrientationChangeEvent( event ) 
	{
		this.deviceOrientation = event;
		this.updateDeviceOrientationQuaternion();
		this.dispatchEvent( {
			type: 'update',
			originalEvent: event
		} );
	}

	onScreenOrientationChangeEventBound

	onCompassNeedsCalibrationEventBound

	onCompassNeedsCalibrationEvent() 
	{
		console.log('onCompassNeedsCalibrationEvent');
	}

	onScreenOrientationChangeEvent(event) 
	{

		this.screenOrientation = window.orientation as any || 0;
		this.dispatchEvent( {
			type: 'control',
			originalEvent: event
		} );

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

		window.addEventListener( 'orientationchange', this.onScreenOrientationChangeEventBound, false );
		if ('ondeviceorientationabsolute' in window) 
		{
			window.addEventListener( 'deviceorientationabsolute', this.onDeviceOrientationChangeEventBound, false );
		}
		else 
		{
			window.addEventListener( 'deviceorientation', this.onDeviceOrientationChangeEventBound, false );
		}
		window.addEventListener( 'compassneedscalibration', this.onCompassNeedsCalibrationEventBound, false );
	}

	stopDeviceOrientation() 
	{
		if (!this.deviceOrientationEnabled) 
		{
			return;
		}
		this.deviceOrientationEnabled = false;
		this.rotateTo(this.orientationAzimuth, this.orientationPolar);
		window.removeEventListener( 'orientationchange', this.onScreenOrientationChangeEventBound, false );
		if ('ondeviceorientationabsolute' in window) 
		{
			window.removeEventListener( 'deviceorientationabsolute', this.onDeviceOrientationChangeEventBound, false );
		}
		else 
		{
			window.removeEventListener( 'deviceorientation', this.onDeviceOrientationChangeEventBound, false );
		}
		window.addEventListener( 'compassneedscalibration', this.onCompassNeedsCalibrationEventBound, false );
	}

	zee = new THREE.Vector3( 0, 0, 1 );

	euler = new THREE.Euler();

	q0 = new THREE.Quaternion();

	q1 = new THREE.Quaternion();

	wordVec = new THREE.Vector3();

	setObjectQuaternion(quaternion, alpha, beta, gamma, orient) 
	{
		this.q0.identity();
		this.q1.set( - Math.sqrt( 0.5 ), 0, 0, Math.sqrt( 0.5 ) ); // - PI/2 around the x-axis
		this.euler.set( beta, alpha, - gamma, 'YXZ' ); // 'ZXY' for the device, but 'YXZ' for us
		quaternion.setFromEuler( this.euler ); // orient the device
		quaternion.multiply( this.q1 ); // camera looks out the back of the device, not the top
		quaternion.multiply( this.q0.setFromAxisAngle( this.zee, - orient ) ); // adjust for screen orientation
	}

	rotate(azimuthAngle: number, polarAngle: number, enableTransition?: boolean) 
	{
		if ( this.deviceOrientationEnabled) 
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
		if (this.ignoreUpdateDispatch && event.type === 'update' ) 
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
		if ( this.deviceOrientationEnabled) 
		{
			this.ignoreUpdateDispatch = true;
			super.update(delta);
			this.updateDeviceOrientationQuaternion();
			this.ignoreUpdateDispatch = false;
			this.dispatchEvent( {
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

	updateAlphaOffsetAngle( angle ) 
	{
		this.alphaOffsetAngle = angle;
	}

	updateBetaOffsetAngle( angle ) 
	{
		this.betaOffsetAngle = angle;
	}

	updateGammaOffsetAngle( angle ) 
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
	public uniforms: Map<String, any>

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
				blendFunction: POSTPROCESSING.BlendFunction.AVERAGE, 
				uniforms: new Map([
					['outlineColor', new THREE.Uniform(new THREE.Color(darkTheme ? 0xffffff : 0x000000))],
					['multiplierParameters', new THREE.Uniform(new THREE.Vector2(depthBiais, depthMultiplier))]
					// ['multiplierParameters', new THREE.Uniform(new THREE.Vector2(1, 40))]
				])
			}
		);
	}
}
'';
CameraControls.install({THREE: THREE});
// @ts-ignore
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
const devicePixelRatio = window.devicePixelRatio;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
// console.log('isMobile ' + isMobile + ' ' + devicePixelRatio + ' ' + navigator.userAgent);
export let debug = false;
export let showStats = false;
export let mapMap = false;
export let drawTexture = true;
export let computeNormals = false;
export let debugFeaturePoints = false;
export let wireframe = false;
export let mapoutline = false;
export let dayNightCycle = false;
export let LOD = isMobile ? 104 :256;
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
export let elevationDecoder = [6553.6 * 255, 25.6 * 255, 0.1 * 255, -10000];
// export let elevationDecoder = [256* 255, 255, 1 / 256* 255, -32768];
export let currentViewingDistance = 0;
export let FAR = 173000;
const TEXT_HEIGHT = 180;
let currentPositionAltitude = -1;
let currentPosition;
let elevation = -1;
const clock = new THREE.Clock();
let selectedItem = null;
let map;
const EPS = 1e-5;
let pixelsBuffer;
const AA = devicePixelRatio <= 1;
let showingCamera = false;
// let showMagnify = false;
let mousePosition = null;
let raycastMouse = new THREE.Vector2();

let animating = false;
// Setup the animation loop.
let viewWidth = window.innerWidth;
let viewHeight = window.innerHeight;


let stats;


const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const canvas3 = document.getElementById('canvas3') as HTMLCanvasElement;
const canvas4 = document.getElementById('canvas4') as HTMLCanvasElement;
const video = document.getElementById('video') as HTMLVideoElement;
const ctx2d = canvas4.getContext('2d');
canvas.addEventListener( 'touchstart', () => {return clock.getDelta();}, {passive: true} );

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
// const magnify3d = new Magnify3d();
// const magnify3dTarget = new THREE.WebGLRenderTarget(0, 0); 

renderer.setClearColor(0x000000, 0);
const rendereroff = new THREE.WebGLRenderer({
	canvas: canvas3,
	antialias: false,
	alpha: false,
	powerPreference: 'high-performance',
	stencil: false
	// precision: isMobile ? 'mediump' : 'highp'
});

// const rendererMagnify = new THREE.WebGLRenderer({
// 	canvas: document.getElementById('canvas5') as HTMLCanvasElement,
// 	// logarithmicDepthBuffer: true,
// 	antialias: AA,
// 	alpha: true,
// 	powerPreference: 'high-performance',
// 	stencil: false,
// 	depth: false
// 	// precision: isMobile ? 'mediump' : 'highp'
// });
const pointBufferTarget = new THREE.WebGLRenderTarget(0, 0);
pointBufferTarget.texture.minFilter = THREE.NearestFilter;
pointBufferTarget.texture.magFilter = THREE.NearestFilter;
pointBufferTarget.texture.generateMipmaps = false;
pointBufferTarget.stencilBuffer = false;
// pointBufferTarget.texture.format = THREE.RGBFormat;

const composer = new POSTPROCESSING.EffectComposer(renderer);


export function shouldComputeNormals() 
{
	return drawNormals || (debug || mapMap) && (computeNormals || dayNightCycle);
}

export function shouldRenderSky() 
{
	return (debug || mapMap) && dayNightCycle;
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
			node.material.userData.elevationDecoder.value = elevationDecoder;
		});
	}
}


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

export function toggleDeviceSensors() 
{
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

export function setDebugMode(value) 
{
	debug = value;
	setupLOD();

	sky.visible = sunLight.visible = shouldRenderSky();
	ambientLight.visible = needsLights();
	if (map) 
	{
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
	
	sky.visible = sunLight.visible = shouldRenderSky();
	ambientLight.visible = needsLights();
	setupLOD();
	if (map) 
	{
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
export function setPredefinedMapMode(value) 
{
	mapMap = value;
	mapoutline = value;
	
	sky.visible = sunLight.visible = shouldRenderSky();
	ambientLight.visible = needsLights();
	setupLOD();
	if (map) 
	{
		map.provider = createProvider();
		applyOnNodes((node) => 
		{
			node.isTextureReady = false;
			node.material.userData.computeNormals.value = shouldComputeNormals();
			node.material.userData.drawTexture.value = (debug || mapMap) && drawTexture;
		});
		onControlUpdate();
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

export function setComputeNormals(value) 
{
	computeNormals = value;
	sky.visible = shouldRenderSky();
	sunLight.visible = shouldRenderSky() || computeNormals;
	ambientLight.intensity = computeNormals || dayNightCycle ? 0.1875 : 1;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.material.userData.computeNormals.value = shouldComputeNormals();
			
		});
	}
	render();
}

export function toggleComputeNormals() 
{
	setComputeNormals(!computeNormals);
}
export function setDayNightCycle(value) 
{
	dayNightCycle = value;
	sky.visible = shouldRenderSky();
	sunLight.visible = shouldRenderSky() || computeNormals;
	ambientLight.intensity = computeNormals || dayNightCycle ? 0.1875 : 1;
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
export function setShowStats(value) 
{
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
	render();
}
export function toggleShowStats() 
{
	setShowStats(!showStats);
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
			// node.objectsHolder.visible = node.isMesh && debugFeaturePoints;
			node.objectsHolder.visible = debugFeaturePoints && (node.isMesh || node.level === 14 && node.parentNode.subdivided);
			let child = node.objectsHolder.children[0];
			if (child) 
			{
				child.material.userData.forViewing.value = debugFeaturePoints;
			}
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
	document.body.style.backgroundColor = darkTheme ? 'black' : 'white';
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
export function setMapOultine(value) 
{
	mapoutline = value;
	render();
}
export function toggleMapOultine() 
{
	setMapOultine(!mapoutline);
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
let shouldClearSelectedOnClick = true;

export function setMousPosition(x, y) 
{
	// console.log('setMousPosition', x, y, Boolean(selectedItem));
	mousePosition = new THREE.Vector2(x, y);
	render(true);
}
let datelabel, viewingDistanceLabel, compass: HTMLDivElement, compassSlice: HTMLDivElement, compassLabel: HTMLLabelElement, selectedPeakLabel, selectedPeakDiv, elevationLabel, elevationSlider, lodLabel;
try 
{
	compass = document.getElementById('compass') as HTMLDivElement;
	compassSlice = document.getElementById('compass_slice') as HTMLDivElement;
	document.body.style.backgroundColor = darkTheme ? 'black' : 'white';

	const cameraButton = document.getElementById('camera_button');
	if (isMobile) 
	{
		cameraButton.style.visibility = 'visible';
	}

	compassLabel = document.getElementById('compass_label') as HTMLLabelElement;
	const debugMapCheckBox = document.getElementById('debugMap') as HTMLInputElement;
	if (debugMapCheckBox) 
	{
		debugMapCheckBox.onchange = (event: any) => {return setDebugMode(event.target.checked);};
		debugMapCheckBox.value = debug as any;
	}
	
	
	const mapMapCheckBox = document.getElementById('mapMap') as HTMLInputElement;
	if (mapMapCheckBox) 
	{
		mapMapCheckBox.onchange = (event: any) => {return setMapMode(event.target.checked);};
		mapMapCheckBox.checked = mapMap as any;
	}
	
	const dayNightCycleCheckBox = document.getElementById('dayNightCycle') as HTMLInputElement;
	if (dayNightCycleCheckBox) 
	{
		dayNightCycleCheckBox.onchange = (event: any) => {return setDayNightCycle(event.target.checked);};
		dayNightCycleCheckBox.checked = dayNightCycle as any;
	}
	
	const debugGPUPickingCheckbox = document.getElementById('debugGPUPicking') as HTMLInputElement;
	if (debugGPUPickingCheckbox) 
	{
		debugGPUPickingCheckbox.onchange = (event: any) => {return setDebugGPUPicking(event.target.checked);};
		debugGPUPickingCheckbox.checked = debugGPUPicking as any;
		canvas3.style.visibility = debugGPUPicking ? 'visible' : 'hidden';
	}
	
	const readFeaturesCheckbox = document.getElementById('readFeatures') as HTMLInputElement;
	if (readFeaturesCheckbox) 
	{
		readFeaturesCheckbox.onchange = (event: any) => {return setReadFeatures(event.target.checked);};
		readFeaturesCheckbox.checked = readFeatures as any;
		canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	}
	
	// const drawLinesCheckbox = document.getElementById('drawLines') as HTMLInputElement;
	// drawLinesCheckbox.onchange = (event: any) => {return setDrawLines(event.target.checked);};
	// drawLinesCheckbox.checked = drawLines as any;
	// canvas4.style.visibility = readFeatures && drawLines ? 'visible' : 'hidden';
	
	const debugFeaturePointsCheckbox = document.getElementById('debugFeaturePoints') as HTMLInputElement;
	if (debugFeaturePointsCheckbox) 
	{
		debugFeaturePointsCheckbox.onchange = (event: any) => {return setDebugFeaturePoints(event.target.checked);};
		debugFeaturePointsCheckbox.checked = debugFeaturePoints as any;
	}
	
	const darkmodeCheckbox = document.getElementById('darkmode') as HTMLInputElement;
	if (darkmodeCheckbox) 
	{
		darkmodeCheckbox.onchange = (event: any) => {return setDarkMode(event.target.checked);};
		darkmodeCheckbox.checked = darkTheme as any;
	}
	const wireframeCheckbox = document.getElementById('wireframe') as HTMLInputElement;
	if (wireframeCheckbox) 
	{
		wireframeCheckbox.onchange = (event: any) => {return setWireFrame(event.target.checked);};
		wireframeCheckbox.checked = wireframe as any;
	}

	const mapoutlineCheckbox = document.getElementById('mapoutline') as HTMLInputElement;
	if (mapoutlineCheckbox) 
	{
		mapoutlineCheckbox.onchange = (event: any) => {return setMapOultine(event.target.checked);};
		mapoutlineCheckbox.checked = mapoutline as any;
	}
	
	elevationSlider = document.getElementById('elevationSlider') as HTMLInputElement;
	if (elevationSlider) 
	{
		elevationSlider.oninput = (event: any) => {return setElevation(event.target.value);};
		elevationSlider.value = elevation as any;
	}
	
	const exagerationSlider = document.getElementById('exagerationSlider') as HTMLInputElement;
	if (exagerationSlider) 
	{
		exagerationSlider.oninput = (event: any) => {return setExageration(event.target.value);};
		exagerationSlider.value = exageration as any;
	}
	const depthMultiplierSlider = document.getElementById('depthMultiplierSlider') as HTMLInputElement;
	if (depthMultiplierSlider) 
	{
		depthMultiplierSlider.oninput = (event: any) => {return setDepthMultiplier(event.target.value);};
		depthMultiplierSlider.value = depthMultiplier as any;
	}
	const depthBiaisSlider = document.getElementById('depthBiaisSlider') as HTMLInputElement;
	if (depthBiaisSlider) 
	{
		depthBiaisSlider.oninput = (event: any) => {return setDepthBiais(event.target.value);};
		depthBiaisSlider.value = depthBiais as any;
	}
	
	const dateSlider = document.getElementById('dateSlider') as HTMLInputElement;
	if (dateSlider) 
	{
	
		const now = new Date();
		const secondsInDay = now.getHours() * 3600 + now.getMinutes()* 60 + now.getSeconds();
		dateSlider.oninput = (event: any) => {return setDate(event.target.value);};
		dateSlider.value = secondsInDay as any;
		datelabel = document.getElementById('dateLabel') as HTMLLabelElement;
		datelabel.innerText = new Date().toLocaleString();
	}
	viewingDistanceLabel = document.getElementById('viewingDistanceLabel') as HTMLLabelElement;

	const viewingDistanceSlider = document.getElementById('viewingDistanceSlider') as HTMLInputElement;
	if (viewingDistanceSlider) 
	{
		viewingDistanceSlider.oninput = (event: any) => {return setViewingDistance(event.target.value);};
	}
	
	const cameraCheckbox = document.getElementById('camera') as HTMLInputElement;
	if (cameraCheckbox) 
	{
		cameraCheckbox.onchange = (event: any) => {return toggleCamera();};
		cameraCheckbox.value = showingCamera as any;
	}
	
	const drawElevationsCheckbox = document.getElementById('drawElevations') as HTMLInputElement;
	if (drawElevationsCheckbox) 
	{
		drawElevationsCheckbox.onchange = (event: any) => {return toggleDrawElevations();};
		drawElevationsCheckbox.value = drawElevations as any;
	}
	const normalsInDebugCheckbox = document.getElementById('normalsInDebug') as HTMLInputElement;
	if (normalsInDebugCheckbox) 
	{
		normalsInDebugCheckbox.onchange = (event: any) => {return toggleNormalsInDebug();};
		normalsInDebugCheckbox.value = drawNormals as any;
	}

	const lodSlider = document.getElementById('lodSlider') as HTMLInputElement;
	if (lodSlider) 
	{
		lodSlider.oninput = (event: any) => {return setLOD(event.target.value);};
	}

	selectedPeakLabel = document.getElementById('selectedPeakLabel') as HTMLLabelElement;
	elevationLabel = document.getElementById('elevationLabel') as HTMLLabelElement;
	selectedPeakDiv = document.getElementById('selectedPeak') as HTMLDivElement;
	lodLabel = document.getElementById('lodLabel') as HTMLLabelElement;
	if (lodLabel) 
	{
		lodLabel.innerText = LOD;
	}

	
	var hammertime = new Hammer(canvas);
	hammertime.on('tap', function(event ) 
	{
		mousePosition = new THREE.Vector2(event.center.x, event.center.y);
		render(true);
	});
}
catch (err) {}

const heightProvider = new LocalHeightProvider(devLocal);
setTerrarium(heightProvider.terrarium);

function onControlUpdate() 
{	
	map.lod.updateLOD(map, camera, renderer, scene);
	if (compass) 
	{
		let angle, pitch;
		if (controls.deviceOrientationEnabled) 
		{
			angle = controls.orientationAzimuth * TO_DEG % 360;
			pitch = controls.orientationPolar * TO_DEG % 360;
		}
		else 
		{
			angle = controls.azimuthAngle * TO_DEG % 360;
			pitch = controls.polarAngle * TO_DEG % 360;
		}
		if (compassLabel) 
		{
			compassLabel.innerText = angle.toFixed() + '°';

		}
		compassSlice.style.backgroundImage = `conic-gradient(transparent 0deg,transparent ${180 - cameraFOV/2}deg, #15BFCCaa ${180 - cameraFOV/2}deg, #15BFCCaa ${180 + cameraFOV/2}deg, transparent ${180 + cameraFOV/2}deg)`;
		compassSlice.style.transform = `rotateZ(${-angle - 180}deg)`;
		// compass.style.transform = `rotateX(${90 - pitch}deg)`;
	}
	// if (window['nsWebViewBridge']) 
	// {
	// 	window['nsWebViewBridge'].emit('controls', {
	// 		// distance: controls.distance,
	// 		azim: controls.azimuthAngle * TO_DEG
	// 	});
	// }
	render();
}
function setupLOD() 
{
	heightProvider.maxOverZoom = debug || mapMap ? 2: devLocal?1:0;
	lod.subdivideDistance = 40;
	lod.simplifyDistance = 140;
}
const lod = new LODFrustum();
setupLOD();
function createProvider() 
{
	let provider;
	if (mapMap) 
	{
		provider = new RasterMapProvider(devLocal);
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
	provider.zoomDelta = 1 ;
	provider.minLevelForZoomDelta = 10 ;
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
	// map.lowMemoryUsage = isMobile;
	map.lowMemoryUsage = true;
	map.setRoot(new MaterialHeightShader(null, map, MapNode.ROOT, 0, 0, 0));
	// map.setRoot(new MapMartiniHeightNode(null, map, MapNode.ROOT, 0, 0, 0));
	map.lod = lod;
	map.updateMatrixWorld(true);
	scene.add(map);
	// renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	// renderer.shadowMap.enabled = mapMap;

}

createMap();
const cameraFOV = 40;
const camera = new THREE.PerspectiveCamera(cameraFOV, viewWidth / viewHeight, 100, FAR);
camera.position.set(0, 0, EPS);
const controls = new CameraControlsWithOrientation(camera, canvas);
controls.azimuthRotateSpeed = -0.2; // negative value to invert rotation direction
controls.polarRotateSpeed = -0.2; // negative value to invert rotation direction
controls.minZoom = 1;
// controls.minDistance = -10000;
// controls.maxDistance = 1000;
// controls.dollyToCursor = true;
controls.truckSpeed = 1 / EPS * 60000;
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
const ambientLight = new THREE.AmbientLight( 0xffffff, 1);
scene.add( ambientLight );
scene.add(camera );
sky.visible = sunLight.visible = shouldRenderSky();
ambientLight.visible = needsLights();

// const fog = new THREE.Fog(0xffffff, camera.near, camera.far * 2);

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

const axesHelper = new THREE.AxesHelper( 50 );
// scene.add( axesHelper );

function updateSky() 
{
	const phi = Math.PI /2 - sunLight.elevation;
	const theta = Math.PI - sunLight.azimuth;
	const sun = new THREE.Vector3();
	sun.setFromSphericalCoords( 1, phi, theta );

	sky.material.uniforms['sunPosition'].value.copy( sun );
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
		viewingDistanceLabel.innerText = Math.round(currentViewingDistance/1000) + 'km';
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
export function setPosition(coords, animated = false) 
{
	const newPosition= UnitsUtils.datumsToSpherical(coords.lat, coords.lon);
	// axesHelper.position.set(newPosition.x, 1300, -newPosition.y - 1000);
	const currentCoords ={lat: sunLight.coordinates.x, lon: sunLight.coordinates.y};
	sunLight.setPosition(coords.lat, coords.lon);
	sunLight.setDate(new Date());
	updateSky();
	setSelectedItem(null);
	
	if (animated) 
	{
		const distance = getDistance(currentCoords, coords) ;
		const startAimingAngle = controls.azimuthAngle * TO_DEG % 360;
		let topAimingAngle = -getRhumbLineBearing(currentCoords, coords);
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
		// else 
		// {
		// 	currentPositionAltitude = -1;
		// }
		// always move to be "over" the peak
		const topElevation = distance > 100000? 11000 * exageration: endElevation ;
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
					const cProgress = 5*progress;
					controls.azimuthAngle = (startAimingAngle + cProgress* (topAimingAngle - startAimingAngle)) * TO_RAD;
				}
				if (progress <= 0.5) 
				{
					const cProgress = 2*progress;
					controls.moveTo(currentPosition.x, startElevation + cProgress* (topElevation - startElevation), -currentPosition.y, false);
				}
				else 
				{
					const cProgress = (progress - 0.5) * 2;
					controls.moveTo(currentPosition.x, topElevation + cProgress* (endElevation - topElevation), -currentPosition.y, false);
				}
				controls.update(1);
			},
			onEnd: () => 
			{
				setElevation(Math.round(endElevation / exageration), false);
				updateCurrentViewingDistance();
				if (window['nsWebViewBridge']) 
				{
					window['nsWebViewBridge'].emit('position', {...currentPosition, altitude: endElevation});
				}
			}
		});
	}
	else 
	{
		if (coords.altitude) 
		{
			// currentPositionAltitude = coords.altitude + 100;
			setElevation(coords.altitude + 100, false);
		}
		// else 
		// {
		// 	currentPositionAltitude = -1;
		// }
		currentPosition = newPosition;

		controls.moveTo(currentPosition.x, elevation * exageration, -currentPosition.y, false);
		controls.update(1);
		updateCurrentViewingDistance();
	}
}
export function setElevation(newValue, updateControls = true) 
{
	if (elevation === newValue) 
	{
		return;
	}
	elevation = newValue;
	if (elevationLabel) 
	{
		elevationSlider.value = elevation as any;
		elevationLabel.innerText = newValue + 'm';
	}	
	if (updateControls) 
	{
		controls.getTarget(tempVector);
		controls.moveTo(tempVector.x, elevation * exageration, tempVector.z);
		controls.update(1);

	}
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

export function setLOD(level) 
{
	LOD = level;
	if (map) 
	{
		applyOnNodes((node) => 
		{
			node.geometry = MaterialHeightShader.getGeometry(node.level);
		});
	}
	if (lodLabel) 
	{
		lodLabel.innerText = level;
	}
	render();
}
export function setDate(secondsInDay) 
{
	let date = new Date();
	const hours = Math.floor(secondsInDay/3600);
	const minutes = Math.floor((secondsInDay - hours*3600)/ 60);
	const seconds = secondsInDay - hours*3600 - minutes*60;
	date.setHours(hours);
	date.setMinutes(minutes);
	date.setSeconds(seconds);
	sunLight.setDate(date);
	if (datelabel) 
	{
		datelabel.innerText = date.toLocaleString();
	}

	updateSky();
	render();
} 
controls.addEventListener('update', () => 
{
	onControlUpdate();
});
controls.addEventListener('controlend', () => 
{
	// force a render at the end of the movement to make sure we show the correct peaks
	render(true);
});
controls.addEventListener('control', (event) => 
{
	const zooming = controls.zooming;
	const trucking = controls.trucking;
	if (event.originalEvent && event.originalEvent.buttons) 
	{
		shouldClearSelectedOnClick = false;
	}
	controls.azimuthRotateSpeed = -0.2 / camera.zoom ; // negative value to invert rotation direction
	controls.polarRotateSpeed = -0.2 / camera.zoom ; // negative value to invert rotation direction
	controls.update(1);
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
	render();
});
composer.addPass(new POSTPROCESSING.RenderPass(scene, camera));
const outlineEffect = new CustomOutlineEffect();
const pass = new POSTPROCESSING.EffectPass(camera, outlineEffect);
composer.addPass(pass);

let minYPx = 0;
function actualComputeFeatures() 
{
	let oldSyVisible = sky.visible;
	let oldSunLightVisible = sunLight.visible;
	let oldAmbientLightVisible = ambientLight.visible;
	sky.visible = false;
	sunLight.visible = false;
	ambientLight.visible = false;

	applyOnNodes((node) => 
	{
		node.material.userData.drawBlack.value = true;
		node.material.userData.computeNormals.value = false;
		node.objectsHolder.visible = node.isMesh || node.level === 14 && node.parentNode.subdivided;
		let child = node.objectsHolder.children[0];
		if (child) 
		{
			child.material.userData.forViewing.value = false;
		}
	});
	if (debugGPUPicking) 
	{
		rendereroff.setRenderTarget(null);
		rendereroff.render(scene, camera);
	}
	rendereroff.setRenderTarget(pointBufferTarget);
	rendereroff.render(scene, camera);

	readShownFeatures();

	const shouldShowNormals = shouldComputeNormals();
	applyOnNodes((node) => 
	{
		node.material.userData.drawBlack.value = false;
		node.material.userData.computeNormals.value = shouldShowNormals;
		node.objectsHolder.visible = node.isMesh && debugFeaturePoints || node.level === 14 && node.parentNode.subdivided;
		// node.objectsHolder.visible = node.isMesh && debugFeaturePoints;
		let child = node.objectsHolder.children[0];
		if (child) 
		{
			child.material.userData.forViewing.value = debugFeaturePoints;
		}
		
	});
	sky.visible = oldSyVisible;
	sunLight.visible = oldSunLightVisible;
	ambientLight.visible = oldAmbientLightVisible;
}
const computeFeatures = throttle(actualComputeFeatures, 100);
document.body.onresize = function() 
{
	viewWidth= window.innerWidth;
	viewHeight = window.innerHeight;
	const scale = viewWidth / viewHeight;
	let offWidth;
	let offHeight;
	if (scale > 1) 
	{
		offWidth = Math.max(Math.floor(viewWidth/100) * 100 /4, 200);
		offHeight = Math.round(offWidth / scale);
	}
	else 
	{
		offHeight = Math.max(Math.floor(viewHeight/100) * 100 /4, 200);
		offWidth = Math.round(offHeight * scale); 
	}

	minYPx = TEXT_HEIGHT / viewHeight * offHeight;

	canvas4.width = Math.floor(viewWidth * devicePixelRatio);
	canvas4.height = Math.floor(viewHeight * devicePixelRatio);
	const rendererScaleRatio = 1 + (devicePixelRatio - 1) / 2;

	renderer.setSize(viewWidth, viewHeight);
	// rendererMagnify.setSize(width, height);
	renderer.setPixelRatio(rendererScaleRatio);
	// rendererMagnify.setPixelRatio(rendererScaleRatio);
	// magnify3dTarget.setSize(width *devicePixelRatio, height *devicePixelRatio);

	pixelsBuffer = new Uint8Array(offWidth * offHeight * 4);
	rendereroff.setSize(offWidth, offHeight);
	rendereroff.setPixelRatio(1);
	pointBufferTarget.setSize(offWidth, offHeight);

	composer.setSize(viewWidth, viewHeight);
	// composer.setPixelRatio(rendererScaleRatio);
	camera.aspect = scale;
	camera.updateProjectionMatrix();

	render();
};
// @ts-ignore
document.body.onresize();
controls.update(0);

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

function truncate(str, maxlength) 
{
	return str.length > maxlength ?
		str.slice(0, maxlength - 1) + '…' : str;
}
function updateSelectedPeakLabel() 
{
	const point1 = UnitsUtils.sphericalToDatums(currentPosition.x, currentPosition.y);
	const point2= {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele};
	const distance = getDistance(point1, point2) ;
	selectedPeakLabel.innerText = selectedItem.properties.name + ' ' + selectedItem.properties.ele +'m(' + Math.round(distance/100) / 10 +'km)';
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
			const point2= {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele};
			distance = getDistance(point1, point2) ;
		}
		
		window['nsWebViewBridge'].emit('selected', selectedItem ? {...selectedItem, distance: distance} : null);
	}
}
function setSelectedItem(f) 
{
	if (f === selectedItem) 
	{
		return;
	}
	selectedItem = f;
	// console.log('setSelectedItem', f && f.properties.name);
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
		selectedPeakDiv.style.visibility = selectedItem?'visible':'hidden';
	}
}
export function goToSelectedItem() 
{
	if (selectedItem) 
	{
		// ensure we dont end up in the mesh
		const point2= {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0], altitude: selectedItem.properties.ele + 100};
		setPosition(point2, true);
	}

}
export function focusSelectedItem() 
{
	if (selectedItem) 
	{
		controls.getPosition(tempVector);
		const point1 = UnitsUtils.sphericalToDatums(tempVector.x, -tempVector.z);
		const point2= {lat: selectedItem.geometry.coordinates[1], lon: selectedItem.geometry.coordinates[0]};
		const angle = 360 - getRhumbLineBearing({lat: point1.latitude, lon: point1.longitude}, point2) ;
		setAzimuth(angle);
	}
}

function isSelectedFeature(f) 
{
	if (devLocal ) 
	{
		return selectedItem && f.properties.osmid === selectedItem.properties.osmid;
	}
	return selectedItem && f.properties.name === selectedItem.properties.name && f.properties.ele === selectedItem.properties.ele;
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
		tempVector.set(coords.x, (f.properties.ele || 0) * exageration, -coords.y);
		const vector = toScreenXY(tempVector);
		return {...f, x: vector.x, y: vector.y, z: vector.z};
	});
	let deltaY;
	featuresToShow = ArraySortOn(featuresToShow, 'x');

	const featuresToDraw = [];
	let canTestHeight = true;
	let newlySelectedItem = null;
	featuresToShow.forEach((f, index) => 
	{	
		if (mousePosition) 
		{
			const distance = Math.sqrt(Math.pow(mousePosition.x - f.x, 2) + Math.pow(mousePosition.y - f.y, 2));
			if (distance < 10) 
			{
				newlySelectedItem = f;
				mousePosition = null;
			}
		}
		
		if (!lastFeature) 
		{
			// first
			lastFeature = f;
		}
		else if (f.x - lastFeature.x <= minDistance ) 
		{
			if (isSelectedFeature(lastFeature)) 
			{
				featuresToDraw.push(lastFeature);
				canTestHeight = false;
				// lastFeature = f;
			}
			else 
			{
				deltaY = f.properties.ele - lastFeature.properties.ele;
				if (isSelectedFeature(f) || deltaY > 0)
				{
					lastFeature = f;
				}
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
	const rectTop = -12;
	const rectBottom = 17;


	for (let index = 0; index < toShow; index++) 
	{
		const f = featuresToDraw[index];
		// const y = f.screenY ?? f.y;
		const y = f.y;
		if (y < TEXT_HEIGHT || f.z >= FAR || f.z / f.properties.ele > FAR / 3000) 
		{
			continue;
		}

		const textColor = darkTheme ? 'white' : 'black';
		const color = darkTheme ? '#000000' : '#ffffff';
		ctx2d.beginPath();
		ctx2d.strokeStyle = textColor;
		ctx2d.moveTo(f.x, TEXT_HEIGHT);
		ctx2d.lineTo(f.x, y);
		ctx2d.closePath();
		ctx2d.stroke();
		ctx2d.save();
		ctx2d.translate(f.x, TEXT_HEIGHT);
		ctx2d.rotate(-Math.PI / 4);
		ctx2d.font = '14px Noto Sans';
		const text = truncate(f.properties.name, 28);
		const textWidth = ctx2d.measureText(text).width;
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
			var point = new DOMPoint(mousePosition.x * devicePixelRatio, mousePosition.y * devicePixelRatio);
			const test = point.matrixTransform(transform);
			if (test.x >= 0 && test.x < totalWidth && 
			test.y < -rectTop && test.y>=-rectBottom ) 
			{
				newlySelectedItem = f;
				mousePosition = null;
			}
		}
		if (selectedItem && isSelectedFeature(f) ) 
		{
			ctx2d.font = 'bold 14px Noto Sans';
			totalWidth *=1.1;
			ctx2d.fillStyle = color + 'aa';
		}
		else 
		{
			ctx2d.fillStyle = color + 'cc';
		}
		roundRect(ctx2d, 0, rectTop, totalWidth, rectBottom, 8);
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
	if (newlySelectedItem) 
	{
		setSelectedItem(newlySelectedItem);
	}
	else if (mousePosition) 
	{
		setSelectedItem(null);
	}
	ctx2d.restore();
	mousePosition = null;
}

function readShownFeatures() 
{
	const width = pointBufferTarget.width;
	const height = pointBufferTarget.height;
	const hScale = viewHeight / height;
	const lineWidth = 4 * width;
	rendereroff.readRenderTargetPixels(pointBufferTarget, 0, 0, width, height, pixelsBuffer);
	const readColors = [];
	const rFeatures = [];
	let needsSelectedItem = Boolean(selectedItem);
	let lastColor;
	function handleLastColor(index) 
	{
		if (readColors.indexOf(lastColor) === -1) 
		{
			const y = viewHeight - Math.floor( index / lineWidth) * hScale;
			readColors.push(lastColor);
			const feature = featuresByColor[lastColor];
			if (feature) 
			{
				rFeatures.push({...feature, screenY: y});
				if (needsSelectedItem && isSelectedFeature(feature)) 
				{
					needsSelectedItem = false;
				}
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
	if (needsSelectedItem) 
	{
		rFeatures.push({...selectedItem, screenY: null});
	}
	featuresToShow = rFeatures;
}

function withoutComposer() 
{
	return (debug || mapMap) && !mapoutline;
}
function actualRender(forceComputeFeatures) 
{
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
		drawFeatures();
	}
	applyOnNodes((node) =>
	{
			
		node.objectsHolder.visible = debugFeaturePoints && (node.isMesh || node.level === 14 && node.parentNode.subdivided);
		let child = node.objectsHolder.children[0];
		if (child) 
		{
			child.material.userData.forViewing.value = debugFeaturePoints;
		}
	});

	if (withoutComposer()) 
	{
		renderer.render(scene, camera);
	}
	else 
	{
		composer.render(clock.getDelta());
	}
}
export function render(forceComputeFeatures = false) 
{
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
	actualRender(forceComputeFeatures);
	// }
	if (stats) 
	{
		stats.end();
	}
}

export function setInitialPosition() 
{
	moveToStartPoint(false);
	// setAzimuth(90 );
	// setElevation(100);
}
if (datelabel) 
{
	setElevation(277, false);
	setInitialPosition();
}

export function moveToEndPoint(animated = true) 
{
	setPosition({lat: 42.51908, lon: 3.10784}, animated);
}

export function moveToStartPoint(animated = true) 
{
	// setPosition({lat: 45.19177, lon: 5.72831}, animated);
	setPosition({lat: 44.86056, lon: 6.05242}, animated);
}

var requestId;

function animationLoop(time) 
{
	requestId = undefined;

	TWEEN.update(time);
	startLoop();
}

function startLoop() 
{
	if (!requestId) 
	{
		requestId = window.requestAnimationFrame(animationLoop);
	}
}

function stopLoop() 
{
	if (requestId) 
	{
		window.cancelAnimationFrame(requestId);
		requestId = undefined;
	}
}

function startAnimation({from, to, duration, onUpdate, onEnd, preventComputeFeatures}: {from, to, duration, onUpdate?, onEnd?, preventComputeFeatures?}) 
{
	startLoop();
	animating = preventComputeFeatures;
	ctx2d.clearRect(0, 0, canvas4.width, canvas4.height);
	new TWEEN.Tween( from )
		.to( to, duration )
		.easing( TWEEN.Easing.Quadratic.Out )
		.onUpdate( onUpdate).onComplete(() => 
		{
			animating = false;
			if (onEnd) 
			{
				onEnd();
			}
			stopLoop();
			render(true);
		}).start();
}

export function setAzimuth(value: number) 
{
	const current = controls.azimuthAngle * TO_DEG % 360;
	if (current === value) 
	{
		return;
	}
	if (Math.abs(value - 360 - current) < Math.abs(value - current)) 
	{
		value = value - 360;
	}
	startAnimation({
		from: {progress: current},
		to: {progress: value},
		duration: 200,
		onUpdate: function( values ) 
		{
			controls.azimuthAngle = values.progress* TO_RAD;
			controls.update(1);
		}
	});
}
export function setViewingDistance(meters: number) 
{
	FAR = meters / currentViewingDistance * FAR;
	camera.far = FAR;
	camera.updateProjectionMatrix();
	updateCurrentViewingDistance();

	if (map) 
	{
		applyOnNodes((node) => 
		{
			let child = node.objectsHolder.children[0];
			if (child) 
			{
				child.material.uniforms.far.value = FAR;
			}
		});
	}
	render(true);
}


function getDistance(start, end) 
{
	const slat = (start.latitude || start.lat) * TO_RAD;
	const slon = (start.longitude|| start.lon)* TO_RAD;
	const elat = (end.latitude || end.lat) * TO_RAD;
	const elon = (end.longitude || end.lon) * TO_RAD;
	return Math.round(
		Math.acos(Math.sin(elat) * Math.sin(slat) + Math.cos(elat) * Math.cos(slat) * Math.cos(slon - elon)) * UnitsUtils.EARTH_RADIUS
	);
}
function getViewingDistance() 
{

	var farPoint = new THREE.Vector3( 0, 0, -camera.far );
	farPoint.applyMatrix4( camera.matrixWorld );
	const point1 = UnitsUtils.sphericalToDatums(currentPosition.x, currentPosition.y);
	const point2 = UnitsUtils.sphericalToDatums(farPoint.x, -farPoint.z);
	return getDistance(point1, point2);
}
setShowStats(showStats);
