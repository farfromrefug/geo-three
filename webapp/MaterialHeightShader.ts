import {tileToBBOX} from '@mapbox/tilebelt';
import {BufferGeometry, DoubleSide, Float32BufferAttribute, Intersection, LinearFilter, LOD, Material, Mesh, MeshPhongMaterial, Points, Raycaster, RGBFormat, ShaderLib, ShaderMaterial, Texture, Vector3, Vector4} from 'three';
import {MapNodeGeometry} from '../source/geometries/MapNodeGeometry';
import {MapView} from '../source/MapView';
import {MapHeightNode} from '../source/nodes/MapHeightNode';
import {MapPlaneNode} from '../source/nodes/MapPlaneNode';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {debug, debugFeaturePoints, drawNormals, drawTexture, elevationDecoder, exageration, FAR, featuresByColor, GEOMETRY_SIZE, isMobile, mapMap, NEAR, requestRenderIfNotRequested, shouldComputeNormals, wireframe} from './app';

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
const sharedPointMaterial = new PointMaterial({
	depthWrite: false,
	depthTest: false,
	vertexShader: `
#include <packing>
attribute vec4 color;

uniform sampler2D heightMap;
uniform sampler2D depthTexture;
uniform vec4 elevationDecoder;
uniform vec4 heightMapLocation;
uniform float cameraNear;
uniform float cameraFar;
uniform float exageration;
uniform bool forViewing;

varying vec2 vUv;
varying float depth;
varying vec4 vColor;

float getPixelElevation(vec4 e) {
// Convert encoded elevation value to meters
return ((e.r * elevationDecoder.x + e.g * elevationDecoder.y  + e.b * elevationDecoder.z) + elevationDecoder.w + 10.0) * exageration;
}
float getElevation(vec2 coord) {
vec4 e = texture2D(heightMap, coord * heightMapLocation.zw + heightMapLocation.xy);
return getPixelElevation(e);
}

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
float elevation  = getElevation(vec2(position.x + 0.5, 0.5 - position.z)) ;
vec4 mvPosition = modelViewMatrix * vec4( position.x,  elevation, position.z, 1.0 );
gl_Position = projectionMatrix * mvPosition;
float pointSize = getDigit(elevation, 4.0)/10.0 + pow(getDigit(elevation, 3.0), 1.4);
if (forViewing) {
	vColor = vec4(0.0, 0.0, 1.0, 1);
	gl_PointSize = pointSize;
} else {
	gl_PointSize = pointSize;
}
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
// varying vec2 vUv;

uniform float cameraFar;
uniform float cameraNear;
uniform bool forViewing;

void main() {
	if (depth < 0.0 ) {
		discard;
	}
	gl_FragColor = vColor;
}
	`,
	transparent: false
});

const EMPTY_TEXTURE = new Texture();
function pick<T extends object, U extends keyof T>(object: T, ...props: U[]): Pick<T, U> 
{
	return props.reduce((o, k) => { o[k] = object[k];return o;}, {} as any);
}
function createSharedMaterial(): CustomMaterial 
{
	const phongShader = ShaderLib['phong'];
	const sharedMaterial = new CustomMaterial( {
		lights: true,
		uniforms: pick(phongShader.uniforms, 'diffuse', 'spotLights', 'spotLightShadows', 'rectAreaLights', 'ltc_1', 'ltc_2', 'ambientLightColor', 'directionalLightShadows', 'directionalLights', 'directionalShadowMatrix', 'directionalShadowMap', 'lightMap', 'lightMapIntensity', 'lightProbe', 'pointLights', 'pointLightShadows', 'pointShadowMap', 'pointShadowMatrix', 'hemisphereLights', 'spotShadowMap', 'spotShadowMatrix', 'map'
			, 'opacity'),
		fragmentShader: `
uniform bool drawNormals;
uniform bool drawTexture;
uniform bool drawBlack;
uniform vec4 mapMapLocation;
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

void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	vec4 texelColor = texture2D(map, vUv * mapMapLocation.zw + mapMapLocation.xy);
	texelColor = mapTexelToLinear( texelColor );
	diffuseColor *= texelColor;
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
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	ivec2 size = textureSize(heightMap, 0);
	float width = float(size.x) * heightMapLocation.z;
	float height = float(size.y) * heightMapLocation.w;
	vUv = vec2(position.x +  0.5, 0.5 - position.z );
	float e = getElevationMean(vUv, width,height);
	#ifndef FLAT_SHADED
		if (computeNormals) {
			float offset = 1.0 / width;
			float a = getElevation(vUv + vec2(-offset, -offset), width,height);
			float b = getElevation(vUv + vec2(0, -offset), width,height);
			float c = getElevation(vUv + vec2(offset, -offset), width,height);
			float d = getElevation(vUv + vec2(-offset, 0), width,height);
			float f = getElevation(vUv + vec2(offset, 0), width,height);
			float g = getElevation(vUv + vec2(-offset, offset), width,height);
			float h = getElevation(vUv + vec2(0, offset), width,height);
			float i = getElevation(vUv + vec2(offset,offset), width,height);

			float NormalLength = 500.0 / zoomlevel;

			vec3 v0 = vec3(0.0, 0.0, 0.0);
			vec3 v1 = vec3(0.0, NormalLength, 0.0);
			vec3 v2 = vec3(NormalLength, 0.0, 0.0);
			v0.z = (e + d + g + h) / 4.0;
			v1.z = (e + b + a + d) / 4.0;
			v2.z = (e + h + i + f) / 4.0;
			vNormal = (normalize(cross(v2 - v0, v1 - v0))).rbg;
		}
	#endif
	vec3 _transformed = position + e * vec3(0,1,0);
	vec3 worldNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
	gl_Position = projectionMatrix * modelViewMatrix * vec4(_transformed, 1.0);
}
`,
		wireframe: false,
		side: DoubleSide,
		defines: {USE_UV: '', USE_MAP: ''}
	});
	sharedMaterial['flatShading'] = false;
	sharedMaterial['map'] = EMPTY_TEXTURE;
	return sharedMaterial;
}
const sharedMaterial = createSharedMaterial();
// let sharedFragmentShader;
// let sharedVertexShader;

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

	private map: Texture = null

	public constructor(parentNode: MapHeightNode, mapView: MapView, location: number, level: number, x: number, y: number) 
	{
		super(parentNode, mapView, location, level, x, y, MaterialHeightShader.getDefaultGeometry(), MaterialHeightShader.useSharedShader? sharedMaterial : sharedMaterial.clone());
		this.material['map'] = EMPTY_TEXTURE;
		const userData = {
			heightMap: {value: null},
			map: {value: this.material['map']},
			drawNormals: {value: drawNormals},
			computeNormals: {value: shouldComputeNormals()},
			drawTexture: {value: (debug || mapMap) && drawTexture},
			drawBlack: {value: 0},
			zoomlevel: {value: level},
			exageration: {value: exageration},
			elevationDecoder: {value: elevationDecoder},
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
			}

			if (!this.heightLoaded) 
			{
				const parentHeightOverZoomFactor = 1 / parent.heightMapLocation[2];
				const heightMapLocation = [0, 0, 1, 1];
				heightMapLocation[0] = parent.heightMapLocation[0] + dx / parentHeightOverZoomFactor;
				heightMapLocation[1] = parent.heightMapLocation[1] + dy / parentHeightOverZoomFactor;
				heightMapLocation[2] = heightMapLocation[3] = 1 / Math.pow(2, parentHeightOverZoomFactor * deltaLevel);
				const parentUserData = MaterialHeightShader.useSharedShader ? parent.userData : parent.material.userData;
				// const parentUserData = parent.userData;
				this.setMaterialValues({
					heightMap: parentUserData.heightMap.value,
					heightMapLocation: heightMapLocation
				});
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

	public async onHeightImage(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): Promise<void>
	{
		if (this.mapView && image) 
		{
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
					result.forEach((f: { geometry: { coordinates: any[]; }; localCoords: Vector3; id: any; pointIndex: number; level: number; x: number; y: number; color: number; properties: { ele: any; name: string}; }, index: any) => 
					{
						var coords = UnitsUtils.datumsToSpherical(
							f.geometry.coordinates[1],
							f.geometry.coordinates[0]
						);
						vec.set(coords.x, 0, -coords.y);
						f.localCoords = this.worldToLocal(
							vec
						);
						if (Math.abs(f.localCoords.x) <=
										0.5 &&
										Math.abs(f.localCoords.z) <=
										0.5) 
						{
							const id = f.geometry.coordinates.join(
								','
							);
							f.id = id;
							f.pointIndex =
											features.length;
							features.push(f);
							f.level = this.level;
							f.x = this.x;
							f.y = this.y;
							currentColor =(currentColor + 1) %0xfffffe;
							const color = f.color = currentColor;
							featuresByColor[color] = f;
							f.localCoords.y = 1;
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
						mesh.userData = {
							heightMap: userData.heightMap,
							exageration: userData.exageration,
							elevationDecoder: userData.elevationDecoder,
							heightMapLocation: userData.heightMapLocation,
							forViewing: {value: debugFeaturePoints}, 
							depthTexture: {value: EMPTY_TEXTURE}, 
							cameraNear: {value: NEAR},
							cameraFar: {value: FAR}
						};
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
		await this.onHeightImage(userData.heightMap.value);
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
