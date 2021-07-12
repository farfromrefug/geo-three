import {BufferGeometry, ClampToEdgeWrapping, DoubleSide, Float32BufferAttribute, Intersection, LinearFilter, LOD, Mesh, MeshPhongMaterial, NearestFilter, Points, Raycaster, RGBFormat, ShaderMaterial, Sphere, Texture, TextureLoader, Vector3, Vector4, UniformsLib, UniformsUtils} from 'three';
import {MapHeightNode} from '../source/nodes/MapHeightNode';
import {MapPlaneNode} from '../source/nodes/MapPlaneNode';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {MapNodeGeometry} from '../source/geometries/MapNodeGeometry';
import {drawTexture, exageration, mapMap, drawNormals, debug, elevationDecoder, featuresByColor, debugFeaturePoints, render, wireframe, shouldComputeNormals, FAR, GEOMETRY_SIZE, isMobile} from './app';

import {tileToBBOX} from '@mapbox/tilebelt';
import {MapView} from '../source/MapView';
import {MapNode} from '../source/nodes/MapNode';


const maxLevelForGemSize = 11;

export let currentColor = 0xffffff;

export class MaterialHeightShader extends MapHeightNode 
{

	public static baseGeometry = MapPlaneNode.geometry;

	public static baseScale: Vector3 = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

	public static geometry: BufferGeometry = new MapNodeGeometry(1, 1, MapHeightNode.geometrySize, MapHeightNode.geometrySize);
	/**
	* Empty texture used as a placeholder for missing textures.
	*/
	public static EMPTY_TEXTURE = new Texture();

	/**
	* Size of the grid of the geometry displayed on the scene for each tile.
	*/
	public static geometrySize = 4;

	public static geometries = {};

	public frustumCulled: boolean;

	public heightMapLocation = [0, 0, 1, 1]

	public mapMapLocation = [0, 0, 1, 1]

	public heightOverZoomFactor = 1;

	public overZoomFactor = 1;

	public pointsMesh:Points

	public static getGeometry(level: number, handleLess = false): MapNodeGeometry
	{
		let size = GEOMETRY_SIZE;
		if (handleLess && level < maxLevelForGemSize) 
		{
			size /= Math.floor(Math.pow(2, Math.floor((maxLevelForGemSize - level))));
			// size /= 11 - level;
			size = Math.max(16, size);
		}
		else 
		if (level > maxLevelForGemSize) 
		{
			size /= Math.floor(Math.pow(2, level - maxLevelForGemSize));
			size = Math.max(16, size);
		}
		let geo = MaterialHeightShader.geometries[size];
		if (!MaterialHeightShader.geometries[size]) 
		{
			geo = MaterialHeightShader.geometries[size] = new MapNodeGeometry(1, 1, size, size, true, 300);
		}
		return geo;
	}

	public static getSoftGeometry(level: number): MapNodeGeometry
	{
		return MaterialHeightShader.getGeometry(level - 1);
	}

	public constructor(parentNode: MapHeightNode, mapView: MapView, location: number, level: number, x: number, y: number) 
	{
		super(parentNode, mapView, location, level, x, y, MaterialHeightShader.geometry, MaterialHeightShader.prepareMaterial(new MeshPhongMaterial({
			map: MaterialHeightShader.EMPTY_TEXTURE,
			color: 0xffffff,		
			wireframe: wireframe,
			shininess: 0,
			side: DoubleSide
		}), level));

		// this.castShadow = true;
		// this.receiveShadow = true;
		this.material.emissiveIntensity = 0;
		this.frustumCulled = false;
		this.setMaterialValues({
			heightMapLocation: this.heightMapLocation,
			mapMapLocation: this.mapMapLocation
		})
		// this.material.flatShading =  mapMap && !computeNormals;
		this.material.flatShading = false;
	}

	public static prepareMaterial(material: MeshPhongMaterial, level: any): MeshPhongMaterial 
	{
		// material.precision = 'highp';
		material.userData = {
			heightMap: {value: MaterialHeightShader.EMPTY_TEXTURE},
			drawNormals: {value: drawNormals},
			computeNormals: {value: shouldComputeNormals()},
			drawTexture: {value: (debug || mapMap) && drawTexture},
			drawBlack: {value: 0},
			zoomlevel: {value: level},
			exageration: {value: exageration},
			elevationDecoder: {value: elevationDecoder},
			heightMapLocation: {value: new Vector4()},
			mapMapLocation: {value: new Vector4()}
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
			uniform vec4 mapMapLocation;
			` + shader.fragmentShader;


			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <map_fragment>',
				`
				vec4 texelColor = texture2D(map, vUv * mapMapLocation.zw + mapMapLocation.xy);
				texelColor = mapTexelToLinear( texelColor );
				diffuseColor *= texelColor;
					`
			);
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
			// Vertex depth logic
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
				this.setMaterialValues({
					map: parent.material.map,
					mapMapLocation: mapMapLocation
				})
			}

			if (!this.heightLoaded) 
			{
				const parentHeightOverZoomFactor = 1 / parent.heightMapLocation[2];
				const heightMapLocation = [0, 0, 1, 1];
				heightMapLocation[0] = parent.heightMapLocation[0] + dx / parentHeightOverZoomFactor;
				heightMapLocation[1] = parent.heightMapLocation[1] + dy / parentHeightOverZoomFactor;
				heightMapLocation[2] = heightMapLocation[3] = 1 / Math.pow(2, parentHeightOverZoomFactor * deltaLevel);
				this.setMaterialValues({
					heightMap: parent.material.userData.heightMap.value,
					heightMapLocation: heightMapLocation
				})
			}
			this.show();
			
		}
		return super.initialize();
	}
	protected didSimplify(): void
	{
		if (this.lod) {
			this.children = [this.objectsHolder, this.lod];
		} else {
			this.children = [this.objectsHolder];
		}

	}
	public show(): void
	{
		// console.log('show', this.level, this.x, this.y, !!this.lod);
		if (!this.fullGeometryLoaded) {
			this.constructLOD();
		}
		if (MaterialHeightShader.useLOD) {
			this.isMesh = false;
			this.lod.visible = true;
		} else {
			this.isMesh = true;
		}
	}
	public isVisible(): Boolean
	{
		if (MaterialHeightShader.useLOD) {
			return this.lod && this.lod.visible;
		} else {
			return this.isMesh;
		}
	}
	public hide(): void
	{
		this.isMesh = false;
		this.objectsHolder.visible = false;
		if (this.lod) {
			this.lod.visible = false;
		}
	}

	// public getBoundingSphere(): Sphere
	// {
	// 	const geometry =MaterialHeightShader.geometry;

	// 	if ( geometry.boundingSphere === null ) 
	// 	{
	// 		geometry.computeBoundingSphere();
	// 	}
	// 	_sphere.copy( geometry.boundingSphere ).applyMatrix4( this.matrixWorld );
	// 	return _sphere;
	// }
	public static useLOD = true
	public fullGeometryLoaded = false;
	private constructLOD() {
		this.fullGeometryLoaded = true;
		if (MaterialHeightShader.useLOD) {
			const lod = this.lod = new LOD();
			for ( let i = 0; i < 7; i ++ ) {
				const mesh = new Mesh( MaterialHeightShader.getGeometry(this.level > maxLevelForGemSize ? this.level + i : maxLevelForGemSize - i, true), this.material);
				mesh.frustumCulled = false;
				mesh.updateMatrix();
				mesh.updateMatrixWorld(true);
				mesh.matrixAutoUpdate = false;
				lod.addLevel( mesh, (3000  + 4000 * Math.pow(i, isMobile ? 2 : 4)));
				// lod.addLevel( mesh, (300000  + 200000 * Math.pow(i, 4)) / Math.pow(2, 20 - this.level));

				// lod.addLevel( mesh, 5000  + 5000 * i  * (1 + Math.abs(Math.min(this.level, 12) - 12)));
			}
			lod.updateMatrix();
			lod.updateMatrixWorld(true);
			lod.frustumCulled = false;
			lod.matrixAutoUpdate = false;
			this.add( lod );
			this.isMesh = false;
		} else {
			this.geometry = MaterialHeightShader.getGeometry(this.level);
		}
	}
	lod: LOD

	setGeometrySize(level) {
		if (!this.fullGeometryLoaded) {
			return;
		}
		if (MaterialHeightShader.useLOD) {
			if (this.lod) {
				this.lod.levels.forEach((l, i) => l.object.geometry = MaterialHeightShader.getGeometry(this.level- i))
			}
		} else {
			this.geometry = MaterialHeightShader.getGeometry(this.level);
		}
	}

	// public setMaterialValues(values): void
	// {
	// 	const mat = this.material;
	// 	Object.keys(values).forEach((k) => 
	// 	{
	// 		// eslint-disable-next-line no-prototype-builtins
	// 		if (k === 'map') 
	// 		{
	// 			// console.log('setMaterialValues', k);
	// 			mat[k] = values[k];
	// 			if (this.lod) {
	// 				this.lod.levels.forEach(l=>{
	// 					l.object.material[k] = values[k];
	// 				})
	// 			}
	// 		}
	// 		else 
	// 		{
	// 			// @ts-ignore
	// 			mat.userData[k].value = values[k];
	// 			if (this.lod) {
	// 				this.lod.levels.forEach(l=>{
	// 					l.object.material.userData[k].value = values[k];
	// 				})
	// 			}
	// 		}
	// 	});
	// }
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
			this.textureLoaded = true;
			this.nodeReady();
		});
	}

	public onTextureImage(image): void
	{
		if (image) 
		{
			const texture = new Texture(image as any);
			texture.generateMipmaps = false;
			texture.format = RGBFormat;
			texture.magFilter = LinearFilter;
			texture.minFilter = LinearFilter;
			texture.needsUpdate = true;
	
			// @ts-ignore
			this.setMaterialValues({
				map: texture,
				mapMapLocation: this.mapMapLocation
			})
		}
	}

	public async onHeightImage(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): Promise<void>
	{
		if (image ) 
		{
			let texture: Texture; 
			if (image instanceof Texture) 
			{
				texture = image;
				this.setMaterialValues({
					heightMap: image
				})
			}
			else 
			{
				texture = new Texture(image);
				texture.generateMipmaps = false;
				texture.format = RGBFormat;
				texture.magFilter = LinearFilter;
				texture.minFilter = LinearFilter;
				// texture.wrapS = ClampToEdgeWrapping;
				// texture.wrapT = ClampToEdgeWrapping;
				texture.needsUpdate = true;
				this.setMaterialValues({
					heightMap: texture,
					heightMapLocation: this.heightMapLocation
				})
			}
			// no more data after 14
			if (this.level > 14) 
			{
				return;
			}
			this.mapView.heightProvider.fetchPeaks(this.level, this.x, this.y).then((result: any[]) => 
			{
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
						const material = new ShaderMaterial({
							userData: 
								{
									heightMap: this.material.userData.heightMap,
									exageration: this.material.userData.exageration,
									elevationDecoder: this.material.userData.elevationDecoder,
									heightMapLocation: this.material.userData.heightMapLocation,
									forViewing: {value: debugFeaturePoints}, 
									far: {value: FAR}, 
									pointTexture: {value: new TextureLoader().load( 'disc.png' )}
								},
							vertexShader: `
							attribute vec4 color;
							uniform float exageration;
							uniform bool forViewing;
							uniform float far;
							varying float depth;
							varying vec4 vColor;

							uniform sampler2D heightMap;
							uniform vec4 elevationDecoder;
							uniform vec4 heightMapLocation;

							float getPixelElevation(vec4 e) {
								// Convert encoded elevation value to meters
								return ((e.r * elevationDecoder.x + e.g * elevationDecoder.y  + e.b * elevationDecoder.z) + elevationDecoder.w + 10.0) * exageration;
							}
							float getElevation(vec2 coord) {
								vec4 e = texture2D(heightMap, coord * heightMapLocation.zw + heightMapLocation.xy);
								return getPixelElevation(e);
							}
							void main() {
								float elevation  = getElevation(vec2(position.x + 0.5, 0.5 - position.z)) ;
								vec4 mvPosition = modelViewMatrix * vec4( position.x,  elevation, position.z, 1.0 );
								gl_Position = projectionMatrix * mvPosition;
								if (forViewing) {
									gl_PointSize = 10.0 - gl_Position.z/ far * 6.0;
									vColor = vec4(0.0, 0.0, 1.0, 1);
								} else {
									gl_Position.z -= (elevation / 1000.0 - floor(elevation / 1000.0)) * gl_Position.z / 1000.0;
									// gl_PointSize = pow(gl_Position.z, 1.2)/ far;
									gl_PointSize = 2.0 + gl_Position.z / far;
									vColor = color;
								}
								depth = gl_Position.z;
							}
							`,
							fragmentShader: `
							varying vec4 vColor;
							varying float depth;
							uniform float far;
							uniform bool forViewing;
							uniform sampler2D pointTexture;
							void main() {
								gl_FragColor = vColor;
								// if (forViewing) {
								// 	gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );
								// }
								if (depth > far) {
									discard;
								}
							}
							`,
							fog: true,
							transparent: true
						});
						var mesh = new Points(
							geometry,
							material
						);
						material.onBeforeCompile = (shader: { uniforms: { [x: string]: any; }; vertexShader: string; fragmentShader: string; }) => 
						{
							// Pass uniforms from userData to the
							for (const i in material.userData) 
							{
								shader.uniforms[i] = material.userData[i];
							}
						};
						// (mesh as any).features = features;
						mesh.frustumCulled = false;

						mesh.updateMatrix();
						mesh.updateMatrixWorld(true);
						// this.objectsHolder.visible = debugFeaturePoints;
						this.pointsMesh = mesh;
						this.objectsHolder.add(mesh);
					}
				}

				render(true);
			});
			
		}
	}

	protected handleParentOverZoomTile(resolve?): void
	{
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

		// console.log('handleParentOverZoomTile', parent.x, parent.y, parent.level, this.x, this.y, this.level);
		this.setMaterialValues({
			heightMapLocation: this.heightMapLocation
		})
		this.onHeightImage(parent.material.userData.heightMap.value);
		if (resolve) 
		{
			resolve();
		}
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
