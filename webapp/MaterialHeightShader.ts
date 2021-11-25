import {pointToTileFraction, tileToBBOX} from '@mapbox/tilebelt';
import {BufferGeometry, DoubleSide, Float32BufferAttribute, Intersection, LinearFilter, LOD, Mesh, Points, Raycaster, RepeatWrapping, ShaderLib, ShaderMaterial, Texture, TextureLoader, Vector2, Vector3} from 'three';
import {MapNodeGeometry} from '../source/geometries/MapNodeGeometry';
import {MapView} from '../source/MapView';
import {MapHeightNode} from '../source/nodes/MapHeightNode';
import {MapPlaneNode} from '../source/nodes/MapPlaneNode';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {elevationDecoder, exageration, GEOMETRY_SIZE, isMobile} from './app';


export let featuresByColor = {};
export let testColor;
let readPixelCanvas: HTMLCanvasElement;
export function getImageData( image ): ImageData
{
	if (!readPixelCanvas) 
	{
		readPixelCanvas = document.createElement( 'canvas' );
	}
	readPixelCanvas.width = image.width;
	readPixelCanvas.height = image.height;
	var context = readPixelCanvas.getContext( '2d' );
	context.drawImage( image, 0, 0 );
	return context.getImageData( 0, 0, image.width, image.height );
}

let fractionTile, fractionX, fractionY;
export function getPixel( imageData: ImageData, heightMapLocation: [number, number, number, number], coords: {lat: number, lon: number}, level ): Uint8ClampedArray
{
	fractionTile = pointToTileFraction(coords.lon, coords.lat, level);
	fractionX = fractionTile[0] - Math.floor(fractionTile[0]);
	fractionY = 1- (fractionTile[1] - Math.floor(fractionTile[1]));
	fractionX = fractionX * heightMapLocation[2] + heightMapLocation[0];
	fractionY = fractionY * heightMapLocation[3] + heightMapLocation[1];
	const x= Math.round(imageData.width * fractionX);
	const y= Math.round(imageData.height * fractionY);
	const position = ( x + imageData.width * y ) * 4;
	const result = imageData.data.slice(position, position + 4);
	// console.log('getPixel', coords, level, heightMapLocation, fractionTile, fractionX, fractionY, x, y, result);
	return result;
}
const maxLevelForGemSize = 12;
function hashString( str, seed = 0 ): number 
{

	let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;

	for ( let i = 0, ch; i < str.length; i ++ ) 
	{

		ch = str.charCodeAt( i );

		h1 = Math.imul( h1 ^ ch, 2654435761 );

		h2 = Math.imul( h2 ^ ch, 1597334677 );

	}

	h1 = Math.imul( h1 ^ h1 >>> 16, 2246822507 ) ^ Math.imul( h2 ^ h2 >>> 13, 3266489909 );

	h2 = Math.imul( h2 ^ h2 >>> 16, 2246822507 ) ^ Math.imul( h1 ^ h1 >>> 13, 3266489909 );

	return 4294967296 * ( 2097151 & h2 ) + ( h1 >>> 0 );

}

class CustomMaterial extends ShaderMaterial 
{
	private static cachedKey;

	public customProgramCacheKey(): string
	{
		if (!CustomMaterial.cachedKey) 
		{
			CustomMaterial.cachedKey = hashString(super.customProgramCacheKey());
		}
		return CustomMaterial.cachedKey;
	}

	public onBeforeCompile(shader: { uniforms: { [x: string]: any; }; vertexShader: string; fragmentShader: string; }): void
	{
		// Pass uniforms from userData to the
		for (const i in this.userData) 
		{
			shader.uniforms[i] = this.userData[i];
		}
	}

	public onBeforeRender(renderer, scene, camera, geometry, object, group): void 
	{	
		if (MaterialHeightShader.useSharedShader) 
		{
			const parent = object.parent.parent;
			// this.uniforms['map'].value = parent.map;
			for (const i in parent.userData) 
			{
				this.uniforms[i] = parent.userData[i];
			}
			this.uniformsNeedUpdate = true;
		}
	}
}
class PointMaterial extends ShaderMaterial 
{
	private static cachedKey;

	public customProgramCacheKey(): string
	{
		if (!PointMaterial.cachedKey) 
		{
			PointMaterial.cachedKey = hashString(super.customProgramCacheKey());
		}
		return PointMaterial.cachedKey;
	}

	public onBeforeRender(renderer, scene, camera, geometry, object, group): void 
	{	
		for (const i in object.userData) 
		{
			this.uniforms[i] = object.userData[i];
		}
		this.uniformsNeedUpdate = true;
	}
}

const EMPTY_TEXTURE = new Texture();

export const sharedPointMaterial = new PointMaterial({
	depthWrite: false,
	depthTest: false,
	uniforms: {
		exageration: {value: 1},
		depthTexture: {value: EMPTY_TEXTURE}, 
		cameraNear: {value: 10},
		cameraFar: {value: 1000000}
	},
	vertexShader: `
#include <packing>
attribute vec4 color;

uniform sampler2D depthTexture;
uniform float cameraNear;
uniform float cameraFar;
uniform float exageration;

varying vec2 vUv;
varying float depth;
varying vec4 vColor;

float readDepth(const in vec2 uv) {
return texture2D(depthTexture, uv).r;
}
float getViewZ(const in float depth) {
return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
}
float readZDepth(vec2 uv) {
return viewZToOrthographicDepth( getViewZ(readDepth(uv)), cameraNear, cameraFar );
}
float getDigit(float num, float n) {
   return mod((num / pow(10.0, n)), 10.0);
}
void main() {
float elevation  = position.y * exageration ;
vec4 mvPosition = modelViewMatrix * vec4( position.x,  elevation, position.z, 1.0 );
// mvPosition.z -= pow(getDigit(elevation, 2.0), 2.0) * mvPosition.z / 1000.0;
mvPosition.z -= (elevation / 1000.0 - floor(elevation / 1000.0)) * mvPosition.z / 1000.0;
gl_Position = projectionMatrix * mvPosition;
gl_PointSize = 2.0;
float depthFromPosition = viewZToOrthographicDepth(mvPosition.z, cameraNear, cameraFar);
vec3 coord = gl_Position.xyz / gl_Position.w;
vUv =(coord.xy + 1.0) * 0.5 ;
float depthAtPoint = readZDepth(vUv);
if (depthAtPoint > cameraFar || depthFromPosition > depthAtPoint + 0.005) {
depth = -1.0;
vColor = vec4( 0.0, 0.0, 0.0, 0.0);
} else {
depth = depthAtPoint;
vColor = color;
}
}
	`,
	fragmentShader: `
#include <packing>
varying vec4 vColor;
varying float depth;

void main() {
	if (depth < 0.0 ) {
		discard;
	}
	gl_FragColor = vColor;
}
	`,
	transparent: false
});

function pick<T extends object, U extends keyof T>(object: T, ...props: U[]): Pick<T, U> 
{
	return props.reduce((o, k) => { o[k] = object[k];return o;}, {} as any);
}
// Convert numbers to strings of floats so GLSL doesn't barf on "1" instead of "1.0"
function glslifyNumber(n): string
{
	return n === (n|0) ? n+'.0' : String(n);
}
function createSharedMaterial(): CustomMaterial 
{

	const phongShader = ShaderLib['phong'];
	const sharedMaterial = new CustomMaterial( {
		lights: true,
		fragmentShader: `
uniform bool drawNormals;
uniform bool generateColor;
uniform bool drawTexture;
uniform bool drawBlack;
uniform vec4 mapMapLocation;
uniform float exageration;
uniform float zoomlevel;
varying vec4 vPosition;
// varying vec3 vViewPosition;
#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <lightmap_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <normalmap_pars_fragment>
#include <clipping_planes_pars_fragment>

#define SNOW_HEIGHT 1800.0
#define BEACH_HEIGHT 140.5
#define GRASS_HEIGHT 2053.5
#define HASHSCALE1 .1031
vec2 add = vec2(1.0, 0.0);
//  1 out, 2 in...
float Hash12(vec2 p)
{
	vec3 p3  = fract(vec3(p.xyx) * HASHSCALE1);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
}
float Noise( in vec2 x, float factor )
{
    vec2 p = floor(x*factor);
    vec2 f = fract(x*factor);
    f = f*f*(3.0-2.0*f);
    
    float res = mix(mix( Hash12(p),          Hash12(p + add.xy),f.x),
                    mix( Hash12(p + add.yx), Hash12(p + add.xx),f.x),f.y);
    return res;
}
//--------------------------------------------------------------------------
// Hack the height, position, and normal data to create the coloured landscape
// vec3 TerrainColour(vec3 pos, vec3 normal, float dis)
vec3 TerrainColour(vec4 matPos, vec3 normal)
{
	vec3 mat;
	// specular = .0;
	// ambient = .1;
	// vec3 dir = normalize(pos-cameraPos);
	
	float f = clamp(Noise(matPos.xz*.05, 2.0), 0.0,1.0);//*10.8;
	f += Noise(matPos.xz*.1+normal.yz*1.08, 2.0)*.85;
	f *= .55;
	vec3 m = mix(vec3(.63*f+.2, .7*f+.1, .7*f+.1), vec3(f*.43+.1, f*.3+.2, f*.35+.1), f*.65);
	mat = m*vec3(f*m.x+.36, f*m.y+.30, f*m.z+.28);
	// Should have used smoothstep to add colours, but left it using 'if' for sanity...
	if (normal.y < .5)
	{
		float v = normal.y;
		float c = (.5-normal.y) * 4.0;
		c = clamp(c*c, 0.1, 1.0);
		f = Noise(vec2(matPos.x*.09, matPos.z*.095+matPos.yy*0.15), 1.0);
		f += Noise(vec2(matPos.x*2.233, matPos.z*2.23), 1.0)*0.5;
		mat = mix(mat, vec3(.4*f), c/1.6);
		// specularStrength+=.1;
	}
	// Grass. Use the normal to decide when to plonk grass down...
	if (matPos.y < GRASS_HEIGHT && normal.y > 0.65)
	{

		m = vec3(Noise(matPos.xz*.023, 2.0)*.5+.15, Noise(matPos.xz*.03, 2.0)*.6+.25, 0.0);
		m *= (normal.y- 0.65)*.6;
		mat = mix(mat, m, clamp((normal.y-0.65)*1.3 * (GRASS_HEIGHT-matPos.y)*0.003, 0.0, 1.0));
	}

	// if (treeCol > 0.0)
	// {
		// mat = vec3(.02+Noise(matPos.xz*5.0, 1.0)*.03, .05, .0);
		// normal = normalize(normal+vec3(Noise(matPos.xz*33.0, 1.0)*1.0-.5, .0, Noise(matPos.xz*33.0, 1.0)*1.0-.5));
		// specular = .0;
	// }
	
	// Snow topped mountains...
	if (matPos.y > SNOW_HEIGHT && normal.y > .42)
	{
		float snow = clamp(((matPos.y - SNOW_HEIGHT)*(normal.y-0.42)*3.5 - Noise(matPos.xz * .1, 1.0)*28.0) * 0.0015, 0.0, 1.0);
		// snow *= (normal.y- .42)*.6;
		mat = mix(mat, vec3(.7,.7,.8), snow);
		// specular += snow;
		// ambient+=snow *.3;
	}
	// Beach effect...
	if (matPos.y < BEACH_HEIGHT)
	{
		if (normal.y > .4)
		{
			f = Noise(matPos.xz * .084, 1.0)*1.5;
			f = clamp((BEACH_HEIGHT-f-matPos.y) * 1.34, 0.0, .67);
			float t = (normal.y-.4);
			t = (t*t);
			mat = mix(mat, vec3(.09+t, .07+t, .03+t), f);
		}
		// Cheap under water darkening...it's wet after all...
		if (matPos.y < 0.0)
		{
			mat *= .2;
		}
	}

	// DoLighting(mat, pos, normal,dir, disSqrd);
	
	// Do the water...
	// if (matPos.y < 0.0)
	// {
	// 	// Pull back along the ray direction to get water surface point at y = 0.0 ...
	// 	float time = (iTime)*.03;
	// 	vec3 watPos = matPos;
	// 	watPos += -dir * (watPos.y/dir.y);
	// 	// Make some dodgy waves...
	// 	float tx = cos(watPos.x*.052) *4.5;
	// 	float tz = sin(watPos.z*.072) *4.5;
	// 	vec2 co = Noise2(vec2(watPos.x*4.7+1.3+tz, watPos.z*4.69+time*35.0-tx));
	// 	co += Noise2(vec2(watPos.z*8.6+time*13.0-tx, watPos.x*8.712+tz))*.4;
	// 	vec3 nor = normalize(vec3(co.x, 20.0, co.y));
	// 	nor = normalize(reflect(dir, nor));//normalize((-2.0*(dot(dir, nor))*nor)+dir);
	// 	// Mix it in at depth transparancy to give beach cues..
    //     tx = watPos.y-matPos.y;
	// 	mat = mix(mat, GetClouds(GetSky(nor)*vec3(.3,.3,.5), nor)*.1+vec3(.0,.02,.03), clamp((tx)*.4, .6, 1.));
	// 	// Add some extra water glint...
    //     mat += vec3(.1)*clamp(1.-pow(tx+.5, 3.)*texture(iChannel1, watPos.xz*.1, -2.).x, 0.,1.0);
	// 	float sunAmount = max( dot(nor, sunLight), 0.0 );
	// 	mat = mat + sunColour * pow(sunAmount, 228.5)*.6;
    //     vec3 temp = (watPos-cameraPos*2.)*.5;
    //     disSqrd = dot(temp, temp);
	// }
	// mat = ApplyFog(mat, disSqrd, dir);
	return mat;
}
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	if (generateColor) {
		diffuseColor = vec4(TerrainColour(vPosition, vNormal.rbg), 0.8);
	} else {
		vec4 texelColor = texture2D(map, vUv * mapMapLocation.zw + mapMapLocation.xy);
		texelColor = mapTexelToLinear( texelColor );
		diffuseColor *= texelColor;
	}
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <output_fragment>
	#include <encodings_fragment>

	
	if(drawBlack) {
		gl_FragColor = vec4( 0.0,0.0,0.0, 1.0 );
	} else if(drawNormals) {
	#ifndef FLAT_SHADED
		gl_FragColor = vec4( ( 0.5 * vNormal + 0.5 ), 1.0 );
	#else 
		gl_FragColor = vec4( ( 0.5 * normal + 0.5 ), 1.0 );
	#endif
	} else if (!drawTexture) {
		gl_FragColor = vec4( 0.0,0.0,0.0, 0.0 );
	}
}
`,
		vertexShader: `
uniform bool computeNormals;
uniform float exageration;
uniform float zoomlevel;
uniform sampler2D heightMap;
uniform vec4 elevationDecoder;
uniform vec4 heightMapLocation;
varying vec4 vPosition;

float getPixelElevation(vec4 e) {
	// Convert encoded elevation value to meters
	return ((e.r * elevationDecoder.x + e.g * elevationDecoder.y  + e.b * elevationDecoder.z) + elevationDecoder.w) * exageration;
}
float getElevation(vec2 coord, float width, float height) {
	vec4 e = texture2D(heightMap, coord * heightMapLocation.zw + heightMapLocation.xy);
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
		return getElevation(coord, width, height);
	} else {
		return 2.0 * getElevation(vec2(x0,y0), width, height) -  getElevation(vec2(x1,y1), width, height);
	}
}
#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <uv_pars_vertex>
#include <normal_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	// #include <uv_vertex>
	#include <begin_vertex>
	#include <project_vertex>
	#include <clipping_planes_vertex>
	// vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	ivec2 size = textureSize(heightMap, 0);
	float width = float(size.x) * heightMapLocation.z;
	float height = float(size.y) * heightMapLocation.w;
	vUv = vec2(position.x +  0.5, 0.5 - position.z );
	float mean = getElevationMean(vUv, width,height);
	// vViewPosition.y = mean / exageration;
	#ifndef FLAT_SHADED
		if (computeNormals) {
			float offset = 1.0 / width;
			float a = getElevation(vUv + vec2(-offset, -offset), width,height);
			float b = getElevation(vUv + vec2(0, -offset), width,height);
			float c = getElevation(vUv + vec2(offset, -offset), width,height);
			float d = getElevation(vUv + vec2(-offset, 0), width,height);
			float e = getElevation(vUv, width,height);
			float f = getElevation(vUv + vec2(offset, 0), width,height);
			float g = getElevation(vUv + vec2(-offset, offset), width,height);
			float h = getElevation(vUv + vec2(0, offset), width,height);
			float i = getElevation(vUv + vec2(offset,offset), width,height);

			float normalLength =20.0;
			// float normalLength = 2.0 * (1.0 + pow(1.6,(14.0 -zoomlevel)));
			// float normalLength = 50.0 / (1.0 + pow(1.3,15.0 -zoomlevel) / 3.0);
			// float normalLength = 2.0+.0005 * pow(3.0,20.0 -zoomlevel) ;
			// float normalLength = 2.0 * (1.0 + (14.0 -zoomlevel) / 10.0);

			float zoomFactor = 0.0;
			float level = zoomlevel ;
			if (heightMapLocation.z != 1.0) {
				level -= log(1.0/heightMapLocation.z)/log(2.0);
			}
			if (level < 12.0) {
				zoomFactor = 1.0 - 0.5/(12.0 -level);
			}
			// vec3 v0 = vec3(0.0, 0.0, mean);
			// vec3 v1 = v0 - vec3(0.0, normalLength, mix(b, mean, zoomFactor));
			// vec3 v2 = v0 - vec3(normalLength, 0.0, mix(f, mean, zoomFactor));
			// vNormal = (normalize(cross(v2, v1)));


			vec3 v0 = vec3(0.0, 0.0, 0.0);
			vec3 v1 = vec3(0.0, normalLength, 0.0);
			vec3 v2 = vec3(normalLength, 0.0, 0.0);
			v0.z = mix((e + d + g + h) / 4.0, mean, zoomFactor);
			v1.z = mix((e + b + a + d) / 4.0, mean, zoomFactor);
			v2.z = mix((e + h + i + f) / 4.0, mean, zoomFactor);
			vNormal = normalize(cross(v0 -v2, v0 - v1));
		}
	#endif
	vec3 _transformed = position + mean * vec3(0,1,0);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(_transformed, 1.0);
	vPosition = modelMatrix * vec4(_transformed, 1.0);
	vPosition.y = mean / exageration;
}
`,
		wireframe: false,
		side: DoubleSide,
		defines: {USE_UV: '', USE_MAP: ''},
		uniforms: Object.assign(pick(phongShader.uniforms, 'diffuse', 'spotLights', 'spotLightShadows', 'rectAreaLights', 'ltc_1', 'ltc_2', 'ambientLightColor', 'directionalLightShadows', 'directionalLights', 'directionalShadowMatrix', 'directionalShadowMap', 'lightMap', 'lightMapIntensity', 'lightProbe', 'pointLights', 'pointLightShadows', 'pointShadowMap', 'pointShadowMatrix', 'hemisphereLights', 'spotShadowMap', 'spotShadowMatrix', 'map'
			, 'opacity'), {
			drawNormals: {value: false},
			computeNormals: {value: false},
			drawTexture: {value: false},
			elevationDecoder: {value: null},
			generateColor: {value: false},
			drawBlack: {value: 0},
			exageration: {value: 1}
		})
	});
	sharedMaterial['flatShading'] = false;
	sharedMaterial['map'] = EMPTY_TEXTURE;
	return sharedMaterial;
}
export const sharedMaterial = createSharedMaterial();

export let currentColor = 0x000000;
export class MaterialHeightShader extends MapHeightNode 
{

	public static useLOD = true;

	public static useSharedShader = true;

	public fullGeometryLoaded = false;

	public static baseGeometry = MapPlaneNode.geometry;

	public static baseScale: Vector3 = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

	public static geometries = {};

	public static geometry: BufferGeometry;

	public static getDefaultGeometry(): BufferGeometry 
	{
		if (!MaterialHeightShader.geometry) 
		{
			MaterialHeightShader.geometry = MaterialHeightShader.getSoftGeometry(16, true);
		}
		return MaterialHeightShader.geometry;
	}


	/**
	* Size of the grid of the geometry displayed on the scene for each tile.
	*/
	public static geometrySize = 4;

	public frustumCulled: boolean;

	public heightMapLocation = [0, 0, 1, 1];

	public mapMapLocation = [0, 0, 1, 1];

	public heightOverZoomFactor = 1;

	public overZoomFactor = 1;

	public pointsMesh: Points;

	public static maxZoomForPeaks = 12;

	public static getGeometry(level: number): MapNodeGeometry
	{
		let size = GEOMETRY_SIZE;
		if (level > maxLevelForGemSize) 
		{
			size /= Math.floor(Math.pow(2, level - maxLevelForGemSize));
			size = Math.max(16, size);
		}
		let geo = MaterialHeightShader.geometries[size];
		if (!MaterialHeightShader.geometries[size]) 
		{
			geo = MaterialHeightShader.geometries[size] = new MapNodeGeometry(1, 1, size, size, {skirt: exageration > 0.1, skirtDepth: 50 * exageration, uvs: false});
		}
		return geo;
	}

	public static getSoftGeometry(level: number, forceSize?: boolean): MapNodeGeometry
	{
		let size;
		if (forceSize) 
		{
			size = level;
		}
		else 
		{
			size = GEOMETRY_SIZE;
			if (level < maxLevelForGemSize) 
			{
				size /= Math.floor(Math.pow(2, Math.floor(maxLevelForGemSize - level)));
				size = Math.max(16, size);
			}
			else if (level > maxLevelForGemSize) 
			{
				size /= Math.floor(Math.pow(2, level - maxLevelForGemSize));
				size = Math.max(16, size);
			}
		}
		let geo = MaterialHeightShader.geometries[size];
		if (!MaterialHeightShader.geometries[size]) 
		{
			geo = MaterialHeightShader.geometries[size] = new MapNodeGeometry(1, 1, size, size, {skirt: exageration > 0.1, skirtDepth: 50 * exageration, uvs: false});
		}
		return geo;
	}

	public constructor(parentNode: MapHeightNode, mapView: MapView, location: number, level: number, x: number, y: number) 
	{
		super(parentNode, mapView, location, level, x, y, MaterialHeightShader.getDefaultGeometry(), MaterialHeightShader.useSharedShader? sharedMaterial : sharedMaterial.clone());
		this.material['map'] = EMPTY_TEXTURE;
		const userData = {
			heightMap: {value: null},
			map: {value: this.material['map']},
			zoomlevel: {value: level},
			heightMapLocation: {value: this.heightMapLocation},
			mapMapLocation: {value: this.mapMapLocation}
		};
		if (MaterialHeightShader.useSharedShader) 
		{
			this.userData = userData;
		}
		else 
		{
			this.material.userData = userData;
		}
		// we need to set it again to ensure the shader is compiled correctly
		this.frustumCulled = false;
	}

	public material: ShaderMaterial;

	public geometry: BufferGeometry;

	public initialize(): Promise<any>
	{
		let maxUpLevel = 2;
		let parent = this.parent as MaterialHeightShader;
		while (maxUpLevel > 0 && (!parent.textureLoaded || !parent.heightLoaded)) 
		{
			parent = parent.parent as MaterialHeightShader;
			maxUpLevel--;
		}
		// if parent exists load texture from parent and show ourself to
		// prevent blick during load
		if (parent && (parent.textureLoaded && parent.heightLoaded)) 
		{
			const tileBox = tileToBBOX([this.x, this.y, this.level]);
			const parentTileBox = tileToBBOX([parent.x, parent.y, parent.level]);
			const width = parentTileBox[2] - parentTileBox[0];
			const height = parentTileBox[3] - parentTileBox[1];
			const deltaLevel = this.level - parent.level;
			const decimalFactor = Math.pow(10, deltaLevel);
			const dx = Math.floor((tileBox[0] - parentTileBox[0]) / width * decimalFactor ) / decimalFactor;
			const dy = Math.floor((tileBox[1] - parentTileBox[1]) / height * decimalFactor ) / decimalFactor;
			if (!this.textureLoaded) 
			{
				const parentOverZoomFactor = 1 / parent.mapMapLocation[2];
				const mapMapLocation = [0, 0, 1, 1];
				mapMapLocation[0] = parent.mapMapLocation[0] + dx / parentOverZoomFactor;
				mapMapLocation[1] = parent.mapMapLocation[1] + dy / parentOverZoomFactor;
				mapMapLocation[2] = mapMapLocation[3] = 1 / Math.pow(2, parentOverZoomFactor * deltaLevel);
				const parentUserData = MaterialHeightShader.useSharedShader ? parent.userData : parent.material.userData;
				this.setMaterialValues({
					map: parentUserData.map.value,
					mapMapLocation: mapMapLocation
				});
				// this.textureLoaded = true;
				// this.isTextureReady = true;
			}

			if (!this.heightLoaded) 
			{
				const parentHeightLocation = parent.heightMapLocation;
				const parentHeightOverZoomFactor = 1 / parentHeightLocation[2];
				const heightMapLocation = [0, 0, 1, 1];
				heightMapLocation[0] = parentHeightLocation[0] + dx / parentHeightOverZoomFactor;
				heightMapLocation[1] = parentHeightLocation[1] + dy / parentHeightOverZoomFactor;
				heightMapLocation[2] = heightMapLocation[3] = 1 / (2* parentHeightOverZoomFactor * deltaLevel);
				const parentUserData = MaterialHeightShader.useSharedShader ? parent.userData : parent.material.userData;
				// const parentUserData = parent.userData;
				this.heightMapLocation = heightMapLocation;
				this.setMaterialValues({
					heightMap: parentUserData.heightMap.value,
					heightMapLocation: heightMapLocation
				});
				// this.heightLoaded = true;
				// this.isHeightReady = true;
			}
			this.show();
			
		}
		return super.initialize();
	}

	public dispose(): void 
	{
		// console.log('disposed', this.x, this.y, this.level, this.parentNode.x, this.parentNode.y, this.parentNode.level)
		super.dispose();
		this.pointsMesh = null;
	}

	public setMaterialValues(values): void
	{
		// @ts-ignore
		const userData = MaterialHeightShader.useSharedShader ? this.userData : this.material.userData;
		Object.keys(values).forEach((k) => 
		{
			// eslint-disable-next-line no-prototype-builtins
			if (userData.hasOwnProperty(k)) 
			{
				userData[k].value = values[k];
			}
		});
	}

	protected didSimplify(): void
	{
		if (this.lod) 
		{
			this.children = [this.objectsHolder, this.lod];
		}
		else 
		{
			this.children = [this.objectsHolder];
		}
	}

	public show(): void
	{
		if (!this.fullGeometryLoaded) 
		{
			this.constructLOD();
		}
		if (MaterialHeightShader.useLOD) 
		{
			this.isMesh = false;
			this.lod.visible = true;
		}
		else 
		{
			this.isMesh = true;
		}
	}

	public isVisible(): Boolean
	{
		if (MaterialHeightShader.useLOD) 
		{
			return this.lod && this.lod.visible;
		}
		else 
		{
			return this.isMesh;
		}
	}

	public hide(): void
	{
		this.isMesh = false;
		this.objectsHolder.visible = this.level !== this.mapView.maxZoomForObjectHolders;
		if (this.lod) 
		{
			this.lod.visible = false;
		}
	}

	private constructLOD(): void
	{
		this.fullGeometryLoaded = true;

		if (MaterialHeightShader.useLOD) 
		{
			const lod = this.lod = new LOD();
			for ( let i = 0; i < 4; i ++ ) 
			{
				let delta = i >= 3 ? i + 1 : i;
				const mesh = new Mesh( MaterialHeightShader.getSoftGeometry(this.level > maxLevelForGemSize ? this.level + delta : maxLevelForGemSize - delta), this.material);
				mesh.frustumCulled = false;
				mesh.updateMatrix();
				mesh.updateMatrixWorld(true);
				mesh.matrixAutoUpdate = false;
				lod.addLevel( mesh, 700 * Math.pow(i, FORCE_MOBILE || isMobile?5:5));
			}
			lod.updateMatrix();
			lod.updateMatrixWorld(true);
			lod.frustumCulled = false;
			lod.matrixAutoUpdate = false;
			this.add( lod );
			this.isMesh = false;
		}
		else 
		{
			this.geometry = MaterialHeightShader.getGeometry(this.level);
		}
	}

	public lod: LOD;

	/**
	* Load tile texture from the server.
	*
	*/
	public loadTexture(): Promise<any> 
	{
		if (this.isTextureReady) 
		{
			return;
		}
		this.isTextureReady = true;
		return this.mapView.provider.fetchTile(this.level, this.x, this.y).then((image) => {return this.onTextureImage(image);}).finally(() =>
		{
			if (!this.mapView) 
			{
				return;
			}
			this.textureLoaded = true;
			this.nodeReady();
		});
	}

	public onTextureImage(image): void
	{
		if (this.parentNode && image) 
		{
			this.mapMapLocation = [0, 0, 1, 1];
			const texture = new Texture(image as any);
			texture.generateMipmaps = false;
			// texture.format = RGBFormat;
			texture.magFilter = LinearFilter;
			texture.minFilter = LinearFilter;
			texture.needsUpdate = true;

			// @ts-ignore
			this.setMaterialValues({
				map: texture,
				mapMapLocation: this.mapMapLocation
			});
		}
	}

	public async onHeightImage(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, resetMapLocation = true): Promise<void>
	{
		if (this.mapView && image) 
		{
			if (resetMapLocation) 
			{
				this.heightMapLocation = [0, 0, 1, 1];

			}
			let texture: Texture; 
			if (image instanceof Texture) 
			{
				texture = image;
				this.setMaterialValues({heightMap: image});
			}
			else 
			{
				texture = new Texture(image);
				texture.generateMipmaps = false;
				// texture.format = RGBFormat;
				texture.flipY = false;
				texture.magFilter = LinearFilter;
				texture.minFilter = LinearFilter;
				texture.needsUpdate = true;
				this.setMaterialValues({
					heightMap: texture,
					heightMapLocation: this.heightMapLocation
				});
			}
			if (this.level > this.mapView.maxZoomForObjectHolders) 
			{
				return;
			}
			// @ts-ignore
			await this.mapView.heightProvider.fetchPeaks(this.level, this.x, this.y).then((result: any[]) => 
			{
				if (!this.mapView) 
				{
					return;
				}
				result = result.filter(
					(f: { properties: { name: any; class: string; }; }) => { return f.properties.name && f.properties.class === 'peak' && f.properties['ele'] !== undefined; }
				);
				
				if (result.length > 0) 
				{
					const features = [];
					var colors = [];
					var points = [];
					const vec = new Vector3(
						0,
						0,
						0
					);
					const heightMapLocation = this.userData.heightMapLocation.value;
					let coords, coordsXY = new Vector2(), pixel, color;
					const imageData = getImageData(texture.image as ImageBitmap);
					

					result.forEach((f: { geometry: { coordinates: any[]; }; localCoords: Vector3; id: any; pointIndex: number; level: number; x: number; y: number; color: number; properties: { ele: number; name: string, computedEle?: number}; }, index: any) => 
					{
						coords = f.geometry.coordinates;
						UnitsUtils.datumsToSpherical(
							coords[1],
							coords[0], coordsXY
						);
						vec.set(coordsXY.x, 0, -coordsXY.y);
						f.localCoords = this.worldToLocal(
							vec
						);
						if (Math.abs(f.localCoords.x) <=
										0.5 &&
										Math.abs(f.localCoords.z) <=
										0.5) 
						{
							const id = coords.join(
								','
							);
							f.id = id;
							f.pointIndex = features.length;
							f.level = this.level;
							f.x = this.x;
							f.y = this.y;
							pixel = getPixel(imageData, heightMapLocation, {lat: coords[1], lon: coords[0]}, this.level);
							f.localCoords.y = f.properties.computedEle = Math.ceil(pixel[0]/255* elevationDecoder[0] + pixel[1]/255* elevationDecoder[1] + pixel[2]/255* elevationDecoder[2]+ elevationDecoder[3]);
							color = f.color = currentColor = (currentColor + 1) %0xfffffe;
							
							featuresByColor[color] = f;
							// if (f.properties.name.endsWith('Monte Bianco')) 
							// {
							// 	testColor = color;
							// 	console.log('monte bianco color', color);
							// }
							features.push(f);
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
						}
					});
					if (points.length > 0) 
					{
						const geometry = new BufferGeometry();
						const pointAttributes = new Float32BufferAttribute(
							points,
							3
						);
						pointAttributes.name = 'points';
						geometry.setAttribute('position', pointAttributes);

						const colorsAttributes = new Float32BufferAttribute(
							colors,
							3
						);
						colorsAttributes.name = 'colors';
						geometry.setAttribute('color', colorsAttributes);

						var mesh = new Points(
							geometry,
							sharedPointMaterial,
						);
						const userData = MaterialHeightShader.useSharedShader ? this.userData : this.material.userData; 
						mesh.userData = {};
						mesh.frustumCulled = false;

						mesh.updateMatrix();
						mesh.updateMatrixWorld(true);
						this.pointsMesh = mesh;
						this.objectsHolder.add(mesh);
					}
				}

				// requestRenderIfNotRequested(true);
			}).catch((err) => 
			{
				console.error('error fetching peaks', err);
			});
			
		}
	}

	protected async handleParentOverZoomTile(resolve?): Promise<any>
	{
		if (!this.mapView) 
		{
			return;
		}
		const tileBox = tileToBBOX([this.x, this.y, this.level]);
		const parent = this.parent as MaterialHeightShader;
		const parentOverZoomFactor = parent.heightOverZoomFactor;
		const parentTileBox = tileToBBOX([parent.x, parent.y, parent.level]);
		const width = parentTileBox[2] - parentTileBox[0];
		const height = parentTileBox[3] - parentTileBox[1];
		this.heightOverZoomFactor = parentOverZoomFactor * 2;
		this.heightMapLocation[0] = parent.heightMapLocation[0] + Math.floor((tileBox[0] - parentTileBox[0]) / width * 10 ) / 10 / parentOverZoomFactor;
		this.heightMapLocation[1] = parent.heightMapLocation[1] + Math.floor((tileBox[1] - parentTileBox[1]) / height * 10 ) / 10 / parentOverZoomFactor;
		this.heightMapLocation[2] = this.heightMapLocation[3] = 1 / this.heightOverZoomFactor;

		this.setMaterialValues({heightMapLocation: this.heightMapLocation});
		const userData = MaterialHeightShader.useSharedShader ? parent.userData : parent.material.userData; 
		await this.onHeightImage(userData.heightMap.value, false);
		resolve?.();
	}

	/**
	* Overrides normal raycasting, to avoid raycasting when isMesh is set to false.
	*
	* Switches the geometry for a simpler one for faster raycasting.
	*/
	public raycast(raycaster: Raycaster, intersects: Intersection[]): boolean
	{
		if (this.isVisible()) 
		{
			const oldGeometry = this.geometry;
			this.geometry = MapPlaneNode.geometry;

			const result = Mesh.prototype.raycast.call(this, raycaster, intersects);

			this.geometry = oldGeometry;

			return result;
		}

		return false;
	}
}
