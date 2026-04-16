/** 这里定义了相关的 API 模式，用于拦截请求与响应 */

import Protocol from "devtools-protocol";

export const BOOK_HOST = "wqbook.wqxuetang.com";

/** 获取书籍信息的 API，比如作者、书名、总页数等等。
 *
 * 形如 `https://wqbook.wqxuetang.com/api/v7/read/initread?bid=3244419`
 *
 * 其中 `bid` 是书籍的 id
 */

export const BOOK_INFO: Protocol.Fetch.RequestPattern = {
    urlPattern: "*read/initread\?bid=*",
    resourceType: "XHR",
    // 只需要获取它的响应，所在在【响应】阶段进行拦截，后面的 API 的配置基本相同咯
    requestStage: "Response",
};

/** 获取书籍目录的 API。
 *
 * 形如 `https://wqbook.wqxuetang.com/deep/book/v1/catatree?bid=3226417`
 *
 * 其中 `bid` 是书籍的 id
 */
export const BOOK_CATALOG: Protocol.Fetch.RequestPattern = {
    urlPattern: "*catatree\?bid=*",
    resourceType: "XHR",
    requestStage: "Response",
};
