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

/** 一本书表面上最基本的信息 */
type OneBookSimpleData = {
    bid: string;
    name: string;
    author: string;
    pages: number;
};

/** 流式阅读模式中的书签 */
type BookEpubModeCatalogNode = {
    /** 书签节点 ID */
    id: number;
    /** 父书签 ID */
    pid: number;
    /** 数千层级 */
    level: number;
    /** 书签对应的页数 */
    pnum: number;
    /** 书签的名称 */
    label: string;
    /** 源地址（可能是文件路径或哈希） */
    src: string;
    /** 是否为叶子节点 */
    isLeaf: boolean;
    /** 唯一键值 */
    key: string;
    /** 子节点列表 */
    children: BookEpubModeCatalogNode[] | null;
};

interface ICureWhbyDownloader {
    /** 保存书籍某一页的内容，如果是二进制内容，则需要 base64 encode 再保存 */
    save_one_page(page: number, content: string): unknown;
}
