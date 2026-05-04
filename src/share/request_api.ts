/** 访问 API 获取信息并进行处理、保存 */

import CureLogger from "./logger";
import { BookStorageHelper } from "./storage";
import {
    BOOK_CATALOG,
    BOOK_PDF_READ_PAGE,
    BOOK_SIMPLE_DATA,
    BOOK_SIMPLE_DATA2,
} from "./target_api";

const logger = new CureLogger("share/request_api");

/** 在提取书籍相关信息时进行简单的存在性校验，如果不存在，则输出 `error` 信息
 * @returns 成功则返回 `book_data` 自身
 */
function check_book_data<T>(book_data: T, error: string): T {
    book_data === undefined && logger.error("book data error:", error);
    return book_data;
}

/** 请求对应 API 获取书籍的基础数据并保存到 storage，成功则返回对应的书籍数据
 *
 * @param from 当前阅读页的 url，用于作为请求的 referer
 */
export async function save_book_simple_data(
    bid: string,
): Promise<OneBookData | undefined> {
    const url = BOOK_SIMPLE_DATA + bid;
    const response = await fetch(url);
    const res = await response.json();

    if (check_book_data(res.code, "response code is null") !== 0) {
        return;
    }

    // #cure-warn 该 raw_data 的格式根据实际响应而定
    const raw_data = check_book_data(res.data, "response book data is null");

    // 根据响应判断该书籍是否具备 epub 模式，不保证一定准确
    const has_epub =
        check_book_data(raw_data.epubpages, "book has_epub is null") === -2;
    // 书籍的页数
    const current_pages = check_book_data(raw_data.pages, "book pages is null");
    let pages = 0;
    let pdf_pages = 0;
    // 有 epub 模式，则是该模式下的页数，否则，就是 pdf 模式下的页数咯
    if (has_epub) {
        pages = current_pages;
        // #cure-warn 需要额外获取 pdf 模式下的页数，避免后续调整阅读模式时重复获取
        pdf_pages = await get_book_pages_in_pdf_mode(bid);
    } else {
        pdf_pages = current_pages;
    }

    const old_book_data = await BookStorageHelper.get_book_data(bid);
    const book_data: OneBookData = {
        bid,
        name: check_book_data(raw_data.name, "book name is null"),
        author: check_book_data(raw_data.author, "book author is null"),
        pages,
        pdf_pages,
        date: check_book_data(raw_data.date, "book date is null"),
        isbn: check_book_data(raw_data.isbn, "book isbn is null"),
        pub: check_book_data(raw_data.pub, "book pub is null"),
        catalog: await get_book_catalog(bid),
        has_epub,

        // 需要保存以前的一些数据哟，因为它们并非从网站获取的啦
        cached_pages: old_book_data?.cached_pages,
        cached_pdf_pages: old_book_data?.cached_pdf_pages,
    };

    logger.log(
        "get book data",
        "bid:",
        bid,
        ", name:",
        book_data.name,
        ", author:",
        book_data.author,
        ", pages:",
        book_data.pages,
    );

    await BookStorageHelper.add_book_data(book_data);

    return book_data;
}

/** 如果具备流失阅读模式，需要获取在 pdf 阅读模式下的总页数 */
async function get_book_pages_in_pdf_mode(bid: string): Promise<number> {
    const url = BOOK_SIMPLE_DATA2 + bid;
    const referer = BOOK_PDF_READ_PAGE + bid;
    const revoke = await add_referer_to_req(url, referer);

    let res: any;
    try {
        const response = await fetch(url);
        res = await response.json();
    } catch {
        logger.error("fetch book simple data error");
    } finally {
        await revoke();
    }

    if (!res || check_book_data(res.code, "response code is null") !== 0) {
        return 0;
    }

    const raw_data = check_book_data(res.data, "response book data is null");
    return parseInt(check_book_data(raw_data.pages, "book pages is null"));
}

/** 获取书籍的目录数据
 *
 * 已经调整了实现，具体见 `doc/analysis.md` 中的【书籍大纲、目录】部分。
 */
async function get_book_catalog(bid: string): Promise<BookCatalogNode[]> {
    return await get_book_catalog_raw(bid, BOOK_PDF_READ_PAGE + bid);
}

async function get_book_catalog_raw(
    bid: string,
    referer?: string,
): Promise<BookCatalogNode[]> {
    const url = BOOK_CATALOG + bid;
    const revoke = referer
        ? await add_referer_to_req(url, referer)
        : async () => {};

    let res: any;
    try {
        const response = await fetch(url);
        res = await response.json();
    } catch {
        logger.error("fetch book catalog error");
    } finally {
        await revoke();
    }

    if (check_book_data(res.code, "response code is null") !== 0) {
        return [];
    }

    return format_catalog(
        check_book_data(res.data, "response book data is null"),
    );
}

/** 统一将将书签格式化
 * 不同阅读模式下的目录略微不同，部分键名的确相同，但值的类型不同，可能是字符串也可能是数字
 * 所以下面会统一转换
 */
function format_catalog(nodes: any[]): BookCatalogNode[] {
    const result: BookCatalogNode[] = [];

    // #cure-warn 该 node 的格式根据实际响应而定
    for (const node of nodes) {
        const item: BookCatalogNode = {
            id: check_book_data(node.id, "node id is null"),
            pid: check_book_data(node.pid, "node pid is null"),
            label: check_book_data(node.label, "node label is null"),
            level: parseInt(check_book_data(node.level, "node level is null")),
            pnum: parseInt(check_book_data(node.pnum, "node pnum is null")),
            children: node.children ? format_catalog(node.children) : null,
        };
        result.push(item);
    }

    return result;
}

/** 给插件发出的请求添加 Referer 字段。
 *
 * @param target 要请求的 url
 * @param referer 该请求的 Referer 字段
 *
 * 具体说明见 `doc/about_problem.md` 中的【插件访问书籍信息】
 *
 * # 用法
 * ```js
 * // 临时增加规则
 * const revoke = await add_referer_to_initread(url, referer);
 * // 当请求完成之后，撤销规则
 * await revoke();
 * ```
 */
async function add_referer_to_req(target: string, referer: string) {
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
    });

    await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [
            {
                id: 1,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        {
                            header: "referer",
                            operation: "set",
                            value: referer,
                        },
                    ],
                },
                condition: {
                    urlFilter: target,
                },
            },
        ],
    });

    return async () => {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1],
        });
    };
}
