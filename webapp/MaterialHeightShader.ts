import { BufferGeometry, ClampToEdgeWrapping, DoubleSide, Float32BufferAttribute, Intersection, LinearFilter, Mesh, MeshPhongMaterial, NearestFilter, Points, Raycaster, RGBFormat, ShaderMaterial, Texture, Vector3, Vector4 } from 'three';
import {MapHeightNode} from '../source/nodes/MapHeightNode';
import {MapPlaneNode} from '../source/nodes/MapPlaneNode';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {MapNodeGeometry} from '../source/geometries/MapNodeGeometry';
import {drawTexture, exageration, mapMap, drawNormals, debug, elevationDecoder, featuresByColor, debugFeaturePoints, render, wireframe, shouldComputeNormals} from './app';

import {tileToBBOX} from '@mapbox/tilebelt';
import { MapView } from '../source/MapView';
import { MapNode } from '../source/nodes/MapNode';

export let currentColor = 0xffffff;

export class MaterialHeightShader extends MapHeightNode 
{

	public static BASE_GEOMETRY = MapPlaneNode.GEOMETRY;

	public static BASE_SCALE: Vector3 = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

	/**
	* Empty texture used as a placeholder for missing textures.
	*/
	public static EMPTY_TEXTURE = new Texture();

	/**
	* Size of the grid of the geometry displayed on the scene for each tile.
	*/
	public static GEOMETRY_SIZE = 200;

	public static geometries = {};

	public frustumCulled: boolean;

	public exageration: number;

	public heightMapLocation = [0, 0, 1, 1]
	public overZoomFactor = 1;

	public static getGeometry(level: number): MapNodeGeometry
	{
		let size = MaterialHeightShader.GEOMETRY_SIZE;
		if (level < 11) 
		{
			// size /= Math.pow(2, 11 - level);
			size /= 11 - level;
			size = Math.max(16, size);
		} else if (level > 11) {
			size /= Math.pow(2, (level - 11));
			size = Math.max(16, size);
		}
		let geo = MaterialHeightShader.geometries[size];
		if (!MaterialHeightShader.geometries[size]) 
		{
			geo = MaterialHeightShader.geometries[size] = new MapNodeGeometry(1, 1, size, size);
		}
		return geo;
	}

	public static getSoftGeometry(level: number): MapNodeGeometry
	{
		return MaterialHeightShader.getGeometry(level - 1);
	}

	public constructor(parentNode: MapHeightNode, mapView: MapView, location: number, level: number, x: number, y: number) 
	{
		super(parentNode, mapView, location, level, x, y, MaterialHeightShader.GEOMETRY, MaterialHeightShader.prepareMaterial(new MeshPhongMaterial({
			map: MaterialHeightShader.EMPTY_TEXTURE,
			color: 0xffffff,
			wireframe: wireframe,
			shininess:0,
			side: DoubleSide
		}), level));

		// this.castShadow = true;
		// this.receiveShadow = true;
		this.material.emissiveIntensity = 0;
		this.frustumCulled = false;
		this.exageration = exageration;
		this.material.userData.heightMapLocation.value.set(...this.heightMapLocation);
		// this.material.flatShading =  mapMap && !computeNormals;
	}

	public static prepareMaterial(material: MeshPhongMaterial, level: any): MeshPhongMaterial 
	{
		material.precision = 'highp';
		material.userData = {
			heightMap: {value: MaterialHeightShader.EMPTY_TEXTURE},
			drawNormals: {value: drawNormals},
			computeNormals: {value: shouldComputeNormals()},
			drawTexture: {value: (debug || mapMap) && drawTexture},
			drawBlack: {value: 0},
			zoomlevel: {value: level},
			exageration: {value: exageration},
			elevationDecoder: {value: elevationDecoder},
			heightMapLocation: {value: new Vector4() }
		};

		material.onBeforeCompile = (shader: { uniforms: { [x: string]: any; }; vertexShader: string; fragmentShader: string; }) => 
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
				// if (heightMapLocation.z != 1.0) {
				// 	return  getElevation(coord, width, height);
				// }
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
			` + shader.vertexShader;
			shader.fragmentShader =
				`
			uniform bool drawNormals;
			uniform bool drawTexture;
			uniform bool drawBlack;
			` + shader.fragmentShader;

			// Vertex depth logic
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <dithering_fragment>',
				`
				#include <dithering_fragment>
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

				ivec2 size = textureSize(heightMap, 0);
				float width = float(size.x) * heightMapLocation.z;
				float height = float(size.y) * heightMapLocation.w;
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
				`
			);
		};
		return material;
	}

	// @ts-ignore
	public material: MeshPhongMaterial;

	public geometry: BufferGeometry;

	public nodeReady(): void 
	{
		if (!this.textureLoaded) {
			return;
		}
		MapNode.prototype.nodeReady.call(this);
	}

	onTextureImage(image) {
		if (image) 
			{
				const texture = new Texture(image as any);
				texture.generateMipmaps = false;
				texture.format = RGBFormat;
				texture.magFilter = LinearFilter;
				texture.minFilter = LinearFilter;
				texture.needsUpdate = true;
	
				// @ts-ignore
				this.material.map = texture;
			}
			// 1057 735
	}

	public async onHeightImage(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): Promise<void>
	{
		if (image) 
		{
			if (image instanceof Texture) {
				this.material.userData.heightMap.value = image;
			} else {
				var texture = new Texture(image);
				texture.generateMipmaps = false;
				texture.format = RGBFormat;
				texture.magFilter = LinearFilter;
				texture.minFilter = LinearFilter;
				// texture.wrapS = ClampToEdgeWrapping;
				// texture.wrapT = ClampToEdgeWrapping;
				texture.needsUpdate = true;
	
				this.material.userData.heightMap.value = texture;
			}
			this.geometry = MaterialHeightShader.getGeometry(this.level);
			this.mapView.heightProvider.fetchPeaks(this.level, this.x, this.y).then((result: any[]) => 
			{

				result = result.filter(
					(f: { properties: { name: any; class: string; }; }) => { return f.properties.name && f.properties.class === 'peak'; }
				);
				if (result.length > 0) 
				{
					const features = [];
					var colors = [];
					var points = [];
					// var sizes = [];
					var elevations = [];
					const vec = new Vector3(
						0,
						0,
						0
					);
					result.forEach((f: { geometry: { coordinates: any[]; }; localCoords: Vector3; id: any; pointIndex: number; level: number; x: number; y: number; color: number; properties: { ele: any; }; }, index: any) => 
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
							const color = f.color = currentColor--;
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
							elevations.push(
								f.properties.ele
							);
						}
					});
					if (points.length > 0) 
					{
						const geometry = new BufferGeometry();
						geometry.setAttribute(
							'position',
							new Float32BufferAttribute(
								points,
								3
							)
						);
						geometry.setAttribute(
							'color',
							new Float32BufferAttribute(
								colors,
								3
							)
						);
						geometry.setAttribute(
							'elevation',
							new Float32BufferAttribute(
								elevations,
								1
							)
						);
						var mesh = new Points(
							geometry,
							new ShaderMaterial({
								uniforms: {exageration: {value: exageration}},
								vertexShader: `
												attribute float elevation;
												attribute vec4 color;
												uniform float exageration;
												varying vec4 vColor;
												void main() {
													vColor = color;
													float exagerated  = elevation * exageration;
													vec4 mvPosition = modelViewMatrix * vec4( position + exagerated* vec3(0,1,0), 1.0 );
													//  gl_PointSize =  floor(exagerated / 1000.0)* 1.0;
													//  gl_PointSize = gl_Position.z _ ;
													gl_Position = projectionMatrix * mvPosition;
													gl_Position.z -= (exagerated / 1000.0 - floor(exagerated / 1000.0)) * gl_Position.z / 1000.0;
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
			});
			
		}
	}
	protected handleParentOverZoomTile(resolve?) {
			// @ts-ignore
			//{w, s, e, n};
			const tileBox = tileToBBOX([this.x, this.y, this.level]);
			const parent = this.parent as MaterialHeightShader;
			const parentOverZoomFactor = parent.overZoomFactor;
			const parentTileBox = tileToBBOX([parent.x, parent.y, parent.level]);
			const width = parentTileBox[2] - parentTileBox[0];
			const height = parentTileBox[3] - parentTileBox[1];
			this.overZoomFactor = parentOverZoomFactor * 2;
			this.heightMapLocation[0] = parent.heightMapLocation[0]  + Math.floor((tileBox[0] - parentTileBox[0]) / width * 10 ) / 10 / parentOverZoomFactor;
			this.heightMapLocation[1] = parent.heightMapLocation[1]  + Math.floor((tileBox[1] - parentTileBox[1]) / height * 10 ) / 10  / parentOverZoomFactor;
			this.heightMapLocation[2] = this.heightMapLocation[3] = 1 / this.overZoomFactor;

			this.material.userData.heightMapLocation.value.set(...this.heightMapLocation);
			this.onHeightImage(parent.material.userData.heightMap.value);
			// console.log('heightMapLocation', this.x, this.y, this.level, this.heightMapLocation);

			resolve && resolve();
		}

	/**
	* Overrides normal raycasting, to avoid raycasting when isMesh is set to false.
	*
	* Switches the geometry for a simpler one for faster raycasting.
	*/
	public raycast(raycaster: Raycaster, intersects: Intersection[]): boolean
	{
		if (this.isMesh === true) 
		{
			const oldGeometry = this.geometry;
			this.geometry = MapPlaneNode.GEOMETRY;

			const result = Mesh.prototype.raycast.call(this, raycaster, intersects);

			this.geometry = oldGeometry;

			return result;
		}

		return false;
	}
}
