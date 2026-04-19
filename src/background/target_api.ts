/** 这里定义了相关的 API 模式，用于拦截请求与响应 */

/** 书籍首页前缀 */
export const BOOK_HOST = "https://wqbook.wqxuetang.com";

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

// #region 原貌阅读模式相关的 API

/**  在【原貌阅读模式】中，获取书籍目录的 API。
 *
 * 形如 `https://wqbook.wqxuetang.com/deep/book/v1/catatree?bid=3226417`
 *
 * 其中 `bid` 是书籍的 id
 */
export const BOOK_PDF_MODE_CATALOG: TargetAPI = {
    fetch_req_pattern: {
        urlPattern: "*deep/book/v1/catatree*",
        resourceType: "XHR",
        requestStage: "Response",
    },
    urlpattern: new URLPattern({
        pathname: "/deep/book/v1/catatree",
        search: "bid=:bid",
    }),
};

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

// #endregion

// #region 流式阅读模式相关的 API

/**  在【流式阅读模式】中，获取书籍目录的 API。
 *
 * 形如 `https://wqbook.wqxuetang.com/deep/epub/catatree/3244419?k=...`
 *
 * 其中 `3244419` 是书籍的 id
 */
export const BOOK_EPUB_MODE_CATALOG: TargetAPI = {
    fetch_req_pattern: {
        urlPattern: "*deep/epub/catatree*",
        resourceType: "XHR",
        requestStage: "Response",
    },
    urlpattern: new URLPattern({ pathname: "/deep/epub/catatree/:bid" }),
};

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

// #endregion
