/** 这里定义了相关的 API 模式，用于拦截请求与响应 */

/** 书籍首页前缀 */
export const BOOK_HOST = "https://wqbook.wqxuetang.com";

/** 阅读模式下的网站 URL，插件在该页面启用
 * - 流失阅读模式下 `https://wqbook.wqxuetang.com/deep/read/epub?bid=3226854`
 * - 原貌阅读模式下 `https://wqbook.wqxuetang.com/deep/read/pdf?bid=3226854`
 */
export const BOOK_READER_PAGE = new URLPattern({
    protocol: "https",
    hostname: "wqbook.wqxuetang.com",
    pathname: "/deep/read/:mode",
    search: "bid=:bid",
});

/** 获取书籍信息的 API，比如作者、书名、总页数等等。
 *
 * 原本是在【书籍阅读页】中拦截响应读取，但是其中包含的信息很少，
 * 在书记详情页中可以拿到书籍的更多信息，嗯……似乎可以直接请求。
 * 算了，就直接请求吧，问题不大，毕竟只是普通的数据。
 *
 * 形如 `https://wqbook.wqxuetang.com/api/v7/book/initbook?bid=3244419`
 *
 * 其中 `bid` 是书籍的 id
 *
 * 使用方法：`BOOK_SIMPLE_DATA + bid` 生成对应的链接。
 */
export const BOOK_SIMPLE_DATA = `${BOOK_HOST}/api/v7/book/initbook?bid=`;

/** 获取书籍目录的 API。
 *
 * 在阅读书籍时，有两种不同的 API 获取书籍目录
 * - 【原貌阅读模式】，访问 API `https://wqbook.wqxuetang.com/deep/book/v1/catatree?bid=3226417`
 * - 【流式阅读模式】，访问 API `https://wqbook.wqxuetang.com/deep/epub/catatree/3244419?k=...`
 *
 * 它们的响应内容大致相同，所以可以根据第一个 API 获取目录信息，
 * 没错，也是直接访问，毕竟不是什么敏感信息。
 *
 * # 原貌阅读模式
 * ```json
    {
        "id": "1153202979583557633",
        "pid": "0",
        "label": "参考文献",
        "pnum": "517",
        "level": "1",
        "isLeaf": true,
        "children": null
    }
 * ```

 * # 流式阅读模式
 * ```json
    {
        "id": 307,
        "pid": 0,
        "level": 1,
        "pnum": 307,
        "label": "参考文献",
        "src": "",
        "srcNew": "",
        "isLeaf": true,
        "key": "73e41dbc5799406b",
        "children": null,
        "files": null
    }
 * ```
 *
 */
export const BOOK_CATALOG = `${BOOK_HOST}/deep/book/v1/catatree?bid=`;

/** 在【原貌阅读模式】中，每一页内容的被拆分成了 6 个小图片
 *
 * 形如 `https://wqbook.wqxuetang.com/deep/page/lmg/3226417/5?k=...`
 *
 * 其中 `3226417/5` 是书籍的 id 和其中当前所在的页数，
 * 那么怎么知道 6 个小图片的拼接顺序？
 * 1. 从渲染后的网页中读取顺序
 * 2. 根据请求之间的关系，找出顺序
 * 3. 图片识别，判断相连性，找出顺序
 *
 * 暂时还不确定，先暂停
 *
 */
export const BOOK_PDF_MODE_SPLIT_IMAGE: TargetAPI = {
    fetch_req_pattern: {
        urlPattern: "*deep/page/lmg*",
        resourceType: "Image",
        requestStage: "Response",
    },
    urlpattern: new URLPattern({
        pathname: "/deep/page/lmg/:bid/:page",
    }),
};

// #region 流式阅读模式

/** 在【流式阅读模式】中，每一页内容的 API
 *
 * 形如 `https://wqbook.wqxuetang.com/deep/epub/read/3244419/6/0/preface3.xhtml?k=...`
 *
 * 其中 `3244419/6/0/preface3` 是变化的：
 * - `3244419` 是书籍的 id
 * - `6` 是当前所在的页数
 * - `0` 是所在的章节，从 0 开始计数
 * - `preface3` 是该页的文件名
 *
 */
export const BOOK_EPUB_MODE_ONE_PAGE: TargetAPI = {
    fetch_req_pattern: {
        urlPattern: "*deep/epub/read*",
        resourceType: "XHR",
        requestStage: "Response",
    },
    urlpattern: new URLPattern({
        pathname: "/deep/epub/read/:bid/:page/:chapter/:filename",
    }),
};

/** 在【流式阅读模式】中，每一页内容都是 xhtml，它内部可能会包含所需要的 CSS，这是需要下载的。
 *
 * 比如某一页 `https://wqbook.wqxuetang.com/deep/epub/read/3244419/1/0/cover.xhtml`，
 *
 * 其内部有 `<link src="css/one.css">`，
 *
 * 则会请求 `https://wqbook.wqxuetang.com/deep/epub/read/3244419/1/0/css/one.css` 文件！
 *
 * 现在就需要捕获其响应，然后保存到数据库中。
 */
export const BOOK_EPUB_MODE_PAGE_CSS: TargetAPI = {
    fetch_req_pattern: {
        urlPattern: BOOK_EPUB_MODE_ONE_PAGE.fetch_req_pattern.urlPattern,
        resourceType: "Stylesheet",
        requestStage: "Response",
    },
    urlpattern: new URLPattern({
        pathname: "/deep/epub/read/:bid/:page/:chapter/css/:filename",
    }),
};

/** 在【流式阅读模式】中，每一页内容都是 xhtml，它内部可能会包含所需要的图片，这是需要下载的。
 *
 * 比如某一页 `https://wqbook.wqxuetang.com/deep/epub/read/3244419/1/0/cover.xhtml`，
 *
 * 其内部有 `<image src="images/cover.jpg">`，
 *
 * 则会请求 `https://wqbook.wqxuetang.com/deep/epub/read/3244419/1/0/images/cover.jpg` 文件！
 *
 * 现在就需要捕获其响应，然后保存到数据库中。
 */
export const BOOK_EPUB_MODE_PAGE_IMAGE: TargetAPI = {
    fetch_req_pattern: {
        urlPattern: BOOK_EPUB_MODE_ONE_PAGE.fetch_req_pattern.urlPattern,
        resourceType: "Image",
        requestStage: "Response",
    },
    urlpattern: new URLPattern({
        pathname: "/deep/epub/read/:bid/:page/:chapter/images/:filename",
    }),
};

// #endregion
