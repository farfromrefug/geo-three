import { Mesh, Group, Texture, RGBFormat, LinearFilter, BufferGeometry, Float32BufferAttribute, Vector2, Vector3, MeshBasicMaterial, MeshPhongMaterial, Matrix4, Quaternion, Vector4, NearestFilter, Raycaster, DoubleSide, Uint32BufferAttribute, Frustum, Color } from 'three';
import { getChildren, tileToBBOX, pointToTile } from '@mapbox/tilebelt';

class CancelablePromise {
    constructor(executor, cancelRunner) {
        this.fulfilled = false;
        this.rejected = false;
        this.called = false;
        this.cancelRunner = cancelRunner;
        const resolve = (v) => {
            this.fulfilled = true;
            this.value = v;
            if (typeof this.onResolve === 'function') {
                this.onResolve(this.value);
                this.called = true;
            }
        };
        const reject = this.rejectHandler = (reason) => {
            this.rejected = true;
            this.value = reason;
            if (typeof this.onReject === 'function') {
                this.onReject(this.value);
                this.called = true;
            }
        };
        try {
            executor(resolve, reject);
        }
        catch (error) {
            reject(error);
        }
    }
    cancel() {
        if (this.cancelRunner) {
            if (!this.cancelRunner()) {
                this.rejectHandler('cancelled');
            }
            return true;
        }
        return false;
    }
    then(callback) {
        this.onResolve = callback;
        if (this.fulfilled && !this.called) {
            this.called = true;
            this.onResolve(this.value);
        }
        return this;
    }
    catch(callback) {
        this.onReject = callback;
        if (this.rejected && !this.called) {
            this.called = true;
            this.onReject(this.value);
        }
        return this;
    }
    finally(callback) {
        return this;
    }
    static resolve(val) {
        return new CancelablePromise(function executor(resolve, _reject) {
            resolve(val);
        });
    }
    static reject(reason) {
        return new CancelablePromise(function executor(resolve, reject) {
            reject(reason);
        });
    }
    static all(promises) {
        const fulfilledPromises = [];
        const result = [];
        function executor(resolve, reject) {
            promises.forEach((promise, index) => {
                return promise
                    .then((val) => {
                    fulfilledPromises.push(true);
                    result[index] = val;
                    if (fulfilledPromises.length === promises.length) {
                        return resolve(result);
                    }
                })
                    .catch((error) => { return reject(error); });
            });
        }
        return new CancelablePromise(executor);
    }
}

class CanvasUtils {
    static createOffscreenCanvas(width, height) {
        try {
            return new OffscreenCanvas(width, height);
        }
        catch (err) {
            let canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
    }
}

/**
 * @callback LoadSuccess
 * @param {string} url
 * @param ...other Other properties based on the load task
 */
/**
 * @callback LoadError
 * @param {string} url
 * @param {Error} errorMessage
 */

/**
 * @param {Array} callbacks
 * @param {function} func Function that will receive callback
 */
function runCallbacks(callbacks, func) {
    for (let i = 0; i < callbacks.length; i++) {
        const callback = callbacks[i];
        func(callback);
    }
}

/**
 * Holds the url entry with success/error
 * @param {string} url
 * @param {LoadSuccess} success
 * @param {LoadError} error
 * @param {BaseQueue} queue
 * @constructor
 */
function QueueEntry (url, success, error, queue) {
    // A list of callbacks that will be called. Supports multiple callbacks.
    this.callbacks = {
        success: [
            success
        ],
        error: [
            error
        ]
    };
    /**
     * @type {string}
     */
    this.url = url;
    /**
     * Passes all the arguments to LoadSuccess
     * @type {function}
     */
    this.success = (...args) => {
        runCallbacks(this.callbacks.success, (callback) => {
            callback(url, ...args);
        });
    };
    /**
     * @type {function}
     * @param {Error} errorObject
     */
    this.error = (errorObject) => {
        runCallbacks(this.callbacks.success, (callback) => {
            callback(url, errorObject);
        });
    };

    /**
     * Cancels loading - removes the image
     */
    this.cancel = () => {
        queue.cancel(this);
    };

    /**
     * @type {LoadTask|null}
     */
    this.task = null;
}

class EntryList {
    constructor () {
        /**
         * An list of QueueEntry entries
         */
        this.list = {};
    }

    /**
     * Returns an entry for given key
     * @param {string} url
     * @return {QueueEntry|null}
     */
    get (url) {
        return this.list[url]
    }

    /**
     * Checks if url is in the list
     * @param {string} url
     * @return {boolean}
     */
    has (url) {
        const entry = this.get(url);
        return typeof entry === 'object'
    }

    /**
     * Returns current length of the list
     * @return {Number}
     */
    length () {
        return this.keys().length
    }

    /**
     * Returns the current list keys
     * @return {Array}
     */
    keys () {
        return Object.keys(this.list)
    }

    /**
     * Pulls the first entry from the list
     * @return {QueueEntry|null}
     */
    shift () {
        const keys = this.keys();

        if (keys.length === 0) {
            return null
        }

        return this.pull(keys[0])
    }

    /**
     * Pulls the entry and deletes it from the list
     *
     * @return {QueueEntry|null}
     */
    pull (url) {
        const entry = this.get(url);

        // Delete the entry if valid and return value
        if (typeof entry === 'object') {
            this.remove(url);
            return entry
        }

        // Return null if not found
        return null
    }

    /**
     * Adds an entry to the list
     * @param {QueueEntry} entry
     * @return {EntryList}
     */
    push (entry) {
        this.list[entry.url] = entry;
        return this
    }

    /**
     * Deletes given entry by its url
     * @param {string} url
     * @return {EntryList}
     */
    remove (url) {
        delete this.list[url];
        return this
    }
}

/**
 * Checks if given url has been cancelled
 * @param {EntryList} loadingList
 * @param {string} url
 * @return {boolean}
 */
function isCanceled (loadingList, url) {
    return loadingList.has(url) === false
}

/**
 * Tries to merge success/error callbacks for existing entry
 * in given list. Returns true if merged. Used for multiple callback calls
 * for same entry
 *
 * @param {EntryList} list
 * @param {QueueEntry} entry
 * @return {boolean}
 */
function tryToMergeEntryInList(list, entry) {
    if (list.has(entry.url) === false) {
        return false
    }
    // Get the entry
    const loadingEntry = list.get(entry.url);

    // Pass new callbacks to the entry - will be triggered all requests
    loadingEntry.callbacks.error.push(entry.callbacks.error[0]);
    loadingEntry.callbacks.success.push(entry.callbacks.success[0]);

    // Copy the executing task
    entry.task = loadingEntry.task;
    return true
}

/**
 * @callback TaskLoadSuccess
 * @param ...arguments List of arguments that is required to send
 */
/**
 * @callback TaskLoadError
 * @param {Error} errorMessage
 */
/**
 * Starts loading given entry with cancel support.
 *
 * @class LoadTask
 * @param {QueueEntry} entry
 * @param {TaskLoadSuccess} finish
 * @method cancel Optional cancel
 */
class QueueCore {
    /**
     * @param {LoadTask} LoadTaskClass
     * @param {Number} concurrentJobs
     * @param {Number|null|undefined} startTimeoutTime Defines if the start will use timeout function to throttle calls and give
     * time for start -> cancel (when user scrolls in list and etc). Set null to turn it off.
     */
    constructor (LoadTaskClass, concurrentJobs = 1, startTimeoutTime = undefined) {
        // Public
        this.concurrentJobs = concurrentJobs;
        this.queue = new EntryList();
        this.loading = new EntryList();
        this.LoadTaskClass = LoadTaskClass;
        /**
         * Custom callback when entry was loaded. Passes entry, and args (that are sent to success)
         * @type {function}
         */
        this.onEntrySuccess = null;
        /**
         * Custom callback when entry was loaded wit failure. Passes an entry object and error
         * @type {function}
         */
        this.onEntryError = null;
        /**
         * The start timeout time
         * @type {Number|null}
         */
        this.startTimeoutTime = typeof startTimeoutTime === 'undefined' ? 50 : startTimeoutTime;
        /**
         * Add more time between starting queue - when canceling more items, the start can request multiple
         * items at once - when scrolling, item is added to list and then canceled.
         * @type {number|null}
         */
        this.startTimeout = null;
    }

    /**
     * Adds given entry to queue
     * @param {QueueEntry} entry
     * @return {QueueCore}
     */
    add (entry) {
        // Check if the item is already loaded and append callbacks
        // in load list, if not loading, try to merge already existing
        // queue entry or add it to a queue
        if (tryToMergeEntryInList(this.loading, entry)) {
            return this
        } else if (tryToMergeEntryInList(this.queue, entry) === false) {
            this.queue.push(entry);
        }

        return this
    }

    /**
     * Starts the queue, returns true if the queue could start (when timeout is used) or if it started (timeout not used).
     * Uses setTimeout to prevent multiple calls.
     *
     * @return {boolean}
     */
    start () {
        // Check if the concurrent jobs limit has exceeded
        if (this.loading.length() >= this.concurrentJobs) {
            return false
        }

        // Clear last request for start
        if (this.startTimeout !== null) {
            clearTimeout(this.startTimeout);
        }

        // Timeout is turned off
        if (this.startTimeoutTime === null) {
            return this.forceStart()
        }

        // Start the request
        this.startTimeout = setTimeout(() => {
            let queueEmpty = false;
            // Start enough items for concurrent jobs
            while (queueEmpty === false && this.loading.length() < this.concurrentJobs) {
                // If force start returns false, the queue is empty - stop
                queueEmpty = this.forceStart() === false;
            }
        }, this.startTimeoutTime); // 50ms is enough to handle scroll start -> cancel transitions
    }

    /**
     * Forces start, returns true if entry has started
     *
     * @return {boolean}
     */
    forceStart () {
        // Pull the first entry from the list
        const entry = this.queue.shift();

        // If no item is returned, queue is empty
        if (entry === null) {
            return false
        }

        // Add the entry to load list
        this.loading.push(entry);

        // Get the url
        const url = entry.url;

        // Start loading
        const LoadTaskClass = this.LoadTaskClass;

        // Success callback accepts custom arguments that will be passed
        // to success callback
        entry.task = new LoadTaskClass(entry, (...args) => {
            // Check if the loading was not cancelled
            if (isCanceled(this.loading, url)) {
                return
            }

            // Pass success and pass it to caller
            entry.success(...args);

            // Remove it from loading list
            this.loading.remove(url);

            // Start next item
            this.start();

            // Custom callback on entry success
            if (this.onEntrySuccess !== null) {
                this.onEntrySuccess(entry, args);
            }
        }, (error) => {
            // Check if the loading was not cancelled
            if (isCanceled(this.loading, url)) {
                return
            }

            // Handle the error and pass it to caller
            entry.error(error);

            // Remove it from loading list
            this.loading.remove(url);

            // Start next item
            this.start();

            // Custom callback on entry error
            if (this.onEntryError !== null) {
                this.onEntryError(entry, error);
            }
        });
        return true
    }

    /**
     * Cancels given url and returns boolean if we can start the load
     * queue again
     *
     * @param url
     * @return {boolean}
     */
    cancel (url) {
        this.queue.remove(url);

        // If we are currently loading given image, discard
        // the load progress and start loading next image
        if (this.loading.has(url)) {
            // Get the entry and pull it from the loading list
            const entry = this.loading.pull(url);

            // Cancel the task if task is set and supports it
            if (entry.task !== null && typeof entry.task.cancel === 'function') {
                entry.task.cancel();
            }
            // We should restart queue
            return true
        }

        return false
    }
}

class BaseQueue {
    /**
     * @param LoadTaskClass
     * @param concurrentJobs
     * @param startTimeoutTime Defines if the start will use timeout function to throttle calls and give
     * time for start -> cancel (when user scrolls in list and etc). Set null to turn it off.
     */
    constructor (LoadTaskClass, concurrentJobs = 1, startTimeoutTime = undefined) {
        this.core = new QueueCore(LoadTaskClass, concurrentJobs, startTimeoutTime);
    }

    /**
     * Adds an url to queue
     * @param {string} url
     * @param {LoadSuccess} success
     * @param {LoadError} error
     *
     * @return {QueueEntry}
     */
    add = (url, success, error) => {
        // Build the entry
        const entry = new QueueEntry(url, success, error, this);

        // Add it to queue and start loading if can
        this.core.add(entry).start();
        return entry
    }

    /**
     * Cancels a load request for given queue entry or an image URL
     * @param {QueueEntry|string} entry
     */
    cancel = (entry) => {
        let url = entry;

        // Support cancel via entry
        if (entry instanceof QueueEntry) {
            url = entry.url;
        }

        // Cancel given url and check if we can restart the queue
        if (this.core.cancel(url)) {
            this.core.start();
        }
    }
}

/**
 * Builds the queue for public use
 * @param {LoadTask} LoadTaskClass
 * @param {Number} concurrentJobs
 * @param {Number|null|undefined} startTimeoutTime Defines if the start will use timeout function to throttle calls and give
 * time for start -> cancel (when user scrolls in list and etc). Set null to turn it off.
 *
 * @constructor
 */
function Queue (LoadTaskClass, concurrentJobs = 1, startTimeoutTime = undefined) {
    // Private properties
    const queue = new BaseQueue(LoadTaskClass, concurrentJobs, startTimeoutTime);

    /**
     * Adds an url to queue
     * @param {string} url
     * @param {LoadSuccess} success
     * @param {LoadError} error
     *
     * @return {QueueEntry}
     */
    this.add = queue.add;

    /**
     * Cancels a load request for given queue entry or an image URL
     * @param {QueueEntry|string} entry
     */
    this.cancel = queue.cancel;
}

class LruCache {
    constructor() {
        this.values = new Map();
        this.maxEntries = 20;
    }
    get(key) {
        const hasKey = this.values.has(key);
        let entry;
        if (hasKey) {
            entry = this.values.get(key);
            this.values.delete(key);
            this.values.set(key, entry);
        }
        return entry;
    }
    put(key, value) {
        if (this.values.size >= this.maxEntries) {
            const keyToDelete = this.values.keys().next().value;
            this.values.delete(keyToDelete);
        }
        this.values.set(key, value);
    }
}
class TaskLoader {
    constructor(entry, success, failure) {
        this.abortController = new AbortController();
        this.load(entry, success, failure);
        this.url = entry.url;
    }
    async load(entry, success, failure) {
        try {
            const options = runningFetchOptions[entry.url];
            const fetchOptions = options.fetchOptions;
            fetchOptions.signal = this.abortController.signal;
            const res = await fetch(entry.url, fetchOptions);
            let result;
            switch ((fetchOptions === null || fetchOptions === void 0 ? void 0 : fetchOptions.output) || 'arraybuffer') {
                case 'json':
                    result = await res.json();
                    break;
                case 'blob':
                    result = await res.blob();
                    break;
                case 'text':
                    result = await res.text();
                    break;
                case 'imageBitmap': {
                    const blob = await res.blob();
                    result = await createImageBitmap(blob, options);
                    break;
                }
                default:
                    result = await res.arrayBuffer();
                    break;
            }
            success(result);
            delete runningFetchOptions[entry.url];
        }
        catch (err) {
            failure(err);
            delete runningFetchOptions[entry.url];
        }
    }
    cancel() {
        this.abortController.abort();
    }
}
const runningFetchOptions = {};
const queue = new Queue(TaskLoader, 50);
class FetchLoader {
    constructor(options = {}) {
        this.cache = new LruCache();
        this.options = options;
    }
    async load(url, requestOptions) {
        if (url === undefined) {
            url = '';
        }
        const cached = this.cache.get(url);
        if (cached !== undefined) {
            return cached;
        }
        const options = { ...this.options };
        options.fetchOptions = { ...options.fetchOptions || {}, ...requestOptions || {} };
        runningFetchOptions[url] = options;
        return new Promise((resolve, reject) => {
            queue.add(url, function (resUrl, res) {
                if (res instanceof Error) {
                    reject(res);
                }
                else {
                    resolve(res);
                }
            }, reject);
        }).then((res) => {
            if (res) {
                this.cache.put(url, res);
            }
            return res;
        });
    }
    cancel(url) {
        queue.cancel(url);
    }
}
class ImageBitmapLoader extends FetchLoader {
    constructor(options = {}) {
        super({ premultiplyAlpha: 'none', colorSpaceConversion: 'none', ...options });
        this.options.fetchOptions = this.options.fetchOptions || {};
        if (!this.options.fetchOptions.output) {
            this.options.fetchOptions.output = 'imageBitmap';
        }
    }
}
let bitmapLoaders = {};
function getSharedImageBitmapLoader(options) {
    const key = JSON.stringify(options || {});
    if (!bitmapLoaders[key]) {
        bitmapLoaders[key] = new ImageBitmapLoader(options);
    }
    return bitmapLoaders[key];
}

class MapProvider {
    constructor() {
        this.name = '';
        this.minZoom = 0;
        this.maxZoom = 20;
        this.maxOverZoom = 0;
        this.zoomDelta = 0;
        this.minLevelForZoomDelta = 0;
        this.bounds = [];
        this.center = [];
        this.fetchingTilesPromises = new Map();
    }
    get actualMaxZoom() {
        return this.maxZoom + this.maxOverZoom;
    }
    fetchImage(zoom, x, y) {
        return null;
    }
    getMetaData() { }
    async fetchTileImage(zoom, x, y) {
        const key = `${zoom}_${x}_${y}`;
        const promise = this.fetchingTilesPromises[key] = this.fetchImage(zoom, x, y);
        this.fetchingTilesPromises[key] = promise;
        try {
            return await promise;
        }
        finally {
            delete this.fetchingTilesPromises[key];
        }
    }
    cancelTile(zoom, x, y) {
        const key = `${zoom}_${x}_${y}`;
        const promise = this.fetchingTilesPromises[key];
        if (promise) {
            promise.cancel();
            delete this.fetchingTilesPromises[key];
        }
    }
    async fetchTile(zoom, x, y) {
        return this.fetchTileImage(zoom, x, y);
    }
}

const imageBitmapLoader = getSharedImageBitmapLoader({ imageOrientation: 'flipY', fetchOptions: { credentials: 'same-origin' } });
function zoomTiles(zoomedTiles, zoom) {
    if (zoomedTiles[0][2] === zoom) {
        return zoomedTiles;
    }
    else if (zoomedTiles[0][2] < zoom) {
        var oneIn = [];
        zoomedTiles.forEach(function (tile) {
            oneIn = oneIn.concat(getChildren(tile));
        });
        return zoomTiles(oneIn, zoom);
    }
    else {
        var zoomedTiles = zoomedTiles.map(function (tile) {
            const bbox = tileToBBOX(tile);
            return pointToTile(bbox[0] + (bbox[2] - bbox[0]) / 2, bbox[1] + (bbox[3] - bbox[1]) / 2, zoom);
        });
        return zoomedTiles;
    }
}
function tilesToZoom(tiles, zoom) {
    var newTiles = zoomTiles(tiles, zoom);
    return newTiles;
}
class RasterMapProvider extends MapProvider {
    constructor(address) {
        super();
        this.address = address;
    }
    getImageBitmapLoader() {
        return imageBitmapLoader;
    }
    async fetchTileImage(zoom, x, y) {
        const key = `${zoom}_${x}_${y}`;
        let promise;
        if (this.zoomDelta <= 0 || this.minLevelForZoomDelta > zoom) {
            promise = this.fetchingTilesPromises[key] = this.fetchImage(zoom, x, y);
        }
        else {
            const tiles = tilesToZoom([[x, y, zoom]], zoom + this.zoomDelta).sort((valA, valB) => {
                return valB[1] - valA[1] ||
                    valA[0] - valB[0];
            });
            let promises;
            promise = new CancelablePromise((resolve, reject) => {
                Promise.all(promises = tiles.map((t) => { return this.fetchImage(t[2], t[0], t[1]); })).then((images) => {
                    try {
                        promises = null;
                        images = images.filter((i) => { return Boolean(i); });
                        if (!images || !images.length) {
                            return resolve(null);
                        }
                        const width = images[0].width * Math.floor(this.zoomDelta * 2);
                        const fullWidth = width / Math.sqrt(images.length);
                        const canvas = CanvasUtils.createOffscreenCanvas(width, width);
                        var context = canvas.getContext('2d');
                        let tileY = tiles[0][1];
                        let ix = 0;
                        let iy = 0;
                        let x, y;
                        images.forEach((image, index) => {
                            if (tileY !== tiles[index][1]) {
                                tileY = tiles[index][1];
                                ix = 0;
                                iy += 1;
                            }
                            x = ix * fullWidth;
                            y = iy * fullWidth;
                            context.save();
                            context.drawImage(image, x, y, fullWidth, fullWidth);
                            context.restore();
                            ix += 1;
                        });
                        resolve(createImageBitmap(canvas));
                    }
                    catch (error) {
                        reject(error);
                    }
                }).catch(function (err) {
                    promises = null;
                    reject(err);
                });
            }, function () {
                if (promises) {
                    promises.forEach((item) => { return item.cancel(); });
                    promises = null;
                }
                return true;
            });
        }
        this.fetchingTilesPromises[key] = promise;
        try {
            return await promise;
        }
        finally {
            delete this.fetchingTilesPromises[key];
        }
    }
    fetchImage(zoom, x, y) {
        const url = this.buildURL(zoom, x, y);
        return new CancelablePromise(async (resolve, reject) => {
            try {
                const result = await this.getImageBitmapLoader().load(url);
                resolve(result);
            }
            catch (err) {
                console.log('catched error', err);
                reject(err);
            }
        }, () => {
            this.getImageBitmapLoader().cancel(url);
            return true;
        });
    }
}

class OpenStreetMapsProvider extends RasterMapProvider {
    constructor(address = 'https://a.tile.openstreetmap.org/') {
        super(address);
        this.format = 'png';
    }
    buildURL(zoom, x, y) {
        return this.address + zoom + '/' + x + '/' + y + '.' + this.format;
    }
}

const nodesMap = new Map();
function clearNodeCache() {
    nodesMap.clear();
}
function clearCacheRecursive(item) {
    var _a;
    if (item.childrenCache) {
        item.childrenCache.forEach(clearCacheRecursive);
        item.childrenCache = null;
        item.nodesLoaded = 0;
    }
    if (((_a = item.children) === null || _a === void 0 ? void 0 : _a.length) > 0) {
        item.children.forEach((c) => { return c instanceof MapNode && clearCacheRecursive(c); });
        item.children = [];
    }
    item.dispose();
}
class MapNode extends Mesh {
    constructor(parentNode = null, mapView = null, location = MapNode.root, level = 0, x = 0, y = 0, geometry = null, material = null) {
        super(geometry, material);
        this.mapView = null;
        this.parentNode = null;
        this.textureLoaded = false;
        this.nodesLoaded = 0;
        this.subdivided = false;
        this.childrenCache = null;
        this.mapView = mapView;
        this.parentNode = parentNode;
        this.location = location;
        this.level = level;
        this.x = x;
        this.y = y;
        nodesMap.set(`${level}_${x}_${y}`, this);
        const autoLoad = mapView.nodeShouldAutoLoad();
        this.isMesh = false;
        this.matrixAutoUpdate = false;
        this.isTextureReady = autoLoad;
        this.objectsHolder = new Group();
        this.objectsHolder.visible = !autoLoad;
        this.add(this.objectsHolder);
        if (autoLoad) {
            this.initialize();
        }
    }
    initialize() {
    }
    dispose() {
        this.mapView.provider.cancelTile(this.level, this.x, this.y);
        this.geometry = null;
        this.material = null;
        this.objectsHolder = null;
        this.mapView = null;
        this.parentNode = null;
        nodesMap.delete(`${this.level}_${this.x}_${this.y}`);
    }
    createChildNodes() { }
    subdivide() {
        const mapView = this.mapView;
        const maxZoom = Math.min(mapView.provider.actualMaxZoom, mapView.heightProvider.actualMaxZoom);
        if (this.subdivided || this.level + 1 > maxZoom) {
            return;
        }
        this.subdivided = true;
        if (this.childrenCache !== null) {
            this.childrenCache.forEach((n) => {
                if (n instanceof MapNode) {
                    if (n.textureLoaded) {
                        n.show();
                    }
                    else {
                        n.hide();
                    }
                }
            });
            this.children = this.childrenCache;
            if (this.nodesLoaded >= MapNode.childrens) {
                this.hide();
            }
        }
        else {
            this.createChildNodes();
        }
    }
    simplify(distance, far) {
        var _a, _b, _c, _d;
        if (!this.subdivided) {
            return;
        }
        this.subdivided = false;
        if (this.mapView.lowMemoryUsage || distance > far / 100 || ((_a = this.parentNode) === null || _a === void 0 ? void 0 : _a.subdivided) && ((_c = (_b = this.parentNode) === null || _b === void 0 ? void 0 : _b.parentNode) === null || _c === void 0 ? void 0 : _c.subdivided)) {
            if ((_d = this.children) === null || _d === void 0 ? void 0 : _d.length) {
                this.children.forEach((c) => { return c instanceof MapNode && clearCacheRecursive(c); });
                this.children = [];
            }
            if (this.childrenCache) {
                this.childrenCache.forEach((c) => { return c instanceof MapNode && clearCacheRecursive(c); });
                this.childrenCache = null;
                this.nodesLoaded = 0;
            }
        }
        else {
            this.childrenCache = this.children;
            if (this.childrenCache) {
                this.childrenCache.forEach((c) => {
                    if (c.childrenCache && c.children.length > 1) {
                        c.childrenCache = null;
                        c.nodesLoaded = 0;
                    }
                });
            }
        }
        this.show();
        this.didSimplify();
    }
    didSimplify() {
        this.children = [this.objectsHolder];
    }
    show() {
        this.isMesh = true;
        this.objectsHolder.visible = true;
    }
    isVisible() {
        return this.isMesh;
    }
    hide() {
        this.isMesh = false;
        this.objectsHolder.visible = false;
    }
    onTextureImage(image) {
        if (image) {
            const texture = new Texture(image);
            texture.generateMipmaps = false;
            texture.format = RGBFormat;
            texture.magFilter = LinearFilter;
            texture.minFilter = LinearFilter;
            texture.needsUpdate = true;
            this.material.map = texture;
        }
    }
    setMaterialValues(values) {
        const userData = this.material.userData;
        Object.keys(values).forEach((k) => {
            if (userData.hasOwnProperty(k)) {
                userData[k].value = values[k];
            }
        });
    }
    loadTexture() {
        if (this.isTextureReady) {
            return;
        }
        this.isTextureReady = true;
        return this.mapView.provider.fetchTile(this.level, this.x, this.y).then((image) => { return this.onTextureImage(image); }).catch(() => {
            const canvas = CanvasUtils.createOffscreenCanvas(1, 1);
            const context = canvas.getContext('2d');
            context.fillStyle = '#FF0000';
            context.fillRect(0, 0, 1, 1);
            const texture = new Texture(canvas);
            texture.generateMipmaps = false;
            texture.needsUpdate = true;
            this.material.map = texture;
        }).catch((err) => {
            console.error('error fetching image', err);
        }).finally(() => {
            if (!this.mapView) {
                return;
            }
            this.textureLoaded = true;
            this.nodeReady();
        });
    }
    nodeReady() {
        if (!this.subdivided) {
            this.show();
        }
        const parentNode = this.parentNode;
        if (parentNode !== null) {
            parentNode.nodesLoaded++;
            if (parentNode.nodesLoaded >= MapNode.childrens) {
                parentNode.children.forEach((child, index) => {
                    if (child instanceof MapNode) {
                        if (child.subdivided) {
                            child.hide();
                        }
                        else {
                            child.show();
                        }
                    }
                });
                if (parentNode.subdivided === true) {
                    parentNode.hide();
                }
            }
        }
        else if (!this.subdivided) {
            this.show();
        }
        this.mapView.onNodeReady(this);
    }
    getNeighborsDirection(direction) {
        return null;
    }
    getNeighbors() {
        const neighbors = [];
        return neighbors;
    }
}
MapNode.baseGeometry = null;
MapNode.baseScale = null;
MapNode.childrens = 4;
MapNode.root = -1;
MapNode.topLeft = 0;
MapNode.topRight = 1;
MapNode.bottomLeft = 2;
MapNode.bottomRight = 3;

class MapNodeGeometry extends BufferGeometry {
    constructor(width = 1.0, height = 1.0, widthSegments = 1.0, heightSegments = 1.0, options = { skirt: false, skirtDepth: 10.0, uvs: true }) {
        super();
        const indices = [];
        const vertices = [];
        const uvs = options.uvs ? [] : undefined;
        MapNodeGeometry.buildPlane(width, height, widthSegments, heightSegments, indices, vertices, uvs);
        if (options.skirt) {
            MapNodeGeometry.buildSkirt(width, height, widthSegments, heightSegments, options.skirtDepth, indices, vertices, uvs);
        }
        this.setIndex(indices);
        this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        if (options.uvs) {
            this.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        }
    }
    static buildPlane(width = 1.0, height = 1.0, widthSegments = 1.0, heightSegments = 1.0, indices, vertices, uvs) {
        const widthHalf = width / 2;
        const heightHalf = height / 2;
        const gridX = widthSegments + 1;
        const gridZ = heightSegments + 1;
        const segmentWidth = width / widthSegments;
        const segmentHeight = height / heightSegments;
        for (let iz = 0; iz < gridZ; iz++) {
            const z = iz * segmentHeight - heightHalf;
            for (let ix = 0; ix < gridX; ix++) {
                const x = ix * segmentWidth - widthHalf;
                vertices.push(x, 0, z);
                if (uvs) {
                    uvs.push(ix / widthSegments, 1 - iz / heightSegments);
                }
            }
        }
        for (let iz = 0; iz < heightSegments; iz++) {
            for (let ix = 0; ix < widthSegments; ix++) {
                const a = ix + gridX * iz;
                const b = ix + gridX * (iz + 1);
                const c = ix + 1 + gridX * (iz + 1);
                const d = ix + 1 + gridX * iz;
                indices.push(a, b, d, b, c, d);
            }
        }
    }
    static buildSkirt(width = 1.0, height = 1.0, widthSegments = 1.0, heightSegments = 1.0, skirtDepth, indices, vertices, uvs) {
        const widthHalf = width / 2;
        const heightHalf = height / 2;
        const gridX = widthSegments + 1;
        const gridZ = heightSegments + 1;
        const segmentWidth = width / widthSegments;
        const segmentHeight = height / heightSegments;
        let start = vertices.length / 3;
        for (let ix = 0; ix < gridX; ix++) {
            const x = ix * segmentWidth - widthHalf;
            const z = -heightHalf;
            vertices.push(x, -skirtDepth, z);
            if (uvs) {
                uvs.push(ix / widthSegments, 1);
            }
        }
        for (let ix = 0; ix < widthSegments; ix++) {
            const a = ix;
            const d = ix + 1;
            const b = ix + start;
            const c = ix + start + 1;
            indices.push(d, b, a, d, c, b);
        }
        start = vertices.length / 3;
        for (let ix = 0; ix < gridX; ix++) {
            const x = ix * segmentWidth - widthHalf;
            const z = heightSegments * segmentHeight - heightHalf;
            vertices.push(x, -skirtDepth, z);
            if (uvs) {
                uvs.push(ix / widthSegments, 0);
            }
        }
        let offset = gridX * gridZ - widthSegments - 1;
        for (let ix = 0; ix < widthSegments; ix++) {
            const a = offset + ix;
            const d = offset + ix + 1;
            const b = ix + start;
            const c = ix + start + 1;
            indices.push(a, b, d, b, c, d);
        }
        start = vertices.length / 3;
        for (let iz = 0; iz < gridZ; iz++) {
            const z = iz * segmentHeight - heightHalf;
            const x = -widthHalf;
            vertices.push(x, -skirtDepth, z);
            if (uvs) {
                uvs.push(0, 1 - iz / heightSegments);
            }
        }
        for (let iz = 0; iz < heightSegments; iz++) {
            const a = iz * gridZ;
            const d = (iz + 1) * gridZ;
            const b = iz + start;
            const c = iz + start + 1;
            indices.push(a, b, d, b, c, d);
        }
        start = vertices.length / 3;
        for (let iz = 0; iz < gridZ; iz++) {
            const z = iz * segmentHeight - heightHalf;
            const x = widthSegments * segmentWidth - widthHalf;
            vertices.push(x, -skirtDepth, z);
            if (uvs) {
                uvs.push(1.0, 1 - iz / heightSegments);
            }
        }
        for (let iz = 0; iz < heightSegments; iz++) {
            const a = iz * gridZ + heightSegments;
            const d = (iz + 1) * gridZ + heightSegments;
            const b = iz + start;
            const c = iz + start + 1;
            indices.push(d, b, a, d, c, b);
        }
    }
}

class UnitsUtils {
    static get(onResult, onError) {
        navigator.geolocation.getCurrentPosition(function (result) {
            onResult(result.coords, result.timestamp);
        }, onError);
    }
    static datumsToSpherical(latitude, longitude, output, scale = 1) {
        const x = longitude * UnitsUtils.EARTH_ORIGIN / 180.0;
        let y = Math.log(Math.tan((90 + latitude) * Math.PI / 360.0)) / (Math.PI / 180.0);
        y = y * UnitsUtils.EARTH_ORIGIN / 180.0;
        if (output) {
            return output.set(x * scale, y * scale);
        }
        return new Vector2(x * scale, y * scale);
    }
    static sphericalToDatums(x, y) {
        const longitude = x / UnitsUtils.EARTH_ORIGIN * 180.0;
        let latitude = y / UnitsUtils.EARTH_ORIGIN * 180.0;
        latitude = 180.0 / Math.PI * (2 * Math.atan(Math.exp(latitude * Math.PI / 180.0)) - Math.PI / 2.0);
        return { lat: Math.round(latitude * 10000) / 10000, lon: Math.round(longitude * 10000) / 10000 };
    }
    static quadtreeToDatums(zoom, x, y) {
        const n = Math.pow(2.0, zoom);
        const longitude = x / n * 360.0 - 180.0;
        const latitudeRad = Math.atan(Math.sinh(Math.PI * (1.0 - 2.0 * y / n)));
        const latitude = 180.0 * (latitudeRad / Math.PI);
        return { lat: latitude, lon: longitude };
    }
}
UnitsUtils.EARTH_RADIUS = 6378137;
UnitsUtils.EARTH_PERIMETER = 2 * Math.PI * UnitsUtils.EARTH_RADIUS;
UnitsUtils.EARTH_ORIGIN = UnitsUtils.EARTH_PERIMETER / 2.0;

class MapPlaneNode extends MapNode {
    constructor(parentNode = null, mapView = null, location = MapNode.root, level = 0, x = 0, y = 0) {
        super(parentNode, mapView, location, level, x, y, MapPlaneNode.geometry, new MeshBasicMaterial({ wireframe: false }));
        this.matrixAutoUpdate = false;
    }
    initialize() {
        return this.loadTexture();
    }
    createChildNodes() {
        const level = this.level + 1;
        const x = this.x * 2;
        const y = this.y * 2;
        const Constructor = Object.getPrototypeOf(this).constructor;
        let node = new Constructor(this, this.mapView, MapNode.topLeft, level, x, y);
        node.scale.set(0.5, 1.0, 0.5);
        node.position.set(-0.25, 0, -0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new Constructor(this, this.mapView, MapNode.topRight, level, x + 1, y);
        node.scale.set(0.5, 1.0, 0.5);
        node.position.set(0.25, 0, -0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new Constructor(this, this.mapView, MapNode.bottomLeft, level, x, y + 1);
        node.scale.set(0.5, 1.0, 0.5);
        node.position.set(-0.25, 0, 0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new Constructor(this, this.mapView, MapNode.bottomRight, level, x + 1, y + 1);
        node.scale.set(0.5, 1.0, 0.5);
        node.position.set(0.25, 0, 0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
    }
    raycast(raycaster, intersects) {
        if (this.isVisible()) {
            return super.raycast(raycaster, intersects);
        }
        return false;
    }
}
MapPlaneNode.geometry = new MapNodeGeometry(1, 1, 1, 1, { skirt: false });
MapPlaneNode.baseGeometry = MapPlaneNode.geometry;
MapPlaneNode.baseScale = new Vector3(UnitsUtils.EARTH_PERIMETER, 1.0, UnitsUtils.EARTH_PERIMETER);

class MapNodeHeightGeometry extends BufferGeometry {
    constructor(width = 1.0, height = 1.0, widthSegments = 1.0, heightSegments = 1.0, skirt = false, skirtDepth = 10.0, imageData = null, calculateNormals = true) {
        super();
        const indices = [];
        const vertices = [];
        const normals = [];
        const uvs = [];
        MapNodeGeometry.buildPlane(width, height, widthSegments, heightSegments, indices, vertices, uvs);
        const data = imageData.data;
        for (let i = 0, j = 0; i < data.length && j < vertices.length; i += 4, j += 3) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const value = (r * 65536 + g * 256 + b) * 0.1 - 1e4;
            vertices[j + 1] = value;
        }
        if (skirt) {
            MapNodeGeometry.buildSkirt(width, height, widthSegments, heightSegments, skirtDepth, indices, vertices, uvs);
        }
        this.setIndex(indices);
        this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        this.setAttribute('normal', new Float32BufferAttribute(normals, 3));
        this.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        if (calculateNormals) {
            this.computeNormals(widthSegments, heightSegments);
        }
    }
    computeNormals(widthSegments, heightSegments) {
        const positionAttribute = this.getAttribute('position');
        if (positionAttribute !== undefined) {
            let normalAttribute = this.getAttribute('normal');
            const normalLength = heightSegments * widthSegments;
            for (let i = 0; i < normalLength; i++) {
                normalAttribute.setXYZ(i, 0, 0, 0);
            }
            const pA = new Vector3(), pB = new Vector3(), pC = new Vector3();
            const nA = new Vector3(), nB = new Vector3(), nC = new Vector3();
            const cb = new Vector3(), ab = new Vector3();
            const indexLength = heightSegments * widthSegments * 6;
            for (let i = 0; i < indexLength; i += 3) {
                const vA = this.index.getX(i + 0);
                const vB = this.index.getX(i + 1);
                const vC = this.index.getX(i + 2);
                pA.fromBufferAttribute(positionAttribute, vA);
                pB.fromBufferAttribute(positionAttribute, vB);
                pC.fromBufferAttribute(positionAttribute, vC);
                cb.subVectors(pC, pB);
                ab.subVectors(pA, pB);
                cb.cross(ab);
                nA.fromBufferAttribute(normalAttribute, vA);
                nB.fromBufferAttribute(normalAttribute, vB);
                nC.fromBufferAttribute(normalAttribute, vC);
                nA.add(cb);
                nB.add(cb);
                nC.add(cb);
                normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
                normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
                normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
            }
            this.normalizeNormals();
            normalAttribute.needsUpdate = true;
        }
    }
}

class MapHeightNode extends MapNode {
    constructor(parentNode = null, mapView = null, location = MapNode.root, level = 0, x = 0, y = 0, geometry = MapHeightNode.geometry, material = new MeshPhongMaterial({ color: 0x000000, emissive: 0xffffff })) {
        super(parentNode, mapView, location, level, x, y, geometry, material);
        this.heightLoaded = false;
        this.heightListeners = [];
        this.matrixAutoUpdate = false;
        const autoLoad = mapView.nodeShouldAutoLoad();
        this.isHeightReady = autoLoad;
    }
    initialize() {
        super.initialize();
        return Promise.all([this.loadTexture(), this.loadHeightGeometry()]);
    }
    dispose() {
        this.mapView.heightProvider.cancelTile(this.level, this.x, this.y);
        super.dispose();
    }
    onTextureImage(image) {
        if (image) {
            const texture = new Texture(image);
            texture.generateMipmaps = false;
            texture.format = RGBFormat;
            texture.magFilter = LinearFilter;
            texture.minFilter = LinearFilter;
            texture.needsUpdate = true;
            this.material.map = texture;
        }
    }
    loadTexture() {
        if (this.isTextureReady) {
            return;
        }
        this.isTextureReady = true;
        return this.mapView.provider.fetchTile(this.level, this.x, this.y).then((image) => { return this.onTextureImage(image); }).finally(() => {
            this.textureLoaded = true;
            this.nodeReady();
        });
    }
    nodeReady() {
        if (!this.mapView || !this.heightLoaded || !this.textureLoaded) {
            return;
        }
        super.nodeReady();
    }
    createChildNodes() {
        const level = this.level + 1;
        var prototype = Object.getPrototypeOf(this);
        const x = this.x * 2;
        const y = this.y * 2;
        let node = new prototype.constructor(this, this.mapView, MapNode.topLeft, level, x, y);
        node.scale.set(0.5, 1, 0.5);
        node.position.set(-0.25, 0, -0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new prototype.constructor(this, this.mapView, MapNode.topRight, level, x + 1, y);
        node.scale.set(0.5, 1, 0.5);
        node.position.set(0.25, 0, -0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new prototype.constructor(this, this.mapView, MapNode.bottomLeft, level, x, y + 1);
        node.scale.set(0.5, 1, 0.5);
        node.position.set(-0.25, 0, 0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new prototype.constructor(this, this.mapView, MapNode.bottomRight, level, x + 1, y + 1);
        node.scale.set(0.5, 1, 0.5);
        node.position.set(0.25, 0, 0.25);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
    }
    async handleParentOverZoomTile(resolve) {
        throw new Error('not implemented');
    }
    async loadHeightGeometry() {
        if (this.isHeightReady || !this.mapView) {
            return;
        }
        this.isHeightReady = true;
        const heightProvider = this.mapView.heightProvider;
        if (heightProvider === null) {
            throw new Error('GeoThree: MapView.heightProvider provider is null.');
        }
        try {
            const zoom = this.level;
            if (zoom > heightProvider.maxZoom && zoom <= heightProvider.maxZoom + heightProvider['maxOverZoom']) {
                const parent = this.parentNode;
                if (parent.heightLoaded) {
                    await this.handleParentOverZoomTile();
                }
                else {
                    const promise = new Promise((resolve) => {
                        parent.heightListeners.push(() => { return this.handleParentOverZoomTile(resolve); });
                    });
                    if (!parent.isHeightReady) {
                        parent.loadHeightGeometry();
                    }
                    await promise;
                }
            }
            else {
                const image = await this.mapView.heightProvider.fetchTile(zoom, this.x, this.y);
                await this.onHeightImage(image);
            }
        }
        finally {
            if (this.mapView) {
                this.heightLoaded = true;
                this.heightListeners.forEach((l) => { return l(); });
                this.nodeReady();
            }
            this.heightListeners = [];
        }
    }
    onHeightImage(image) {
        const canvas = CanvasUtils.createOffscreenCanvas(MapHeightNode.geometrySize + 1, MapHeightNode.geometrySize + 1);
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, MapHeightNode.tileSize, MapHeightNode.tileSize, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const geometry = new MapNodeHeightGeometry(1, 1, MapHeightNode.geometrySize, MapHeightNode.geometrySize, true, 10.0, imageData, true);
        this.geometry = geometry;
    }
    raycast(raycaster, intersects) {
        if (this.isVisible()) {
            return super.raycast(raycaster, intersects);
        }
        return false;
    }
}
MapHeightNode.tileSize = 256;
MapHeightNode.geometrySize = 16;
MapHeightNode.geometry = new MapNodeGeometry(1, 1, MapHeightNode.geometrySize, MapHeightNode.geometrySize);
MapHeightNode.baseGeometry = MapPlaneNode.geometry;
MapHeightNode.BASE_SCALE = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

class MapSphereNodeGeometry extends BufferGeometry {
    constructor(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength) {
        super();
        const thetaEnd = thetaStart + thetaLength;
        let index = 0;
        const grid = [];
        const vertex = new Vector3();
        const normal = new Vector3();
        const indices = [];
        const vertices = [];
        const normals = [];
        const uvs = [];
        for (let iy = 0; iy <= heightSegments; iy++) {
            const verticesRow = [];
            const v = iy / heightSegments;
            for (let ix = 0; ix <= widthSegments; ix++) {
                const u = ix / widthSegments;
                vertex.x = -radius * Math.cos(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
                vertex.y = radius * Math.cos(thetaStart + v * thetaLength);
                vertex.z = radius * Math.sin(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
                vertices.push(vertex.x, vertex.y, vertex.z);
                normal.set(vertex.x, vertex.y, vertex.z).normalize();
                normals.push(normal.x, normal.y, normal.z);
                uvs.push(u, 1 - v);
                verticesRow.push(index++);
            }
            grid.push(verticesRow);
        }
        for (let iy = 0; iy < heightSegments; iy++) {
            for (let ix = 0; ix < widthSegments; ix++) {
                const a = grid[iy][ix + 1];
                const b = grid[iy][ix];
                const c = grid[iy + 1][ix];
                const d = grid[iy + 1][ix + 1];
                if (iy !== 0 || thetaStart > 0) {
                    indices.push(a, b, d);
                }
                if (iy !== heightSegments - 1 || thetaEnd < Math.PI) {
                    indices.push(b, c, d);
                }
            }
        }
        this.setIndex(indices);
        this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        this.setAttribute('normal', new Float32BufferAttribute(normals, 3));
        this.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    }
}

class MapSphereNode extends MapNode {
    constructor(parentNode = null, mapView = null, location = MapNode.root, level = 0, x = 0, y = 0) {
        super(parentNode, mapView, location, level, x, y, MapSphereNode.createGeometry(level, x, y), new MeshBasicMaterial({ wireframe: false }));
        this.applyScaleNode();
        this.matrixAutoUpdate = false;
    }
    initialize() {
        return this.loadTexture();
    }
    static createGeometry(zoom, x, y) {
        const range = Math.pow(2, zoom);
        const max = 40;
        const segments = Math.floor(MapSphereNode.segments * (max / (zoom + 1)) / max);
        const phiLength = 1 / range * 2 * Math.PI;
        const phiStart = x * phiLength;
        const thetaLength = 1 / range * Math.PI;
        const thetaStart = y * thetaLength;
        return new MapSphereNodeGeometry(1, segments, segments, phiStart, phiLength, thetaStart, thetaLength);
    }
    applyScaleNode() {
        this.geometry.computeBoundingBox();
        const box = this.geometry.boundingBox.clone();
        const center = box.getCenter(new Vector3());
        const matrix = new Matrix4();
        matrix.compose(new Vector3(-center.x, -center.y, -center.z), new Quaternion(), new Vector3(UnitsUtils.EARTH_RADIUS, UnitsUtils.EARTH_RADIUS, UnitsUtils.EARTH_RADIUS));
        this.geometry.applyMatrix4(matrix);
        this.position.copy(center);
        this.updateMatrix();
        this.updateMatrixWorld();
    }
    updateMatrix() {
        this.matrix.setPosition(this.position);
        this.matrixWorldNeedsUpdate = true;
    }
    updateMatrixWorld(force = false) {
        if (this.matrixWorldNeedsUpdate || force) {
            this.matrixWorld.copy(this.matrix);
            this.matrixWorldNeedsUpdate = false;
        }
    }
    createChildNodes() {
        const level = this.level + 1;
        const x = this.x * 2;
        const y = this.y * 2;
        const Constructor = Object.getPrototypeOf(this).constructor;
        let node = new Constructor(this, this.mapView, MapNode.topLeft, level, x, y);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new Constructor(this, this.mapView, MapNode.topRight, level, x + 1, y);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new Constructor(this, this.mapView, MapNode.bottomLeft, level, x, y + 1);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
        node = new Constructor(this, this.mapView, MapNode.bottomRight, level, x + 1, y + 1);
        this.add(node);
        node.updateMatrix();
        node.updateMatrixWorld(true);
    }
    raycast(raycaster, intersects) {
        if (this.isVisible()) {
            return super.raycast(raycaster, intersects);
        }
        return false;
    }
}
MapSphereNode.baseGeometry = new MapSphereNodeGeometry(UnitsUtils.EARTH_RADIUS, 64, 64, 0, 2 * Math.PI, 0, Math.PI);
MapSphereNode.baseScale = new Vector3(1, 1, 1);
MapSphereNode.segments = 80;

class MapHeightNodeShader extends MapHeightNode {
    constructor(parentNode = null, mapView = null, location = MapNode.root, level = 0, x = 0, y = 0) {
        super(parentNode, mapView, location, level, x, y, MapHeightNodeShader.geometry, MapHeightNodeShader.prepareMaterial(new MeshPhongMaterial({ map: MapHeightNodeShader.EMPTY_TEXTURE })));
        this.heightMapLocation = [0, 0, 1, 1];
        this.overZoomFactor = 1;
        this.frustumCulled = false;
    }
    static prepareMaterial(material) {
        material.userData = {
            heightMap: { value: MapHeightNodeShader.EMPTY_TEXTURE },
            elevationDecoder: { value: MapHeightNodeShader.ELEVATION_DECODER },
            heightMapLocation: { value: new Vector4() }
        };
        material.onBeforeCompile = (shader) => {
            for (const i in material.userData) {
                shader.uniforms[i] = material.userData[i];
            }
            shader.vertexShader =
                `
			uniform sampler2D heightMap;
			uniform vec4 heightMapLocation;
			uniform vec4 elevationDecoder;
			float getPixelElevation(vec4 e) {
				// Convert encoded elevation value to meters
				return ((e.r * elevationDecoder.x + e.g * elevationDecoder.y  + e.b * elevationDecoder.z) + elevationDecoder.w) * exageration;
			}
			float getElevation(vec2 coord) {
				vec4 e = texture2D(heightMap, coord * heightMapLocation.zw + heightMapLocation.xy);
				return getPixelElevation(e);
			}
			` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', `
			#include <fog_vertex>
	
			// Calculate height of the title
			float _height = getElevation(vUv);
			vec3 _transformed = position + _height * normal;
	
			// Vertex position based on height
			gl_Position = projectionMatrix * modelViewMatrix * vec4(_transformed, 1.0);
			`);
        };
        return material;
    }
    onHeightImage(image) {
        if (image) {
            const texture = new Texture(image);
            texture.generateMipmaps = false;
            texture.format = RGBFormat;
            texture.magFilter = NearestFilter;
            texture.minFilter = NearestFilter;
            texture.needsUpdate = true;
            this.material.userData.heightMap.value = texture;
        }
    }
    async handleParentOverZoomTile(resolve) {
        const tileBox = tileToBBOX([this.x, this.y, this.level]);
        const parent = this.parent;
        const parentOverZoomFactor = parent.overZoomFactor;
        const parentTileBox = tileToBBOX([parent.x, parent.y, parent.level]);
        const width = parentTileBox[2] - parentTileBox[0];
        const height = parentTileBox[3] - parentTileBox[1];
        this.overZoomFactor = parentOverZoomFactor * 2;
        this.heightMapLocation[0] = parent.heightMapLocation[0] + Math.floor((tileBox[0] - parentTileBox[0]) / width * 10) / 10 / parentOverZoomFactor;
        this.heightMapLocation[1] = parent.heightMapLocation[1] + Math.floor((tileBox[1] - parentTileBox[1]) / height * 10) / 10 / parentOverZoomFactor;
        this.heightMapLocation[2] = this.heightMapLocation[3] = 1 / this.overZoomFactor;
        this.material.userData.heightMapLocation.value.set(...this.heightMapLocation);
        await this.onHeightImage(parent.material.userData.heightMap.value);
        if (resolve) {
            resolve();
        }
    }
    raycast(raycaster, intersects) {
        if (this.isVisible()) {
            this.geometry = MapPlaneNode.geometry;
            const result = super.raycast(raycaster, intersects);
            this.geometry = MapHeightNodeShader.geometry;
            return result;
        }
        return false;
    }
}
MapHeightNodeShader.ELEVATION_DECODER = [6553.6 * 255, 25.6 * 255, 0.1 * 255, -10000];
MapHeightNodeShader.EMPTY_TEXTURE = new Texture();
MapHeightNodeShader.geometrySize = 256;
MapHeightNodeShader.geometry = new MapNodeGeometry(1, 1, MapHeightNode.geometrySize, MapHeightNode.geometrySize);
MapHeightNodeShader.baseGeometry = MapPlaneNode.geometry;
MapHeightNodeShader.baseScale = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

class LODRaycast {
    constructor() {
        this.subdivisionRays = 1;
        this.thresholdUp = 0.6;
        this.thresholdDown = 0.15;
        this.raycaster = new Raycaster();
        this.mouse = new Vector2();
        this.powerDistance = false;
        this.scaleDistance = true;
    }
    updateLOD(view, camera, renderer, scene) {
        const intersects = [];
        for (let t = 0; t < this.subdivisionRays; t++) {
            this.mouse.set(Math.random() * 2 - 1, Math.random() * 2 - 1);
            this.raycaster.setFromCamera(this.mouse, camera);
            this.raycaster.intersectObjects(view.children, true, intersects);
        }
        for (let i = 0; i < intersects.length; i++) {
            const node = intersects[i].object;
            let distance = intersects[i].distance;
            if (this.powerDistance) {
                distance = Math.pow(distance * 2, node.level);
            }
            if (this.scaleDistance) {
                const matrix = node.matrixWorld.elements;
                const vector = new Vector3(matrix[0], matrix[1], matrix[2]);
                distance = vector.length() / distance;
            }
            if (distance > this.thresholdUp) {
                node.subdivide();
                return;
            }
            else if (distance < this.thresholdDown) {
                if (node.parentNode !== null) {
                    node.parentNode.simplify();
                    return;
                }
            }
        }
    }
}

class Martini {
    constructor(gridSize = 257) {
        this.gridSize = gridSize;
        const tileSize = gridSize - 1;
        if (tileSize & tileSize - 1) {
            throw new Error(`Expected grid size to be 2^n+1, got ${gridSize}.`);
        }
        this.numTriangles = tileSize * tileSize * 2 - 2;
        this.numParentTriangles = this.numTriangles - tileSize * tileSize;
        this.indices = new Uint32Array(this.gridSize * this.gridSize);
        this.coords = new Uint16Array(this.numTriangles * 4);
        for (let i = 0; i < this.numTriangles; i++) {
            let id = i + 2;
            let ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
            if (id & 1) {
                bx = by = cx = tileSize;
            }
            else {
                ax = ay = cy = tileSize;
            }
            while ((id >>= 1) > 1) {
                const mx = ax + bx >> 1;
                const my = ay + by >> 1;
                if (id & 1) {
                    bx = ax;
                    by = ay;
                    ax = cx;
                    ay = cy;
                }
                else {
                    ax = bx;
                    ay = by;
                    bx = cx;
                    by = cy;
                }
                cx = mx;
                cy = my;
            }
            const k = i * 4;
            this.coords[k + 0] = ax;
            this.coords[k + 1] = ay;
            this.coords[k + 2] = bx;
            this.coords[k + 3] = by;
        }
    }
    createTile(terrain) {
        return new Tile(terrain, this);
    }
}
class Tile {
    constructor(terrain, martini) {
        const size = martini.gridSize;
        if (terrain.length !== size * size) {
            throw new Error(`Expected terrain data of length ${size * size} (${size} x ${size}), got ${terrain.length}.`);
        }
        this.terrain = terrain;
        this.martini = martini;
        this.errors = new Float32Array(terrain.length);
        this.update();
    }
    update() {
        const { numTriangles, numParentTriangles, coords, gridSize: size } = this.martini;
        const { terrain, errors } = this;
        for (let i = numTriangles - 1; i >= 0; i--) {
            const k = i * 4;
            const ax = coords[k + 0];
            const ay = coords[k + 1];
            const bx = coords[k + 2];
            const by = coords[k + 3];
            const mx = ax + bx >> 1;
            const my = ay + by >> 1;
            const cx = mx + my - ay;
            const cy = my + ax - mx;
            const interpolatedHeight = (terrain[ay * size + ax] + terrain[by * size + bx]) / 2;
            const middleIndex = my * size + mx;
            const middleError = Math.abs(interpolatedHeight - terrain[middleIndex]);
            errors[middleIndex] = Math.max(errors[middleIndex], middleError);
            if (i < numParentTriangles) {
                const leftChildIndex = (ay + cy >> 1) * size + (ax + cx >> 1);
                const rightChildIndex = (by + cy >> 1) * size + (bx + cx >> 1);
                errors[middleIndex] = Math.max(errors[middleIndex], errors[leftChildIndex], errors[rightChildIndex]);
            }
        }
    }
    getMesh(maxError = 0, withSkirts = false) {
        const { gridSize: size, indices } = this.martini;
        const { errors } = this;
        let numVertices = 0;
        let numTriangles = 0;
        const max = size - 1;
        let aIndex, bIndex, cIndex = 0;
        const leftSkirtIndices = [];
        const rightSkirtIndices = [];
        const bottomSkirtIndices = [];
        const topSkirtIndices = [];
        indices.fill(0);
        function countElements(ax, ay, bx, by, cx, cy) {
            const mx = ax + bx >> 1;
            const my = ay + by >> 1;
            if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
                countElements(cx, cy, ax, ay, mx, my);
                countElements(bx, by, cx, cy, mx, my);
            }
            else {
                aIndex = ay * size + ax;
                bIndex = by * size + bx;
                cIndex = cy * size + cx;
                if (indices[aIndex] === 0) {
                    if (withSkirts) {
                        if (ax === 0) {
                            leftSkirtIndices.push(numVertices);
                        }
                        else if (ax === max) {
                            rightSkirtIndices.push(numVertices);
                        }
                        if (ay === 0) {
                            bottomSkirtIndices.push(numVertices);
                        }
                        else if (ay === max) {
                            topSkirtIndices.push(numVertices);
                        }
                    }
                    indices[aIndex] = ++numVertices;
                }
                if (indices[bIndex] === 0) {
                    if (withSkirts) {
                        if (bx === 0) {
                            leftSkirtIndices.push(numVertices);
                        }
                        else if (bx === max) {
                            rightSkirtIndices.push(numVertices);
                        }
                        if (by === 0) {
                            bottomSkirtIndices.push(numVertices);
                        }
                        else if (by === max) {
                            topSkirtIndices.push(numVertices);
                        }
                    }
                    indices[bIndex] = ++numVertices;
                }
                if (indices[cIndex] === 0) {
                    if (withSkirts) {
                        if (cx === 0) {
                            leftSkirtIndices.push(numVertices);
                        }
                        else if (cx === max) {
                            rightSkirtIndices.push(numVertices);
                        }
                        if (cy === 0) {
                            bottomSkirtIndices.push(numVertices);
                        }
                        else if (cy === max) {
                            topSkirtIndices.push(numVertices);
                        }
                    }
                    indices[cIndex] = ++numVertices;
                }
                numTriangles++;
            }
        }
        countElements(0, 0, max, max, max, 0);
        countElements(max, max, 0, 0, 0, max);
        let numTotalVertices = numVertices * 2;
        let numTotalTriangles = numTriangles * 3;
        if (withSkirts) {
            numTotalVertices += (leftSkirtIndices.length + rightSkirtIndices.length + bottomSkirtIndices.length + topSkirtIndices.length) * 2;
            numTotalTriangles += ((leftSkirtIndices.length - 1) * 2 + (rightSkirtIndices.length - 1) * 2 + (bottomSkirtIndices.length - 1) * 2 + (topSkirtIndices.length - 1) * 2) * 3;
        }
        const vertices = new Uint16Array(numTotalVertices);
        const triangles = new Uint32Array(numTotalTriangles);
        let triIndex = 0;
        function processTriangle(ax, ay, bx, by, cx, cy) {
            const mx = ax + bx >> 1;
            const my = ay + by >> 1;
            if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
                processTriangle(cx, cy, ax, ay, mx, my);
                processTriangle(bx, by, cx, cy, mx, my);
            }
            else {
                const a = indices[ay * size + ax] - 1;
                const b = indices[by * size + bx] - 1;
                const c = indices[cy * size + cx] - 1;
                vertices[2 * a] = ax;
                vertices[2 * a + 1] = ay;
                vertices[2 * b] = bx;
                vertices[2 * b + 1] = by;
                vertices[2 * c] = cx;
                vertices[2 * c + 1] = cy;
                triangles[triIndex++] = a;
                triangles[triIndex++] = b;
                triangles[triIndex++] = c;
            }
        }
        processTriangle(0, 0, max, max, max, 0);
        processTriangle(max, max, 0, 0, 0, max);
        if (withSkirts) {
            leftSkirtIndices.sort((a, b) => { return vertices[2 * a + 1] - vertices[2 * b + 1]; });
            rightSkirtIndices.sort((a, b) => { return vertices[2 * b + 1] - vertices[2 * a + 1]; });
            bottomSkirtIndices.sort((a, b) => { return vertices[2 * b] - vertices[2 * a]; });
            topSkirtIndices.sort((a, b) => { return vertices[2 * a] - vertices[2 * b]; });
            let skirtIndex = numVertices * 2;
            function constructSkirt(skirt) {
                const skirtLength = skirt.length;
                for (let i = 0; i < skirtLength - 1; i++) {
                    const currIndex = skirt[i];
                    const nextIndex = skirt[i + 1];
                    const currentSkirt = skirtIndex / 2;
                    const nextSkirt = (skirtIndex + 2) / 2;
                    vertices[skirtIndex++] = vertices[2 * currIndex];
                    vertices[skirtIndex++] = vertices[2 * currIndex + 1];
                    triangles[triIndex++] = currIndex;
                    triangles[triIndex++] = currentSkirt;
                    triangles[triIndex++] = nextIndex;
                    triangles[triIndex++] = currentSkirt;
                    triangles[triIndex++] = nextSkirt;
                    triangles[triIndex++] = nextIndex;
                }
                vertices[skirtIndex++] = vertices[2 * skirt[skirtLength - 1]];
                vertices[skirtIndex++] = vertices[2 * skirt[skirtLength - 1] + 1];
            }
            constructSkirt(leftSkirtIndices);
            constructSkirt(rightSkirtIndices);
            constructSkirt(bottomSkirtIndices);
            constructSkirt(topSkirtIndices);
        }
        return { vertices: vertices, triangles: triangles, numVerticesWithoutSkirts: numVertices };
    }
}

class MapMartiniHeightNode extends MapHeightNode {
    constructor(parentNode = null, mapView = null, location = MapNode.root, level = 0, x = 0, y = 0, { elevationDecoder = [256 * 255, 255, 1 / 256 * 255, -32768], meshMaxError = 50, exageration = 1 } = {}) {
        super(parentNode, mapView, location, level, x, y, MapMartiniHeightNode.geometry, MapMartiniHeightNode.prepareMaterial(new MeshPhongMaterial({
            map: MapMartiniHeightNode.emptyTexture,
            color: 0xFFFFFF,
            side: DoubleSide
        }), level, exageration));
        this.elevationDecoder = [256 * 255, 255, 1 / 256 * 255, -32768];
        this.exageration = 1.0;
        this.meshMaxError = 10;
        this.meshMaxError = parentNode ? parentNode.meshMaxError : meshMaxError;
        this.exageration = parentNode ? parentNode.exageration : exageration;
        this.elevationDecoder = parentNode ? parentNode.elevationDecoder : elevationDecoder;
        this.frustumCulled = false;
    }
    static prepareMaterial(material, level, exageration = 1.0) {
        material.userData = {
            heightMap: { value: MapMartiniHeightNode.emptyTexture },
            drawNormals: { value: 0 },
            drawBlack: { value: 0 },
            zoomlevel: { value: level },
            computeNormals: { value: 1 },
            drawTexture: { value: 1 }
        };
        material.onBeforeCompile = (shader) => {
            for (let i in material.userData) {
                shader.uniforms[i] = material.userData[i];
            }
            shader.vertexShader =
                `
				uniform bool computeNormals;
				uniform float zoomlevel;
				uniform sampler2D heightMap;
				` + shader.vertexShader;
            shader.fragmentShader =
                `
				uniform bool drawNormals;
				uniform bool drawTexture;
				uniform bool drawBlack;
				` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
				if(drawBlack) {
					gl_FragColor = vec4( 0.0,0.0,0.0, 1.0 );
				} else if(drawNormals) {
					gl_FragColor = vec4( ( 0.5 * vNormal + 0.5 ), 1.0 );
				} else if (!drawTexture) {
					gl_FragColor = vec4( 0.0,0.0,0.0, 0.0 );
				}`);
            shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', `
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

					// if (computeNormals) {
					// 	float e = getElevation(vUv, 0.0);
					// 	ivec2 size = textureSize(heightMap, 0);
					// 	float offset = 1.0 / float(size.x);
					// 	float a = getElevation(vUv + vec2(-offset, -offset), 0.0);
					// 	float b = getElevation(vUv + vec2(0, -offset), 0.0);
					// 	float c = getElevation(vUv + vec2(offset, -offset), 0.0);
					// 	float d = getElevation(vUv + vec2(-offset, 0), 0.0);
					// 	float f = getElevation(vUv + vec2(offset, 0), 0.0);
					// 	float g = getElevation(vUv + vec2(-offset, offset), 0.0);
					// 	float h = getElevation(vUv + vec2(0, offset), 0.0);
					// 	float i = getElevation(vUv + vec2(offset,offset), 0.0);


					// 	float normalLength = 500.0 / zoomlevel;

					// 	vec3 v0 = vec3(0.0, 0.0, 0.0);
					// 	vec3 v1 = vec3(0.0, normalLength, 0.0);
					// 	vec3 v2 = vec3(normalLength, 0.0, 0.0);
					// 	v0.z = (e + d + g + h) / 4.0;
					// 	v1.z = (e+ b + a + d) / 4.0;
					// 	v2.z = (e+ h + i + f) / 4.0;
					// 	vNormal = (normalize(cross(v2 - v0, v1 - v0))).rbg;
					// }
				`);
        };
        return material;
    }
    static getTerrain(imageData, tileSize, elevationDecoder) {
        const gridSize = tileSize + 1;
        const terrain = new Float32Array(gridSize * gridSize);
        for (let i = 0, y = 0; y < tileSize; y++) {
            for (let x = 0; x < tileSize; x++, i++) {
                const k = i * 4;
                const r = imageData[k + 0];
                const g = imageData[k + 1];
                const b = imageData[k + 2];
                terrain[i + y] = r * elevationDecoder[0] / 255 + g * elevationDecoder[1] / 255 + b * elevationDecoder[2] / 255 + elevationDecoder[3];
            }
        }
        for (let i = gridSize * (gridSize - 1), x = 0; x < gridSize - 1; x++, i++) {
            terrain[i] = terrain[i - gridSize];
        }
        for (let i = gridSize - 1, y = 0; y < gridSize; y++, i += gridSize) {
            terrain[i] = terrain[i - 1];
        }
        return terrain;
    }
    static getMeshAttributes(vertices, terrain, tileSize, bounds, exageration) {
        const gridSize = tileSize + 1;
        const numOfVerticies = vertices.length / 2;
        const positions = new Float32Array(numOfVerticies * 3);
        const texCoords = new Float32Array(numOfVerticies * 2);
        const [minX, minY, maxX, maxY] = bounds || [0, 0, tileSize, tileSize];
        const xScale = (maxX - minX) / tileSize;
        const yScale = (maxY - minY) / tileSize;
        for (let i = 0; i < numOfVerticies; i++) {
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
            position: { value: positions, size: 3 },
            uv: { value: texCoords, size: 2 }
        };
    }
    async onHeightImage(image) {
        if (image) {
            const tileSize = image.width;
            const gridSize = tileSize + 1;
            var canvas = CanvasUtils.createOffscreenCanvas(tileSize, tileSize);
            var context = canvas.getContext('2d');
            context.imageSmoothingEnabled = false;
            context.drawImage(image, 0, 0, tileSize, tileSize, 0, 0, canvas.width, canvas.height);
            var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            var data = imageData.data;
            const terrain = MapMartiniHeightNode.getTerrain(data, tileSize, this.elevationDecoder);
            const martini = new Martini(gridSize);
            const tile = martini.createTile(terrain);
            const { vertices, triangles } = tile.getMesh(typeof this.meshMaxError === 'function' ? this.meshMaxError(this.level) : this.meshMaxError, false);
            const attributes = MapMartiniHeightNode.getMeshAttributes(vertices, terrain, tileSize, [-0.5, -0.5, 0.5, 0.5], this.exageration);
            this.geometry = new BufferGeometry();
            this.geometry.setIndex(new Uint32BufferAttribute(triangles, 1));
            this.geometry.setAttribute('position', new Float32BufferAttribute(attributes.position.value, attributes.position.size));
            this.geometry.setAttribute('uv', new Float32BufferAttribute(attributes.uv.value, attributes.uv.size));
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
    loadHeightGeometry() {
        if (this.mapView.heightProvider === null) {
            throw new Error('GeoThree: MapView.heightProvider provider is null.');
        }
        return this.mapView.heightProvider.fetchTile(this.level, this.x, this.y).then(async (image) => {
            return this.onHeightImage(image);
        }).finally(() => {
            this.heightLoaded = true;
            this.nodeReady();
        });
    }
}
MapMartiniHeightNode.geometrySize = 16;
MapMartiniHeightNode.emptyTexture = new Texture();
MapMartiniHeightNode.geometry = new MapNodeGeometry(1, 1, 1, 1);
MapMartiniHeightNode.tileSize = 256;
MapMartiniHeightNode.baseScale = new Vector3(UnitsUtils.EARTH_PERIMETER, 1, UnitsUtils.EARTH_PERIMETER);

class MapView extends Mesh {
    constructor(root = MapView.PLANAR, provider = new OpenStreetMapsProvider(), heightProvider = null, nodeAutoLoad = false, onNodeReady) {
        super(undefined, new MeshBasicMaterial({ transparent: true, opacity: 0.0 }));
        this.lod = null;
        this.provider = null;
        this.heightProvider = null;
        this.root = null;
        this.onNodeReady = null;
        this.lowMemoryUsage = false;
        this.maxZoomForObjectHolders = 14;
        clearNodeCache();
        this.lod = new LODRaycast();
        this.provider = provider;
        this.heightProvider = heightProvider;
        this.nodeAutoLoad = nodeAutoLoad;
        if (onNodeReady) {
            this.onNodeReady = onNodeReady;
        }
        else {
            this.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
                this.lod.updateLOD(this, camera, renderer, scene);
            };
        }
        this.setRoot(root);
    }
    nodeShouldAutoLoad() {
        return this.nodeAutoLoad;
    }
    setRoot(root) {
        if (typeof root === 'number') {
            if (!MapView.mapModes.has(root)) {
                throw new Error('Map mode ' + root + ' does is not registered.');
            }
            const rootConstructor = MapView.mapModes.get(root);
            root = new rootConstructor(null, this);
        }
        if (this.root !== null) {
            this.remove(this.root);
            this.root = null;
        }
        this.root = root;
        if (this.root !== null) {
            this.geometry = this.root.constructor.baseGeometry;
            this.scale.copy(this.root.constructor.baseScale);
            this.root.mapView = this;
            this.add(this.root);
        }
    }
    setProvider(provider) {
        if (provider !== this.provider) {
            this.provider = provider;
            this.clear();
        }
    }
    setHeightProvider(heightProvider) {
        if (heightProvider !== this.heightProvider) {
            this.heightProvider = heightProvider;
            this.clear();
        }
    }
    clear() {
        this.traverseVisible(function (children) {
            if (children.childrenCache) {
                children.childrenCache = null;
            }
            if (children.initialize) {
                children.initialize();
            }
        });
        return this;
    }
    getMetaData() {
        this.provider.getMetaData();
    }
    raycast(raycaster, intersects) {
        return false;
    }
}
MapView.PLANAR = 200;
MapView.SPHERICAL = 201;
MapView.HEIGHT = 202;
MapView.HEIGHT_SHADER = 203;
MapView.MARTINI = 204;
MapView.mapModes = new Map([
    [MapView.PLANAR, MapPlaneNode],
    [MapView.SPHERICAL, MapSphereNode],
    [MapView.HEIGHT, MapHeightNode],
    [MapView.HEIGHT_SHADER, MapHeightNodeShader],
    [MapView.MARTINI, MapMartiniHeightNode]
]);

const pov$1 = new Vector3();
const position$1 = new Vector3();
class LODRadial {
    constructor() {
        this.subdivideDistance = 50;
        this.simplifyDistance = 300;
    }
    updateLOD(view, camera, renderer, scene) {
        camera.getWorldPosition(pov$1);
        view.children[0].traverse((node) => {
            node.getWorldPosition(position$1);
            let distance = pov$1.distanceTo(position$1);
            distance /= Math.pow(2, view.provider.maxZoom - node.level);
            if (distance < this.subdivideDistance) {
                node.subdivide();
            }
            else if (distance > this.simplifyDistance && node.parentNode) {
                node.parentNode.simplify();
            }
        });
    }
}

const projection = new Matrix4();
const pov = new Vector3();
const frustum = new Frustum();
const position = new Vector3();
class LODFrustum {
    constructor() {
        this.subdivideDistance = 120;
        this.simplifyDistance = 400;
        this.testCenter = true;
        this.pointOnly = false;
        this.toHandle = new Set();
        this.handled = new Set();
    }
    isChildReady(node) {
        return node.isTextureReady && (!(node instanceof MapHeightNode) || node.isHeightReady);
    }
    handleNode(node, handled, camera, minZoom, maxZoom, inFrustum = false, canSubdivide = true, canSimplify = true) {
        if (!(node instanceof MapNode) || handled.has(node)) {
            return;
        }
        if (!node.mapView) {
            return;
        }
        handled.add(node);
        node.getWorldPosition(position);
        var worldDistance = pov.distanceTo(position);
        const distance = worldDistance / Math.pow(2, 20 - node.level);
        inFrustum = inFrustum || (this.pointOnly ? frustum.containsPoint(position) : frustum.intersectsObject(node));
        if (canSubdivide && (maxZoom > node.level && distance < this.subdivideDistance) && inFrustum) {
            node.subdivide();
            const children = node.children;
            if (children) {
                for (let index = 0; index < children.length; index++) {
                    const n = children[index];
                    if (n instanceof MapNode) {
                        this.handleNode(n, handled, camera, minZoom, maxZoom, false, true, false);
                    }
                }
            }
            node.hide();
        }
        else if (canSimplify && (node.level > maxZoom || (!inFrustum || minZoom < node.level) && distance > this.simplifyDistance) && node.parentNode) {
            const parentNode = node.parentNode;
            parentNode.simplify(distance, camera.far);
            this.handleNode(parentNode, handled, camera, minZoom, maxZoom, false, false, true);
        }
        else if ((!canSimplify && !canSubdivide || inFrustum || distance < this.simplifyDistance) && minZoom <= node.level && worldDistance < camera.far) {
            if (!this.isChildReady(node)) {
                node.initialize();
            }
        }
    }
    getChildrenToTraverse(parent) {
        const toHandle = this.toHandle;
        toHandle.clear();
        function handleChild(child) {
            if (child instanceof MapNode && !child.subdivided) {
                toHandle.add(child);
            }
            else {
                child.children.forEach((c) => {
                    if (child instanceof MapNode) {
                        handleChild(c);
                    }
                });
            }
        }
        handleChild(parent);
        return toHandle;
    }
    updateLOD(view, camera, renderer, scene, force = false) {
        if (!force && this.lastMatrix && this.lastMatrix.equals(camera.matrixWorldInverse)) {
            return;
        }
        if (!this.lastMatrix) {
            this.lastMatrix = new Matrix4();
        }
        this.lastMatrix.copy(camera.matrixWorldInverse);
        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projection);
        camera.getWorldPosition(pov);
        const minZoom = view.provider.minZoom;
        const maxZoom = view.provider.maxZoom + view.provider.maxOverZoom;
        const toHandle = this.getChildrenToTraverse(view.children[0]);
        let handled = this.handled;
        toHandle.forEach((node) => { return this.handleNode(node, handled, camera, minZoom, maxZoom); });
        handled.clear();
    }
}

class XHRUtils {
    static get(url, onLoad, onError) {
        const xhr = new XMLHttpRequest();
        xhr.overrideMimeType('text/plain');
        xhr.open('GET', url, true);
        if (onLoad !== undefined) {
            xhr.onload = function () {
                onLoad(xhr.response);
            };
        }
        if (onError !== undefined) {
            xhr.onerror = onError;
        }
        xhr.send(null);
        return xhr;
    }
    static getRaw(url, onLoad, onError) {
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'arraybuffer';
        xhr.open('GET', url, true);
        if (onLoad !== undefined) {
            xhr.onload = function () {
                if (xhr.status === 200) {
                    onLoad(xhr.response);
                }
                else if (onError) {
                    onError('tile not found');
                }
            };
        }
        if (onError !== undefined) {
            xhr.onerror = onError;
        }
        xhr.send(null);
        return xhr;
    }
    static request(url, type, header, body, onLoad, onError, onProgress) {
        function parseResponse(response) {
            try {
                return JSON.parse(response);
            }
            catch (e) {
                return response;
            }
        }
        const xhr = new XMLHttpRequest();
        xhr.overrideMimeType('text/plain');
        xhr.open(type, url, true);
        if (header !== null && header !== undefined) {
            for (const i in header) {
                xhr.setRequestHeader(i, header[i]);
            }
        }
        if (onLoad !== undefined) {
            xhr.onload = function (event) {
                onLoad(parseResponse(xhr.response), xhr);
            };
        }
        if (onError !== undefined) {
            xhr.onerror = onError;
        }
        if (onProgress !== undefined) {
            xhr.onprogress = onProgress;
        }
        if (body !== undefined) {
            xhr.send(body);
        }
        else {
            xhr.send(null);
        }
        return xhr;
    }
    static loadImageCancelable(url) {
        return new CancelablePromise(function (resolve, reject) {
            const image = this.imageHandler = document.createElement('img');
            image.onload = () => {
                this.imageHandler = null;
                resolve(image);
            };
            image.onerror = () => {
                this.imageHandler = null;
                reject();
            };
            image.crossOrigin = 'Anonymous';
            image.src = url;
        }, function () {
            if (this.imageHandler) {
                this.imageHandler.src = null;
                this.imageHandler = null;
            }
        });
    }
}

class BingMapsProvider extends RasterMapProvider {
    constructor(apiKey = '', type = BingMapsProvider.AERIAL) {
        super();
        this.maxZoom = 19;
        this.format = 'jpeg';
        this.mapSize = 512;
        this.subdomain = 't1';
        this.apiKey = apiKey;
        this.type = type;
    }
    getMetaData() {
        const address = 'http://dev.virtualearth.net/REST/V1/Imagery/Metadata/RoadOnDemand?output=json&include=ImageryProviders&key=' + this.apiKey;
        XHRUtils.get(address, function (data) {
            JSON.parse(data);
        });
    }
    static quadKey(zoom, x, y) {
        let quad = '';
        for (let i = zoom; i > 0; i--) {
            const mask = 1 << i - 1;
            let cell = 0;
            if ((x & mask) !== 0) {
                cell++;
            }
            if ((y & mask) !== 0) {
                cell += 2;
            }
            quad += cell;
        }
        return quad;
    }
    buildURL(zoom, x, y) {
        return 'http://ecn.' + this.subdomain + '.tiles.virtualearth.net/tiles/' + this.type + BingMapsProvider.quadKey(zoom, x, y) + '.jpeg?g=1173';
    }
}
BingMapsProvider.AERIAL = 'a';
BingMapsProvider.ROAD = 'r';
BingMapsProvider.AERIAL_LABELS = 'h';
BingMapsProvider.OBLIQUE = 'o';
BingMapsProvider.OBLIQUE_LABELS = 'b';

class GoogleMapsProvider extends RasterMapProvider {
    constructor(apiToken) {
        super('https://www.googleapis.com/tile/v1/tiles/');
        this.sessionToken = null;
        this.orientation = 0;
        this.format = 'png';
        this.mapType = 'roadmap';
        this.overlay = false;
        this.apiToken = apiToken !== undefined ? apiToken : '';
        this.createSession();
    }
    createSession() {
        const address = 'https://www.googleapis.com/tile/v1/createSession?key=' + this.apiToken;
        const data = JSON.stringify({
            mapType: this.mapType,
            language: 'en-EN',
            region: 'en',
            layerTypes: ['layerRoadmap', 'layerStreetview'],
            overlay: this.overlay,
            scale: 'scaleFactor1x'
        });
        XHRUtils.request(address, 'GET', { 'Content-Type': 'text/json' }, data, (response, xhr) => {
            console.log('Created google maps session.', response, xhr);
            this.sessionToken = response.session;
        }, function (xhr) {
            console.warn('Unable to create a google maps session.', xhr);
        });
    }
    fetchImage(zoom, x, y) {
        return XHRUtils.loadImageCancelable('https://www.googleapis.com/tile/v1/tiles/' + zoom + '/' + x + '/' + y + '?session=' + this.sessionToken + '&orientation=' + this.orientation + '&key=' + this.apiToken);
    }
    buildURL(zoom, x, y) {
        return this.address + zoom + '/' + x + '/' + y + '?session=' + this.sessionToken + '&orientation=' + this.orientation + '&key=' + this.apiToken;
    }
}

class HereMapsProvider extends RasterMapProvider {
    constructor(appId, appCode, style, scheme, format, size) {
        super();
        this.appId = appId !== undefined ? appId : '';
        this.appCode = appCode !== undefined ? appCode : '';
        this.style = style !== undefined ? style : 'base';
        this.scheme = scheme !== undefined ? scheme : 'normal.day';
        this.format = format !== undefined ? format : 'png';
        this.size = size !== undefined ? size : 512;
        this.version = 'newest';
        this.server = 1;
    }
    nextServer() {
        this.server = this.server % 4 === 0 ? 1 : this.server + 1;
    }
    getMetaData() { }
    buildURL(zoom, x, y) {
        this.nextServer();
        return 'https://' + this.server + '.' + this.style + '.maps.api.here.com/maptile/2.1/maptile/' +
            this.version + '/' + this.scheme + '/' + zoom + '/' + x + '/' + y + '/' +
            this.size + '/' + this.format + '?app_id=' + this.appId + '&app_code=' + this.appCode;
    }
}
HereMapsProvider.PATH = '/maptile/2.1/';

class MapBoxProvider extends RasterMapProvider {
    constructor(apiToken = '', id = '', mode = MapBoxProvider.STYLE, format = 'png', useHDPI = false, version = 'v4') {
        super();
        this.apiToken = apiToken;
        this.format = format;
        this.useHDPI = useHDPI;
        this.mode = mode;
        this.mapId = id;
        this.style = id;
        this.version = version;
    }
    getMetaData() {
        const address = MapBoxProvider.ADDRESS + this.version + '/' + this.mapId + '.json?access_token=' + this.apiToken;
        XHRUtils.get(address, (data) => {
            const meta = JSON.parse(data);
            this.name = meta.name;
            this.minZoom = meta.minZoom;
            this.maxZoom = meta.maxZoom;
            this.bounds = meta.bounds;
            this.center = meta.center;
        });
    }
    fetchImage(zoom, x, y) {
        if (this.mode === MapBoxProvider.STYLE) {
            return XHRUtils.loadImageCancelable(MapBoxProvider.ADDRESS + 'styles/v1/' + this.style + '/tiles/' + zoom + '/' + x + '/' + y + (this.useHDPI ? '@2x?access_token=' : '?access_token=') + this.apiToken);
        }
        else {
            return XHRUtils.loadImageCancelable(MapBoxProvider.ADDRESS + 'v4/' + this.mapId + '/' + zoom + '/' + x + '/' + y + (this.useHDPI ? '@2x.' : '.') + this.format + '?access_token=' + this.apiToken);
        }
    }
    buildURL(zoom, x, y) {
        if (this.mode === MapBoxProvider.STYLE) {
            return MapBoxProvider.ADDRESS + 'styles/v1/' + this.style + '/tiles/' + zoom + '/' + x + '/' + y + (this.useHDPI ? '@2x?access_token=' : '?access_token=') + this.apiToken;
        }
        else {
            return MapBoxProvider.ADDRESS + 'v4/' + this.mapId + '/' + zoom + '/' + x + '/' + y + (this.useHDPI ? '@2x.' : '.') + this.format + '?access_token=' + this.apiToken;
        }
    }
}
MapBoxProvider.ADDRESS = 'https://api.mapbox.com/';
MapBoxProvider.STYLE = 100;
MapBoxProvider.MAP_ID = 101;

class MapTilerProvider extends RasterMapProvider {
    constructor(apiKey, category, style, format) {
        super('https://api.maptiler.com/');
        this.apiKey = apiKey !== undefined ? apiKey : '';
        this.format = format !== undefined ? format : 'png';
        this.category = category !== undefined ? category : 'maps';
        this.style = style !== undefined ? style : 'satellite';
        this.resolution = 512;
    }
    buildURL(zoom, x, y) {
        return this.address + this.category + '/' + this.style + '/' + zoom + '/' + x + '/' + y + '.' + this.format + '?key=' + this.apiKey;
    }
}

class OpenMapTilesProvider extends RasterMapProvider {
    constructor(address, format = 'png', theme = 'klokantech-basic') {
        super(address);
        this.address = address;
        this.format = format;
        this.theme = theme;
    }
    getMetaData() {
        const address = this.address + 'styles/' + this.theme + '.json';
        XHRUtils.get(address, (data) => {
            const meta = JSON.parse(data);
            this.name = meta.name;
            this.format = meta.format;
            this.minZoom = meta.minZoom;
            this.maxZoom = meta.maxZoom;
            this.bounds = meta.bounds;
            this.center = meta.center;
        });
    }
    buildURL(zoom, x, y) {
        return this.address + 'styles/' + this.theme + '/' + zoom + '/' + x + '/' + y + '.' + this.format;
    }
}

class DebugProvider extends MapProvider {
    constructor() {
        super(...arguments);
        this.resolution = 256;
    }
    fetchImage(zoom, x, y) {
        return new CancelablePromise((resolve, reject) => {
            const canvas = CanvasUtils.createOffscreenCanvas(this.resolution, this.resolution);
            const context = canvas.getContext('2d');
            const green = new Color(0x00ff00);
            const red = new Color(0xff0000);
            const color = green.lerpHSL(red, (zoom - this.minZoom) / (this.maxZoom - this.minZoom));
            context.fillStyle = color.getStyle();
            context.fillRect(0, 0, this.resolution, this.resolution);
            context.fillStyle = '#000000';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = 'bold ' + this.resolution * 0.1 + 'px arial';
            context.fillText('(' + zoom + ')', this.resolution / 2, this.resolution * 0.4);
            context.fillText('(' + x + ', ' + y + ')', this.resolution / 2, this.resolution * 0.6);
            resolve(canvas);
        });
    }
}

class HeightDebugProvider extends RasterMapProvider {
    constructor(provider) {
        super();
        this.fromColor = new Color(0xff0000);
        this.toColor = new Color(0x00ff00);
        this.provider = provider;
    }
    buildURL(zoom, x, y) {
        return null;
    }
    fetchImage(zoom, x, y) {
        let initialPromise = this.provider
            .fetchImage(zoom, x, y);
        return new CancelablePromise((resolve, reject) => {
            initialPromise.then((image) => {
                const resolution = 256;
                const canvas = CanvasUtils.createOffscreenCanvas(resolution, resolution);
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0, resolution, resolution, 0, 0, resolution, resolution);
                const imageData = context.getImageData(0, 0, resolution, resolution);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const value = (r * 65536 + g * 256 + b) * 0.1 - 1e4;
                    const max = 1667721.6;
                    const color = this.fromColor.clone().lerpHSL(this.toColor, value / max);
                    data[i] = color.r * 255;
                    data[i + 1] = color.g * 255;
                    data[i + 2] = color.b * 255;
                }
                context.putImageData(imageData, 0, 0);
                resolve(canvas);
            })
                .catch(reject);
        }, () => {
            return initialPromise.cancel();
        });
    }
}

export { BingMapsProvider, CancelablePromise, DebugProvider, GoogleMapsProvider, HeightDebugProvider, HereMapsProvider, LODFrustum, LODRadial, LODRaycast, MapBoxProvider, MapHeightNode, MapHeightNodeShader, MapNode, MapNodeGeometry, MapNodeHeightGeometry, MapPlaneNode, MapProvider, MapSphereNode, MapSphereNodeGeometry, MapTilerProvider, MapView, OpenMapTilesProvider, OpenStreetMapsProvider, UnitsUtils, XHRUtils };
