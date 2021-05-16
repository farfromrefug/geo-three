import {Mesh, MeshPhongMaterial, Texture, RGBFormat, LinearFilter} from "three";
import {MapNodeGeometry} from "../geometries/MapNodeGeometry";
import {MapNode} from "./MapNode.js";
import Martini from "../martini/index.js";


function getTerrain(imageData, tileSize, elevationDecoder) 
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

function getMeshAttributes(vertices, terrain, tileSize, bounds, exageration) 
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
	  // NORMAL: {}, - optional, but creates the high poly look with lighting
	};
}

/** 
 * Represents a height map tile node that can be subdivided into other height nodes.
 * 
 * Its important to update match the height of the tile with the neighbors nodes edge heights to ensure proper continuity of the surface.
 * 
 * The height node is designed to use MapBox elevation tile encoded data as described in https://www.mapbox.com/help/access-elevation-data/
 *
 * @class MapHeightNode
 * @param parentNode {MapHeightNode} The parent node of this node.
 * @param mapView {MapView} Map view object where this node is placed.
 * @param location {number} Position in the node tree relative to the parent.
 * @param level {number} Zoom level in the tile tree of the node.
 * @param x {number} X position of the node in the tile tree.
 * @param y {number} Y position of the node in the tile tree.
 * @param material {Material} Material used to render this height node.
 * @param geometry {Geometry} Geometry used to render this height node.
 */
export class MapMartiniHeightNode extends MapNode
{
	static GEOMETRY_SIZE = 16;

	static GEOMETRY = new MapNodeGeometry(1, 1, MapMartiniHeightNode.GEOMETRY_SIZE, MapMartiniHeightNode.GEOMETRY_SIZE);

	static prepareMaterial(material, level, exageration) 
	{
		material.userData = {
			heightMap: {value: MaterialHeightShader.EMPTY_TEXTURE},
			drawNormals: {value: 1},
			zoomlevel: {value: level},
			exageration: {value: exageration}
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
				uniform bool drawNormals;
				uniform float exageration;
				uniform float zoomlevel;
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
				` + shader.fragmentShader;

			// Vertex depth logic
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <dithering_fragment>",
				`
					if(drawNormals) {
						gl_FragColor = vec4( ( 0.5 * vNormal + 0.5 ), 1.0 );
					}
					`
			);
			shader.vertexShader = shader.vertexShader.replace(
				"#include <fog_vertex>",
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
					float e = getElevation(vUv, 0.0);
					if (drawNormals) {
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
						vNormal = (normalize(cross(v2 - v0, v1 - v0)));
					}

					// vec3 _transformed = position + e * normal;
					// vec3 worldNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
// 
					// gl_Position = projectionMatrix * modelViewMatrix * vec4(_transformed, 1.0);
					// gl_Position = projectionMatrix * modelViewMatrix * vec4(position.yzx, 1.0);
					`
			);
		};

		return material;
	}
	
	constructor(parentNode, mapView, location, level, x, y, material, {elevationDecoder, meshMaxError, exageration} = {})
	{
		if (material === undefined)
		{
			 material = new THREE.MeshPhongMaterial({
				map: MaterialHeightShader.EMPTY_TEXTURE,
				color: 0xffffff
				// wireframe: true,
			});
			// material = new MeshPhongMaterial(
			// 	{
			// 		color: 0x000000,
			// 		specular: 0x000000,
			// 		shininess: 0,
			// 		wireframe: false,
			// 		emissive: 0xFFFFFF
			// 	});
		}
	
		super(MapMartiniHeightNode.GEOMETRY, material, parentNode, mapView, location, level, x, y);
	
		this.matrixAutoUpdate = false;
		this.isMesh = true;
		
		/**
		 * Flag indicating if the tile texture was loaded.
		 * 
		 * @attribute textureLoaded
		 * @type {boolean}
		 */
		this.textureLoaded = false;
	
		/**
		 * Flag indicating if the tile height data was loaded.
		 * 
		 * @attribute heightLoaded
		 * @type {boolean}
		 */
		this.heightLoaded = false;


		if (elevationDecoder) 
		{
			this.elevationDecoder = elevationDecoder;
		}
		else 
		{
			this.elevationDecoder = {
				rScaler: 6553.6,
				gScaler: 25.6,
				bScaler: 0.1,
				offset: -10000
			};
		}
		if (meshMaxError) 
		{
			this.meshMaxError = meshMaxError;
		}
		else 
		{
			this.meshMaxError = 10;
		}
		if (exageration) 
		{
			this.exageration = exageration;
		}
		else 
		{
			this.exageration = 1.4;
		}
		MapMartiniHeightNode.prepareMaterial(
			material,
			this.level,
			this.exageration
		);
	
		if (this.isReady) 
		{
			this.loadTexture();
		}
	}
	
	/**
	 * Original tile size of the images retrieved from the height provider.
	 *
	 * @static
	 * @attribute TILE_SIZE
	 * @type {number}
	 */
	static TILE_SIZE = 256;
	
	 /**
	 * Load tile texture from the server.
	 * 
	 * Aditionally in this height node it loads elevation data from the height provider and generate the appropiate maps.
	 *
	 * @method loadTexture
	 */
	 loadTexture()
	 {
		this.isReady = true;
		var self = this;
	
	 	this.mapView.fetchTile(this.level, this.x, this.y).then(function(image)
	 	{
			if (image) 
			{
				var texture = new Texture(image);
				texture.generateMipmaps = false;
				texture.format = RGBFormat;
				texture.magFilter = LinearFilter;
				texture.minFilter = LinearFilter;
				texture.needsUpdate = true;
			
	 			self.material.emissiveMap = texture;
		 }
	
	 	}).finally(() => 
		{
			self.textureLoaded = true;
			self.nodeReady();
		 });
	
	 	this.loadHeightGeometry();
	 };
	
	 nodeReady()
	 {
	 	if (!this.heightLoaded || !this.textureLoaded)
	 	{
	 		return;
	 	}
	
	 	this.visible = true;
	
	 	MapNode.prototype.nodeReady.call(this);
	 	this.mapView.onNodeReady();
	 };
	
	 createChildNodes()
	 {
	 	var level = this.level + 1;
	
	 	var x = this.x * 2;
	 	var y = this.y * 2;

	 	var node = new this.constructor(this, this.mapView, MapNode.TOP_LEFT, level, x, y, undefined, this);
	 	node.scale.set(0.5, 1, 0.5);
	 	node.position.set(-0.25, 0, -0.25);
	 	this.add(node);
	 	node.updateMatrix();
	 	node.updateMatrixWorld(true);
	
	 	var node = new this.constructor(this, this.mapView, MapNode.TOP_RIGHT, level, x + 1, y, undefined, this);
	 	node.scale.set(0.5, 1, 0.5);
	 	node.position.set(0.25, 0, -0.25);
	 	this.add(node);
	 	node.updateMatrix();
	 	node.updateMatrixWorld(true);
	
	 	var node = new this.constructor(this, this.mapView, MapNode.BOTTOM_LEFT, level, x, y + 1, undefined, this);
	 	node.scale.set(0.5, 1, 0.5);
	 	node.position.set(-0.25, 0, 0.25);
	 	this.add(node);
	 	node.updateMatrix();
	 	node.updateMatrixWorld(true);
	
	 	var node = new this.constructor(this, this.mapView, MapNode.BOTTOM_RIGHT, level, x + 1, y + 1, undefined, this);
	 	node.scale.set(0.5, 1, 0.5);
	 	node.position.set(0.25, 0, 0.25);
	 	this.add(node);
	 	node.updateMatrix();
	 	node.updateMatrixWorld(true);

	 };


	async onHeightImage(image) 
	{
		if (image) 
		{
			const tileSize = image.width;
			const gridSize = tileSize + 1;
			var canvas = new OffscreenCanvas(tileSize, tileSize);
	
			var context = canvas.getContext("2d");
			context.imageSmoothingEnabled = false;
			context.drawImage(image, 0, 0, tileSize, tileSize, 0, 0, canvas.width, canvas.height);
			
			var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
			var data = imageData.data;

			const terrain = getTerrain(data, tileSize, this.elevationDecoder);
			const martini = new Martini(gridSize);
			const tile = martini.createTile(terrain);
			const {vertices, triangles} = tile.getMesh(typeof this.meshMaxError === 'function' ? this.meshMaxError(this.level) : this.meshMaxError);
			const attributes = getMeshAttributes(vertices, terrain, tileSize, [-0.5, -0.5, 0.5, 0.5], this.exageration);
			this.geometry = new THREE.BufferGeometry();
			this.geometry.setIndex(new THREE.Uint32BufferAttribute(triangles, 1));
			this.geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( attributes.position.value, attributes.position.size ) );
			this.geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( attributes.uv.value, attributes.uv.size ) );
			this.geometry.rotateX(Math.PI);

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
	 * Load height texture from the server and create a geometry to match it.
	 *
	 * @method loadHeightGeometry
	 * @return {Promise<void>} Returns a promise indicating when the geometry generation has finished. 
	 */
	 loadHeightGeometry()
	 {
	 	if (this.mapView.heightProvider === null)
	 	{
	 		throw new Error("GeoThree: MapView.heightProvider provider is null.");
	 	}
		
	 	this.mapView.heightProvider.fetchTile(this.level, this.x, this.y).then((image) =>
	 	{	
			return this.onHeightImage(image);
	 	}).finally(() => 
		 {
			this.heightLoaded = true;
			this.nodeReady();
		  });
	 };
	
	 /**
	 * Overrides normal raycasting, to avoid raycasting when isMesh is set to false.
	 * 
	 * @method raycast
	 */
	 raycast(raycaster, intersects)
	 {
	 	if (this.isMesh === true)
	 	{
	 		return Mesh.prototype.raycast.call(this, raycaster, intersects);
	 	}
	
	 	return false;
	 };
}
