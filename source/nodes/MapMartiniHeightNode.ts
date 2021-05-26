import {BufferGeometry, DoubleSide, Float32BufferAttribute, MeshPhongMaterial, NearestFilter, RGBFormat, Texture, Uint32BufferAttribute} from 'three';
import {MapNodeGeometry} from '../geometries/MapNodeGeometry';
import {MapView} from '../MapView';
import Martini from '../martini/index.js';
import {MapHeightNode} from './MapHeightNode';
import {MapNode} from './MapNode.js';


function getTerrain(imageData, tileSize, elevationDecoder): Float32Array
{
	const {rScaler, bScaler, gScaler, offset} = elevationDecoder;
  
	const gridSize = tileSize + 1;
	// From Martini demo
	// https://observablehq.com/@mourner/martin-real-time-rtin-terrain-mesh
	const terrain = new Float32Array(gridSize * gridSize);
	// decode terrain values
	for (let i = 0, y = 0; y < tileSize; y++) 
	{
		for (let x = 0; x < tileSize; x++, i++) 
		{
			const k = i * 4;
			const r = imageData[k + 0];
			const g = imageData[k + 1];
			const b = imageData[k + 2];
			terrain[i + y] = r * rScaler + g * gScaler + b * bScaler + offset;
		}
	}
	// backfill bottom border
	for (let i = gridSize * (gridSize - 1), x = 0; x < gridSize - 1; x++, i++) 
	{
		terrain[i] = terrain[i - gridSize];
	}
	// backfill right border
	for (let i = gridSize - 1, y = 0; y < gridSize; y++, i += gridSize) 
	{
		terrain[i] = terrain[i - 1];
	}
	return terrain;
}

function getMeshAttributes(vertices, terrain, tileSize, bounds, exageration): {
	position: {value: Float32Array, size: number},
	uv: {value: Float32Array, size: number}
	// NORMAL: {}, - optional, but creates the high poly look with lighting
  }
{
	const gridSize = tileSize + 1;
	const numOfVerticies = vertices.length / 2;
	// vec3. x, y in pixels, z in meters
	const positions = new Float32Array(numOfVerticies * 3);
	// vec2. 1 to 1 relationship with position. represents the uv on the texture image. 0,0 to 1,1.
	const texCoords = new Float32Array(numOfVerticies * 2);
  
	const [minX, minY, maxX, maxY] = bounds || [0, 0, tileSize, tileSize];
	const xScale = (maxX - minX) / tileSize;
	const yScale = (maxY - minY) / tileSize;
  
	for (let i = 0; i < numOfVerticies; i++) 
	{
		const x = vertices[i * 2];
		const y = vertices[i * 2 + 1];
		const pixelIdx = y * gridSize + x;
  
		positions[3 * i + 0] = x * xScale + minX;
		positions[3 * i + 1] = -terrain[pixelIdx] * exageration;
		positions[3 * i + 2] = -y * yScale + maxY;

  
		texCoords[2 * i + 0] = x / tileSize;
		texCoords[2 * i + 1] = y / tileSize;
	}
  
	return {
		position: {value: positions, size: 3},
		uv: {value: texCoords, size: 2}
	};
}

/** 
 * Represents a height map tile node that can be subdivided into other height nodes.
 * 
 * Its important to update match the height of the tile with the neighbors nodes edge heights to ensure proper continuity of the surface.
 * 
 * The height node is designed to use MapBox elevation tile encoded data as described in https://www.mapbox.com/help/access-elevation-data/
 *
 * @param parentNode  -The parent node of this node.
 * @param mapView - Map view object where this node is placed.
 * @param location - Position in the node tree relative to the parent.
 * @param level - Zoom level in the tile tree of the node.
 * @param x - X position of the node in the tile tree.
 * @param y - Y position of the node in the tile tree.
 * @param material   -Material used to render this height node.
 * @param geometry - Geometry used to render this height node.
 */
export class MapMartiniHeightNode extends MapHeightNode
{
	public static GEOMETRY_SIZE = 16;

	/**
	* Empty texture used as a placeholder for missing textures.
	*/
	public static EMPTY_TEXTURE: Texture = new Texture();

	public static GEOMETRY = new MapNodeGeometry(1, 1, MapMartiniHeightNode.GEOMETRY_SIZE, MapMartiniHeightNode.GEOMETRY_SIZE);

	public static prepareMaterial(material, level, exageration): any 
	{

		// not all are used
		// but for now it helps in fast switching between martini and height shader
		material.userData = {
			heightMap: {value: MapMartiniHeightNode.EMPTY_TEXTURE},
			drawNormals: {value: 0},
			drawBlack: {value: 0},
			zoomlevel: {value: level},
			exageration: {value: exageration},
			computeNormals: {value: 1},
			drawTexture: {value: 1},
			elevationDecoder: {value: null}
		};

		material.onBeforeCompile = (shader) => 
		{
			// Pass uniforms from userData to the
			for (let i in material.userData) 
			{
				shader.uniforms[i] = material.userData[i];
			}
			// Vertex variables
			shader.vertexShader =
				`
				uniform bool computeNormals;
				uniform float zoomlevel;
				uniform float exageration;
				uniform sampler2D heightMap;

				float getElevation(vec2 coord, float bias) {
					// Convert encoded elevation value to meters
					coord = clamp(coord, 0.0, 1.0);
					vec4 e = texture2D(heightMap,vec2(coord.x, 1.0 -coord.y));
					return (((e.r * 255.0 * 65536.0 + e.g * 255.0 * 256.0 + e.b * 255.0) * 0.1) - 10000.0) * exageration;
					// return ((e.r * 255.0 * 256.0 + e.g  * 255.0+ e.b * 255.0 / 256.0) - 32768.0) * exageration;
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

					if (computeNormals) {
						float e = getElevation(vUv, 0.0);
						ivec2 size = textureSize(heightMap, 0);
						float offset = 1.0 / float(size.x);
						float a = getElevation(vUv + vec2(-offset, -offset), 0.0);
						float b = getElevation(vUv + vec2(0, -offset), 0.0);
						float c = getElevation(vUv + vec2(offset, -offset), 0.0);
						float d = getElevation(vUv + vec2(-offset, 0), 0.0);
						float f = getElevation(vUv + vec2(offset, 0), 0.0);
						float g = getElevation(vUv + vec2(-offset, offset), 0.0);
						float h = getElevation(vUv + vec2(0, offset), 0.0);
						float i = getElevation(vUv + vec2(offset,offset), 0.0);


						float NormalLength = 500.0 / zoomlevel;

						vec3 v0 = vec3(0.0, 0.0, 0.0);
						vec3 v1 = vec3(0.0, NormalLength, 0.0);
						vec3 v2 = vec3(NormalLength, 0.0, 0.0);
						v0.z = (e + d + g + h) / 4.0;
						v1.z = (e+ b + a + d) / 4.0;
						v2.z = (e+ h + i + f) / 4.0;
						vNormal = (normalize(cross(v2 - v0, v1 - v0))).rbg;
					}
					`
			);
		};

		return material;
	}

	public elevationDecoder = {
		rScaler: 256,
		gScaler: 1,
		bScaler: 1 / 256,
		offset: -32768
	}

	public exageration = 1.0;

	public meshMaxError: number | Function = 10;
	

	public material: MeshPhongMaterial

	public constructor(parentNode: MapHeightNode = null, mapView: MapView = null, location: number = MapNode.ROOT, level: number = 0, x: number = 0, y: number = 0, {elevationDecoder = null, meshMaxError = 10, exageration = 1} = {})
	{

		super(parentNode, mapView, location, level, x, y, MapMartiniHeightNode.GEOMETRY, MapMartiniHeightNode.prepareMaterial(new MeshPhongMaterial({
			map: MapMartiniHeightNode.EMPTY_TEXTURE,
			color: 0xffffff,
			side: DoubleSide
		}), level, exageration));

		if (elevationDecoder) 
		{
			this.elevationDecoder = elevationDecoder;
		}

		this.meshMaxError = meshMaxError;
		this.exageration = exageration;
		this.frustumCulled = false;
	}
	
	/**
	* Original tile size of the images retrieved from the height provider.
	*
	*/
	public static TILE_SIZE = 256;

	
	public async onHeightImage(image): Promise<void> 
	{
		if (image) 
		{
			const tileSize = image.width;
			const gridSize = tileSize + 1;
			var canvas = new OffscreenCanvas(tileSize, tileSize);
	
			var context = canvas.getContext('2d');
			context.imageSmoothingEnabled = false;
			context.drawImage(image, 0, 0, tileSize, tileSize, 0, 0, canvas.width, canvas.height);
			
			var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
			var data = imageData.data;

			const terrain = getTerrain(data, tileSize, this.elevationDecoder);
			const martini = new Martini(gridSize);
			const tile = martini.createTile(terrain);
			const {vertices, triangles} = tile.getMesh(typeof this.meshMaxError === 'function' ? this.meshMaxError(this.level) : this.meshMaxError);
			const attributes = getMeshAttributes(vertices, terrain, tileSize, [-0.5, -0.5, 0.5, 0.5], this.exageration);
			this.geometry = new BufferGeometry();
			this.geometry.setIndex(new Uint32BufferAttribute(triangles, 1));
			this.geometry.setAttribute( 'position', new Float32BufferAttribute( attributes.position.value, attributes.position.size ) );
			this.geometry.setAttribute( 'uv', new Float32BufferAttribute( attributes.uv.value, attributes.uv.size ) );
			this.geometry.rotateX(Math.PI);

			var texture = new Texture(image);
			texture.generateMipmaps = false;
			texture.format = RGBFormat;
			texture.magFilter = NearestFilter;
			texture.minFilter = NearestFilter;
			texture.needsUpdate = true;
			this.material.userData.heightMap.value = texture;
		}
	}
}