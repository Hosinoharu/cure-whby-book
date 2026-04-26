/// <reference types="devtools-protocol" />

/** 对应网站中读书的阅读模式
 * - pdf: 原貌模式
 * - epub: 流式模式
 */
type ReadMode = "pdf" | "epub";

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
    /** 书籍总页数 */
    pages: number;
    isbn: string;
    /** 封面图片的 url */
    coverurl: string;
    /** 出版日期 */
    date: string;
    /** 出版社 */
    pub: string;
    /** 书籍的目录信息 */
    catalog?: BookCatalogNode[];
};

type ContentKind = "xhtml" | "css" | "img";

/** 统一表示书籍的书签 */
type BookCatalogNode = {
    /** 书签节点 ID */
    id: number;
    /** 父书签 ID。为 0 表示顶层书签 */
    pid: number;
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

/** 从一些 URL 中可以提取出来的信息 */
type DataFromEpubUrl = {
    bid?: string;
    page?: string;
    chapter?: string;
    filename?: string;
};

type DataFromPdfUrl = {
    bid?: string;
    page?: string;
    kvalue?: string;
};

type SplitPageOrder = 0 | 1 | 2 | 3 | 4 | 5;

/** 存储 6 个小图片的类型 */
type PdfSplitImageContent = Record<SplitPageOrder, string>;

// #region background 和 popup 通信的数据格式

/** background 和 popup 通信的数据格式 */
type MsgInBgAndPopup = {
    /**
     * start-debugger: 启动调试模式
     * start-pack: 通知 bg 即将打包 epub 并下载
     */
    type: "start-debugger" | "start-pack";
    data: {
        tabId: number;
        mode: ReadMode;
        bid: string;
    };
};

// #endregion
