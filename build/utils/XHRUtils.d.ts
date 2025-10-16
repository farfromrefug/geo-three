import { CancelablePromise } from './CancelablePromise';
export declare class XHRUtils {
    static get(url: string, onLoad?: Function, onError?: Function): XMLHttpRequest;
    static getRaw(url: string, onLoad?: Function, onError?: Function): XMLHttpRequest;
    static request(url: string, type: string, header?: any, body?: any, onLoad?: Function, onError?: Function, onProgress?: Function): XMLHttpRequest;
    static loadImageCancelable(url: string): CancelablePromise<any>;
}
