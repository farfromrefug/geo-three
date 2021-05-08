CameraControls.install({THREE: THREE});

var stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);

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

const pickPosition = {x: 0, y: 0};
class PickHelper 
{
	constructor() 
	{
		this.raycaster = new THREE.Raycaster();
		this.pickedObject = null;
		// this.pickedObjectSavedColor = 0;
	}

	pick(normalizedPosition, scene, camera) 
	{
		// console.log("pick", normalizedPosition);
		// restore the color if there is a picked object
		// if (this.pickedObject) {
		//     // this.pickedObject.material.emissive.setHex(
		//     //     this.pickedObjectSavedColor
		//     // );
		//     this.pickedObject = undefined;
		// }

		// cast a ray through the frustum
		this.raycaster.setFromCamera(normalizedPosition, camera);
		// get the list of objects the ray intersected
		let intersectedObjects = this.raycaster.intersectObjects(
			map.children,
			true
		);
		if (intersectedObjects.length) 
		{
			const intersectedObject = intersectedObjects.sortOn(
				"distanceToRay"
			)[0];
			if (intersectedObject.distanceToRay < 0.001) 
			{
				// console.log(
				//     "intersectedObject",
				//     intersectedObjects
				// );
				const feature =
                                intersectedObject.object.features[
                                	intersectedObject.index
                                ];
				if (
					!this.pickedObject ||
                                feature.id !== this.pickedObject.id
				) 
				{
					this.pickedObject = feature;
					console.log(
						"pickedObject",
						this.pickedObject.id,
						this.pickedObject.properties.name
					);
				}
			}
			// pick the first object. It's the closest one
			// save its color
			// this.pickedObjectSavedColor = this.pickedObject.material.emissive.getHex();
			// set its emissive color to flashing red/yellow
			// this.pickedObject.material.emissive.setHex(0xff0000);
		}
	}
}
// Follows the structure of
// 		https://github.com/mrdoob/three.js/blob/master/examples/jsm/postprocessing/OutlinePass.js
class CustomOutlinePass extends THREE.Pass 
{
	constructor(resolution, scene, camera) 
	{
		super();

		this.renderScene = scene;
		this.renderCamera = camera;
		this.resolution = new THREE.Vector2(
			resolution.x,
			resolution.y
		);

		this.fsQuad = new THREE.Pass.FullScreenQuad(null);
		this.fsQuad.material = this.createOutlinePostProcessMaterial();
		this.normalOverrideMaterial = new THREE.MeshNormalMaterial();
	}

	dispose() 
	{
		this.fsQuad.dispose();
	}

	setSize(width, height) 
	{
		this.resolution.set(width, height);

		const size = Math.max(width, height);
		this.fsQuad.material.uniforms.screenSize.value.set(
			2000,
			2000,
			1 / 2000,
			1 / 2000
		);
	}

	render(renderer, writeBuffer, readBuffer) 
	{
		renderer.render(this.renderScene, this.renderCamera);

		this.fsQuad.material.uniforms["sceneColorBuffer"].value =
                        readBuffer.texture;

		renderer.setRenderTarget(null);
		this.fsQuad.render(renderer);
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
                                 	uniform sampler2D sceneColorBuffer;
                                 	uniform sampler2D depthBuffer;
                                 	// uniform sampler2D normalBuffer;
                                 	uniform float cameraNear;
                                 	uniform float cameraFar;
                                 	uniform vec4 screenSize;
                                 	uniform vec3 outlineColor;
                                 	uniform vec4 multiplierParameters;
                                 	varying vec2 vUv;
                                 	// Helper functions for reading from depth buffer.
                                 	// float readDepth (sampler2D depthSampler, vec2 coord) {
                                 	// 	float fragCoordZ = texture2D(depthSampler, coord).x;
                                 	// 	float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
                                 	// 	return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
                                 	// }
                                 	// float getLinearDepth(vec3 pos) {
                                 	// 	return -(viewMatrix * vec4(pos, 1.0)).z;
                                 	// }
                                 	// float getLinearScreenDepth(sampler2D map) {
                                 	// 		vec2 uv = gl_FragCoord.xy * screenSize.zw;
                                 	// 		return readDepth(map,uv);
                                 	// }
                                 	// Helper functions for reading normals and depth of neighboring pixels.
                                 	// float getPixelDepth(float x, float y) {
                                 	// 	// screenSize.zw is pixel size
                                 	// 	// vUv is current position
                                 	// 	return readDepth(depthBuffer, vUv + screenSize.zw * vec2(x, y));
                                 	// }
                                 	vec3 getPixelNormal(float x, float y) {
                                 		return texture2D(sceneColorBuffer, vUv + screenSize.zw * vec2(x, y)).rgb;
                                 	}
                                 	float saturate(float num) {
                                 		return clamp(num, 0.0, 1.0);
                                 	}
                                 	void main() {
                                 		vec4 sceneColor = vec4(1.0,1.0,1.0,1.0);
                                 		// float depth = getPixelDepth(0.0, 0.0);
                                         // float delta =  max(0.07/(depth), 1.0);
                                         float delta =  1.0;
                                         float delta1 = 1.0 ;
                                 		vec3 normal = getPixelNormal(0.0, 0.0);
                                 		// Get the difference between depth of neighboring pixels and current.
                                 		float depthDiff = 0.0;
                                 		// depthDiff += abs(depth - getPixelDepth(delta1, 0.0));
                                 		// depthDiff += abs(depth - getPixelDepth(-delta1, 0.0));
                                 		// depthDiff += abs(depth - getPixelDepth(0.0, delta1));
                                 		// depthDiff += abs(depth - getPixelDepth(0.0, -delta1));
                                 		// Get the difference between normals of neighboring pixels and current
                                 		float normalDiff = 0.0;
                                 		normalDiff += distance(normal, getPixelNormal(delta, 0.0));
                                 		normalDiff += distance(normal, getPixelNormal(0.0, delta));
                                 		normalDiff += distance(normal, getPixelNormal(0.0, delta));
                                 		normalDiff += distance(normal, getPixelNormal(0.0, -delta));
                                 		normalDiff += distance(normal, getPixelNormal(delta, delta));
                                 		normalDiff += distance(normal, getPixelNormal(delta, -delta));
                                 		normalDiff += distance(normal, getPixelNormal(-delta, delta));
                                 		normalDiff += distance(normal, getPixelNormal(-delta, -delta));
                                 		// Apply multiplier & bias to each
                                 		float depthBias = multiplierParameters.x;
                                 		float depthMultiplier = multiplierParameters.y;
                                 		float normalBias = multiplierParameters.z;
                                 		float normalMultiplier = multiplierParameters.w;
                                 		depthDiff = depthDiff * depthMultiplier;
                                 		depthDiff = saturate(depthDiff);
                                 		depthDiff = pow(depthDiff, depthBias);
                                 		normalDiff = normalDiff * normalMultiplier;
                                 		normalDiff = saturate(normalDiff);
                                 		normalDiff = pow(normalDiff, normalBias);
                                 		float outline = normalDiff+depthDiff ;

                                 		// Combine outline with scene color.
                                 		vec4 outlineColor = vec4(outlineColor, 1.0);
                                 		gl_FragColor = vec4(mix(sceneColor, outlineColor, outline));

                                 	}
                                 	`;
	}

	createOutlinePostProcessMaterial() 
	{
		const size = Math.max(this.resolution.x, this.resolution.y);
		return new THREE.ShaderMaterial({
			uniforms: {
				sceneColorBuffer: {},
				// depthBuffer: {},
				// normalBuffer: {},
				outlineColor: {value: new THREE.Color(0x000000)},
				// 4 scalar values packed in one uniform: depth multiplier, depth bias, and same for normals.
				multiplierParameters: {
					// value: new THREE.Vector4(0.6, 10, 2, 0.5),
					value: new THREE.Vector4(1, 1, 1.4, 0.7)
					// value: new THREE.Vector4(1, 1, 1.2, 0.8),
				},
				cameraNear: {value: this.renderCamera.near},
				cameraFar: {value: this.renderCamera.far},
				screenSize: {
					value: new THREE.Vector4(
						size,
						size,
						1 / size,
						1 / size
					)
				}
			},
			vertexShader: this.vertexShader,
			fragmentShader: this.fragmentShader
		});
	}
}
const pickHelper = new PickHelper();

let debug = false;
let debugFeaturePoints = false;
let debugGPUPicking = false;
let readFeatures = true;
let drawLines = true;
let pointBufferTargetScale = 10;
const lineMaterial = new THREE.LineBasicMaterial({color: 0x000000});
var canvas = document.getElementById("canvas");
var canvas2 = document.getElementById("canvas2");
var canvas3 = document.getElementById("canvas3");
var canvas4 = document.getElementById("canvas4");
var ctx2d = canvas4.getContext("2d");
let pixelsBuffer;
var renderer = new THREE.WebGLRenderer({
	canvas: canvas,
	antialias: true,
	alpha: true,
	powerPreference: "high-performance"
});
// renderer.setClearColor(0x000000, 1); // the default
// var renderer2 = new THREE.WebGLRenderer({
//     canvas: canvas2,
//     antialias: true,
//     alpha: true,
//     powerPreference: "high-performance",
// });
// renderer2.setClearColor(0x000000, 0); // the default
var rendereroff = new THREE.WebGLRenderer({
	canvas: canvas3,
	antialias: false,
	alpha: false,
	powerPreference: "high-performance"
});
const pointBufferTarget = new THREE.WebGLRenderTarget(
	Math.round(window.innerWidth / pointBufferTargetScale),
	Math.round(window.innerHeight / pointBufferTargetScale),
	{
		autoClear: true,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat
	}
);

var scene = new THREE.Scene();
var orthoscene = new THREE.Scene();
// var geometry = new THREE.BufferGeometry();
// var positions = new Float32Array(3 * 2);
// positions[0] = 300;
// positions[1] = 0;
// positions[2] = 0;
// positions[3] = 300;
// positions[4] = 550;
// positions[5] = 0;
// geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

// orthoscene.add(
//     new THREE.Line(
//         geometry,
//         new THREE.LineBasicMaterial({
//             size:10,
//             color: 0x0000ff,
//         })
//     )
// );
// scene.background = new THREE.Color(0.4, 0.4, 0.4);

// var sky = createSky();
// scene.add(sky);

var debugMapCheckBox = document.getElementById("debugMap");
debugMapCheckBox.onchange = function(event) 
{
	debug = event.target.checked;
	render();
};
var debugGPUPickingCheckbox = document.getElementById(
	"debugGPUPicking"
);
debugGPUPickingCheckbox.onchange = function(event) 
{
	debugGPUPicking = event.target.checked;
	canvas3.style.visibility = debugGPUPicking
		? "visible"
		: "hidden";
	render();
};
var readFeaturesCheckbox = document.getElementById("readFeatures");
readFeaturesCheckbox.onchange = function(event) 
{
	readFeatures = event.target.checked;

	canvas4.style.visibility =
                    readFeatures && drawLines ? "visible" : "hidden";
	render();
};
var drawLinesCheckbox = document.getElementById("drawLines");
drawLinesCheckbox.onchange = function(event) 
{
	drawLines = event.target.checked;
	canvas4.style.visibility =
                    readFeatures && drawLines ? "visible" : "hidden";
	render();
};

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
		this.maxZoom = 11;
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
					// if (zoom < this.minZoom) {
					resolve();
					// } else {
					// reject();
					// }
				};
				image.crossOrigin = "Anonymous";
				image.src =
                                // "http://192.168.1.45:8080/data/BDALTIV2_75M_rvb/" +
                                "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/" +
                                zoom +
                                "/" +
                                x +
                                "/" +
                                y +
                                ".png";
				// console.log("fetchTile", image.src);
			})

			// new Geo.CancelablePromise((resolve, reject) => {
			//     const url =
			//         "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/" +
			//         zoom +
			//         "/" +
			//         x +
			//         "/" +
			//         y +
			//         ".png";
			//     try {
			//         Geo.XHRUtils.getRaw(
			//             url,
			//             async (data) => {
			//                 const result = await ImageLoader.parse(
			//                     data,
			//                     {
			//                         image: { type: "data" },
			//                     }
			//                 );
			//                 resolve(result);
			//             },
			//             resolve
			//         );
			//     } catch (err) {
			//         console.error(err);
			//     }
			// }),
			// new Geo.CancelablePromise((resolve, reject) => {
			//     const url = `https://api.maptiler.com/tiles/v3/${zoom}/${x}/${y}.pbf?key=V7KGiDaKQBCWTYsgsmxh`;
			//     try {
			//         Geo.XHRUtils.getRaw(
			//             url,
			//             async (data) => {
			//                 const result = await MVTLoader.parse(
			//                     data,
			//                     {
			//                         mvt: {
			//                             tileIndex: {
			//                                 x,
			//                                 y,
			//                                 z: zoom,
			//                             },
			//                             coordinates: "wgs84",
			//                             layers: ["mountain_peak"],
			//                         },
			//                     }
			//                 );
			//                 this.features = result.filter(
			//                     (f) => f.properties.name
			//                 );

			//                 resolve(this.features);
			//             },
			//             resolve
			//         );
			//     } catch (err) {
			//         console.error(err);
			//     }
			// }),
		]);
		return result[0];
	}
}

const exageration = 1.7;

let currentColor = 0xffffff;
// const features = {};
const featuresByColor = {};
class MapMartiniHeightNode extends Geo.MapMartiniHeightNode 
{
	// onBeforeRender(
	//     renderer,
	//     scene,
	//     camera,
	//     geometry,
	//     material,
	//     group
	// ) {
	//     if (renderingPoints) {
	//         this.material.userData.drawNormals.value = false;
	//         this.objectsHolder.visible = true;
	//     } else {
	//         this.material.userData.drawNormals.value = true;
	//         this.objectsHolder.visible = false;
	//     }
	// }

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
							const result = await MVTLoader.parse(
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

		return super.onHeightImage(image);
	}
}

let NODE_READY_TEST = 0;
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
                static GEOMETRY_SIZE = 256;

                /**
                 * Map node plane geometry.
                 *
                 * @static
                 * @attribute GEOMETRY
                 * @type {PlaneBufferGeometry}
                 */
                static GEOMETRY = new Geo.MapNodeGeometry(1, 1, 16, 16);

                static geometries = {};

                static getGeometry(level) 
                {
                	let size = MaterialHeightShader.GEOMETRY_SIZE;
                	if (level < 11) 
                	{
                		// size /= Math.pow(2, (11 - level) * 2);
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
                		// wireframe: true,
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

                                         float getPixelElevation(vec4 e) {
                                            // Convert encoded elevation value to meters
                                            // return (((e.r * 255.0 * 65536.0 + e.g * 255.0 * 256.0 + e.b * 255.0) * 0.1) - 10000.0) * exageration;
                                            return ((e.r * 255.0 * 256.0 + e.g  * 255.0+ e.b * 255.0 / 256.0) - 32768.0) * exageration;
                                         }
                                 		float getElevation(vec2 coord) {
                                            vec4 e = texture2D(heightMap, coord);
                                            return getPixelElevation(e);
                                         }
                                 		float getElevationMean(vec2 coord, float width, float height) {
                                            // coord = clamp(coord, 0.0, 1.0);
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
                                 		` + shader.fragmentShader;

                		// Vertex depth logic
                		shader.fragmentShader = shader.fragmentShader.replace(
                			"#include <dithering_fragment>",
                			`
                                 			if(drawNormals) {
                                 				gl_FragColor = vec4( ( 0.5 * vNormal + 0.5 ), 1.0 );
                                 			} else {
                                 				gl_FragColor = vec4( 0.0,0.0,0.0, 1.0 );
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
                                             ivec2 size = textureSize(heightMap, 0);
                                             float width = float(size.x);
                                             float height = float(size.y);
                                 			float e = getElevationMean(vUv, width,height);
                                 			if (drawNormals) {
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
                                 				vec3 v2 = vec3(NormalLength, 0.0, 0.0);
                                 				v0.z = (e + d + g + h) / 4.0;
                                 				v1.z = (e + b + a + d) / 4.0;
                                 				v2.z = (e + h + i + f) / 4.0;
                                 				vNormal = (normalize(cross(v2 - v0, v1 - v0)));
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
                							(f) => {return f.properties.name;}
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
                                                                 gl_PointSize =  floor(elevation / 1000.0) / 2.0;
                                                                //  gl_PointSize = gl_Position.z ;
                                                                 gl_Position = projectionMatrix * mvPosition;
                                                                 gl_Position.z -= (elevation / 1000.0 - floor(elevation / 1000.0)) * 30.0;
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

var projection = new THREE.Matrix4();
var pov = new THREE.Vector3();
var frustum = new THREE.Frustum();
var position = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
let linesToDraw = [];
function throttle(callback, limit) 
{
	var waiting = false; // Initially, we're not waiting
	return function() 
	{
		// We return a throttled function
		if (!waiting) 
		{
			// If we're not waiting
			callback.apply(this, arguments); // Execute users function
			waiting = true; // Prevent future invocations
			setTimeout(function() 
			{
				// After a period of time
				waiting = false; // And allow future invocations
			}, limit);
		}
	};
}
const mouse = new THREE.Vector2(0, 0);

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
	const provider = debug
		? new Geo.DebugProvider()
		: new EmptyProvider();
	provider.minZoom = 5;
	provider.maxZoom = 11;
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
// map.root = new MaterialHeightShader(
//     null,
//     map,
//     Geo.MapNode.ROOT,
//     0,
//     0,
//     0
// );
// map.lod.subdivisionRays = 2;
// map.lod.thresholdUp = 0.9;
// map.lod.thresholdDown = 0.5;

var camera = new THREE.PerspectiveCamera(
	50,
	window.innerWidth/ window.innerHeight,
	100,
	20000000
);
var coords = Geo.UnitsUtils.datumsToSpherical(45.16667, 5.71667);
const EPS = 1e-5;
camera.position.set( 0, 0, EPS );
var controls = new CameraControls(camera, canvas);
controls.azimuthRotateSpeed = - 0.15; // negative value to invert rotation direction
controls.polarRotateSpeed = - 0.15; // negative value to invert rotation direction
controls.enablePan = 1;
controls.minZoom = 1;
controls.truckSpeed = 1 / EPS * 3;
controls.mouseButtons.wheel = CameraControls.ACTION.ZOOM;
controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_TRUCK;
controls.verticalDragToForward = true;
controls.moveTo(coords.x, 1000, -coords.y);
// controls.saveState();
controls.addEventListener("update", () => 
{
	onControlUpdate();
});
const clock = new THREE.Clock();
controls.addEventListener("control", () => 
{
	const delta = clock.getDelta();
	controls.update(delta);
});

// if (!debug) {
//     controls.enableZoom = true;
//     controls.minDistance = 0;
//     controls.maxDistance = 100;
//     controls.minZoom = 0.0;
//     // controls.maxZoom = 1000000.0;
//     controls.zoomSpeed = 20.0;
//     controls.panSpeed = 60.0;
// } else {
//     controls.minDistance = 1e1;
//     controls.maxDistance = 100000;
//     controls.zoomSpeed = 2.0;
// }
// if (!debug) {
//     controls.minPolarAngle = Math.PI / 3;
//     controls.maxPolarAngle = Math.PI / 2.01;
// } else {
//     controls.minPolarAngle = 0;
//     controls.maxPolarAngle = Math.PI;
// }
// controls.mouseButtons = {
//     LEFT: THREE.MOUSE.PAN,
//     MIDDLE: THREE.MOUSE.DOLLY,
//     RIGHT: THREE.MOUSE.ROTATE,
// };
// controls.touches = {
//     ONE: THREE.TOUCH.ROTATE,
//     TWO: THREE.TOUCH.DOLLY_PAN,
// };
// camera.position.set(coords.x, 1000, -coords.y);
// controls.setLookAt(coords.x, 1000, -coords.y);
if (debug) 
{
	scene.add(new THREE.AmbientLight(0x777777));
	var directional = new THREE.DirectionalLight(0x777777);
	directional.position.set(100, 10000, 700);
	scene.add(directional);
}

const depthTexture = new THREE.DepthTexture();
const renderTarget = new THREE.WebGLRenderTarget(
	window.innerWidth,
	window.innerHeight
);
const composer = new THREE.EffectComposer(renderer, renderTarget);
const renderPass = new THREE.RenderPass(scene, camera);
composer.addPass(renderPass);

const customOutline = new CustomOutlinePass(
	new THREE.Vector2(window.innerWidth, window.innerHeight),
	scene,
	camera
);
composer.addPass(customOutline);

document.body.onresize = function() 
{
	const width = window.innerWidth;
	const height = window.innerHeight;
	const scale = width / height;
	let offWidth;
	let offHeight;
	if (scale > 1) 
	{
		offWidth = 300;
		offHeight = Math.round(offWidth / scale);
	}
	else 
	{
		offHeight = 300;
		offWidth = Math.round(offHeight * scale);
	}
	pointBufferTargetScale = width / offWidth;
	// console.log(
	//     "onresize",
	//     width,
	//     height,
	//     pointBufferTargetScale,
	//     devicePixelRatio,
	//     offWidth,
	//     offHeight
	// );
	canvas4.width = width;
	canvas4.height = height;
	// canvas2.width = width;
	// canvas2.height = height;
	renderer.setSize(width, height);
	renderer.setPixelRatio(1);

	pixelsBuffer = new Uint8Array(offWidth * offHeight * 4);
	rendereroff.setSize(offWidth, offHeight);
	rendereroff.setPixelRatio(1);
	pointBufferTarget.setSize(offWidth, offHeight);

	// renderer2.setSize(width, height);
	// renderer2.setPixelRatio(1);

	composer.setSize(width, height);
	if (!debug) 
	{
		// renderer.setPixelRatio(0.5);
	}
	// composer.setPixelRatio(0.5);
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

function readShownFeatures() 
{
	const start = Date.now();
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
	let lastColorNb = 0;
	const tempvector = new THREE.Vector3(0, 0, 0);
	function handleLastColor(index) 
	{
		if (readColors.indexOf(lastColor) === -1) 
		{
			readColors.push(lastColor);
			const feature = featuresByColor[lastColor];
			if (feature) 
			{
				var coords = Geo.UnitsUtils.datumsToSpherical(
					feature.geometry.coordinates[1],
					feature.geometry.coordinates[0]
				);
				tempvector.set(
					coords.x,
					feature.properties.ele * exageration,
					-coords.y
				);
				const vector = toScreenXY(tempvector);
				rFeatures.push({
					...feature,
					x: vector.x,
					y: vector.y,
					z: vector.z
				});
			}
		}
	}

	for (let index = 0; index < pixelsBuffer.length; index += 4) 
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
	rFeatures = rFeatures.sortOn("x");
	let lastFeature;
	const minDistance = 10;
	const featuresToShow = [];
	rFeatures.forEach((f) => 
	{
		if (!lastFeature) 
		{
			// first
			lastFeature = f;
		}
		else if (f.x - lastFeature.x < minDistance) 
		{
			let deltaY = f.y - lastFeature.y;
			let deltaZ = Math.abs(f.z - lastFeature.z);
			if (deltaZ < 0.01) 
			{
				deltaY =
                                f.properties.ele - lastFeature.properties.ele;
			}
			if (deltaY > 0) 
			{
				lastFeature = f;
			}
			else 
			{
			}
		}
		else 
		{
			featuresToShow.push(lastFeature);
			lastFeature = f;
		}
	});
	if (lastFeature) 
	{
		featuresToShow.push(lastFeature);
	}

	if (!drawLines) 
	{
		return;
	}
	const toShow = featuresToShow.length;
	const existing = orthoscene.children.length;
	const min = Math.min(toShow, existing);
	const max = Math.max(toShow, existing);
	ctx2d.clearRect(0, 0, canvas4.width, canvas4.height);
	for (let index = 0; index < toShow; index++) 
	{
		const f = featuresToShow[index];
		const y = f.y;
		if (y >= 120) 
		{
			// console.log('test')
			ctx2d.beginPath();
			ctx2d.fillStyle = "black";
			ctx2d.moveTo(f.x, 120);
			ctx2d.lineTo(f.x, f.y);
			ctx2d.closePath();
			ctx2d.stroke();
			ctx2d.save();
			ctx2d.translate(f.x, 120);
			ctx2d.rotate(-Math.PI / 4);
			ctx2d.font = "normal 12px Courier";
			const text = f.properties.name;
			var textWidth = ctx2d.measureText(text).width;
			ctx2d.fillText(text, 0, 0);
			ctx2d.font = "normal 9px Courier";
			ctx2d.fillText(
				f.properties.ele + "m",
				textWidth + 5,
				0
			);
			ctx2d.restore();
		}
	}
}

function render() 
{
	if (!renderer || !composer) 
	{
		return;
	}
	if (readFeatures && pixelsBuffer) 
	{
		applyOnNodes((node) => 
		{
			node.realMaterial = node.material;
			node.material.userData.drawNormals.value = false;
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
			node.material.userData.drawNormals.value = true;
			node.objectsHolder.visible = debugFeaturePoints;
		});
	}
	else 
	{
		applyOnNodes((node) => 
		{
			node.material.userData.drawNormals.value = !debug;
			node.objectsHolder.visible = debugFeaturePoints;
		});
	}

	if (debug) 
	{
		renderer.render(scene, camera);
	}
	else 
	{
		composer.render();
	}
	stats.end();
}


clearPickPosition();

function getCanvasRelativePosition(event) 
{
	const rect = canvas.getBoundingClientRect();
	return {
		x:
                        (event.clientX - rect.left) * canvas.width /
                        rect.width,
		y:
                        (event.clientY - rect.top) * canvas.height /
                        rect.height
	};
}

function setPickPosition(event) 
{
	const pos = getCanvasRelativePosition(event);
	pickPosition.x = pos.x / canvas.width * 2 - 1;
	pickPosition.y = pos.y / canvas.height * -2 + 1; // note we flip Y
	pickHelper.pick(pickPosition, scene, camera);
}

function clearPickPosition() 
{
	// unlike the mouse which always has a position
	// if the user stops touching the screen we want
	// to stop picking. For now we just pick a value
	// unlikely to pick something
	pickPosition.x = -100000;
	pickPosition.y = -100000;
}

// window.addEventListener("mousemove", setPickPosition);
// window.addEventListener("mouseout", clearPickPosition);
// window.addEventListener("mouseleave", clearPickPosition);
// window.addEventListener(
//     "touchstart",
//     (event) => {
//         console.log("touchstart");
//         // prevent the window from scrolling
//         event.preventDefault();
//         setPickPosition(event.touches[0]);
//     },
//     { passive: false }
// );

// window.addEventListener("touchmove", (event) => {
//     console.log("touchmove");
//     setPickPosition(event.touches[0]);
// });

// window.addEventListener("touchend", clearPickPosition);
