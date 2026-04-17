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

/** 统一表示书籍的书签
 * 
 * # 原貌阅读模式中
 * 一个书签组成如下
 * ```json
    {
        "id": "281474976645121",
        "pid": "0",
        "label": "封面",
        "pnum": "1",
        "level": "1",
        "isLeaf": true,
        "children": null
    }
 * ```
 *
 * # 流式阅读模式中
 * 一个书签组成如下
 * ```json
    {
        "children": null,
        "files": null,
        "id": 1,
        "isLeaf": true,
        "key": "1fa936a24002ca99",
        "label": "封面页",
        "level": 1,
        "pid": 0,
        "pnum": 1,
        "src": "7737104E7E0A88025B2642ED70AC29CA130C727734C9E7330A1D0D88C0C09347",
        "srcNew": ""
    }
 * ```
 */
type BookCatalogNode = {
    /** 书签节点 ID.
     * 因为不同模式下这个 id 可能很长，所以用字符串表示
     */
    id: string;
    /** 父书签 ID。为字符串 0 表示顶层书签 */
    pid: string;
    /** 书签层级 */
    level: number;
    /** 书签对应的页数 */
    pnum: number;
    /** 书签的名称 */
    label: string;
    /** 是否为叶子节点 */
    isLeaf: boolean;
    /** 子节点列表 */
    children: BookCatalogNode[] | null;
};

interface ICureWhbyDownloader {
    /** 保存书籍某一页的内容，如果是二进制内容，则需要 base64 encode 再保存 */
    save_one_page(page: number, content: string): unknown;
}
