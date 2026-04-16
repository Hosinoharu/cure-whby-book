/// <reference types="devtools-protocol" />

/** 对应网站中读书的阅读模式
 * - origin: 原貌模式
 * - stream: 流式模式
 */
type ReadMode = "origin" | "stream";

type TargetAPI = {
    /** 用于指定让插件拦截特定的请求 */
    fetch_req_pattern: import("devtools-protocol").Protocol.Fetch.RequestPattern;
    /** 用于判断是否匹配到请求的 URLPattern，也用于提取 url 中的信息 */
    urlpattern: URLPattern;
};
