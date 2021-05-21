import * as THREE from 'three';
import {MVTLoader} from '@loaders.gl/mvt';
import {MapHeightNode} from '../source/nodes/MapHeightNode';
import {MapPlaneNode} from '../source/nodes/MapPlaneNode';
import {UnitsUtils} from '../source/utils/UnitsUtils';
import {CancelablePromise} from '../source/utils/CancelablePromise';
import {XHRUtils} from '../source/utils/XHRUtils';
import {MapNodeGeometry} from '../source/geometries/MapNodeGeometry';
import {exageration, mapMap, normalsInDebug, debug, elevationDecoder, featuresByColor, debugFeaturePoints, render} from './app';
// import { csm} from './app';

export let currentColor = 0xffffff;

export class MaterialHeightShader extends MapHeightNode 
{

	public static BASE_GEOMETRY = MapPlaneNode.GEOMETRY;

	public static BASE_SCALE: THREE.Vector3 = new THREE.Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

	/**
	* Empty texture used as a placeholder for missing textures.
	*/
	public static EMPTY_TEXTURE = new THREE.Texture();

	/**
	* Size of the grid of the geometry displayed on the scene for each tile.
	*/
	public static GEOMETRY_SIZE = 200;

	public static geometries = {};

	public frustumCulled;

	public exageration;

	public static getGeometry(level): MapNodeGeometry
	{
		let size = MaterialHeightShader.GEOMETRY_SIZE;
		if (level < 11) 
		{
			// size /= Math.pow(2, 11 - level);
			size /= 11 - level;
			size = Math.max(16, size);
		}
		let geo = MaterialHeightShader.geometries[size];
		if (!MaterialHeightShader.geometries[size]) 
		{
			geo = MaterialHeightShader.geometries[size] = new MapNodeGeometry(1, 1, size, size);
		}
		return geo;
	}

	public static getSoftGeometry(level): MapNodeGeometry
	{
		return MaterialHeightShader.getGeometry(level - 1);
	}

	public constructor(parentNode, mapView, location, level, x, y) 
	{
		let material = new THREE.MeshPhongMaterial({
			map: MaterialHeightShader.EMPTY_TEXTURE,
			color: 0xffffff,
			wireframe: false,
			side: THREE.DoubleSide
		});
		material = MaterialHeightShader.prepareMaterial(material, level);
		super(parentNode, mapView, location, level, x, y, MaterialHeightShader.GEOMETRY, material);

		// if (mapView.csm) 
		// {
		// mapView.csm.setupMaterial(material);
		this.castShadow = true;
		this.receiveShadow = true;
		// }
		this.frustumCulled = false;
		this.exageration = exageration;
	}

	public static prepareMaterial(material, level): THREE.MeshPhongMaterial 
	{
		material.userData = {
			heightMap: {value: MaterialHeightShader.EMPTY_TEXTURE},
			drawNormals: {value: normalsInDebug},
			computeNormals: {value: normalsInDebug || debug || mapMap},
			drawTexture: {value: debug || mapMap},
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

			float getPixelElevation(vec4 e) {
				// Convert encoded elevation value to meters
				return ((e.r * elevationDecoder.x + e.g * elevationDecoder.y  + e.b * elevationDecoder.z) + elevationDecoder.w) * exageration;
			}
			float getElevation(vec2 coord, float width, float height) {
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
			uniform bool drawTexture;
			uniform bool drawBlack;
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

				ivec2 size = textureSize(heightMap, 0);
				float width = float(size.x);
				float height = float(size.y);
				float e = getElevationMean(vUv, width,height);
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

				vec3 _transformed = position + e * vec3(0,1,0);
				vec3 worldNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );

				gl_Position = projectionMatrix * modelViewMatrix * vec4(_transformed, 1.0);
				`
			);
		};
		return material;
	}

	// @ts-ignore
	public material: THREE.MeshPhongMaterial;

	public geometry;

	public loadTexture(): void 
	{
		this.mapView
			.provider.fetchTile(this.level, this.x, this.y)
			.then((image) => 
			{
				if (image) 
				{
					const texture = new THREE.Texture(image as any);
					texture.generateMipmaps = false;
					texture.format = THREE.RGBFormat;
					texture.magFilter = THREE.LinearFilter;
					texture.minFilter = THREE.LinearFilter;
					texture.needsUpdate = true;

					this.material.map = texture;
				}

				this.textureLoaded = true;
				this.nodeReady();
			})
			.catch((err) => 
			{
				console.error('GeoThree: Failed to load color node data.', err);
				this.textureLoaded = true;
				this.nodeReady();
			});

	}

	public loadHeightGeometry(): Promise<any> 
	{
		if (this.mapView.heightProvider === null) 
		{
			throw new Error('GeoThree: MapView.heightProvider provider is null.');
		}
		this.geometry = MaterialHeightShader.getGeometry(this.level);
		return this.mapView.heightProvider
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

	public async onHeightImage(image): Promise<void>
	{
		if (image) 
		{
			new CancelablePromise((resolve, reject) => 
			{
				const url = `https://api.maptiler.com/tiles/v3/${this.level}/${this.x}/${this.y}.pbf?key=V7KGiDaKQBCWTYsgsmxh`;
				try 
				{
					XHRUtils.getRaw(
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
										coordinates: 'wgs84',
										layers: ['mountain_peak']
									}
								}
							);
							result = result.filter(
								(f) => { return f.properties.name && f.properties.class === 'peak'; }
							);
							if (result.length > 0) 
							{
								const features = [];
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
									const geometry = new THREE.BufferGeometry();
									geometry.setAttribute(
										'position',
										new THREE.Float32BufferAttribute(
											points,
											3
										)
									);
									geometry.setAttribute(
										'color',
										new THREE.Float32BufferAttribute(
											colors,
											3
										)
									);
									geometry.setAttribute(
										'elevation',
										new THREE.Float32BufferAttribute(
											elevations,
											1
										)
									);
									var mesh = new THREE.Points(
										geometry,
										new THREE.ShaderMaterial({
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
	*/
	public raycast(raycaster, intersects): boolean
	{
		if (this.isMesh === true) 
		{
			const oldGeometry = this.geometry;
			this.geometry = MapPlaneNode.GEOMETRY;

			const result = THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);

			this.geometry = oldGeometry;

			return result;
		}

		return false;
	}
}
