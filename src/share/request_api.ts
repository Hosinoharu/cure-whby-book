/** 访问 API 获取信息并进行处理、保存 */

import CureLogger from "./logger";
import { BookStorageHelper } from "./storage";
import { BOOK_CATALOG, BOOK_HOST, BOOK_SIMPLE_DATA } from "./target_api";

const logger = new CureLogger("share/request_api");

/** 在提取书籍相关信息时进行简单的存在性校验，如果不存在，则输出 `error` 信息
 * @returns 成功则返回 `book_data` 自身
 */
function check_book_data<T>(book_data: T, error: string): T {
    book_data === undefined && logger.error("book data error:", error);
    return book_data;
}

/** 请求对应 API 获取书籍的基础数据并保存到 storage，成功则返回对应的书籍数据 */
export async function save_book_simple_data(
    bid: string,
): Promise<OneBookData | undefined> {
    const url = BOOK_SIMPLE_DATA + bid;
    const response = await fetch(url, {
        headers: {
            referer: `${BOOK_HOST}/book/${bid}`,
        },
    });
    const res = await response.json();

    if (check_book_data(res.code, "response code is null") !== 0) {
        return;
    }

    // #cure-warn 该 raw_data 的格式根据实际响应而定
    const raw_data = check_book_data(res.data, "response book data is null");

    const book_data: OneBookData = {
        bid,
        name: check_book_data(raw_data.name, "book name is null"),
        author: check_book_data(raw_data.author, "book author is null"),
        pages: check_book_data(raw_data.pages, "book pages is null"),
        date: check_book_data(raw_data.date, "book date is null"),
        isbn: check_book_data(raw_data.isbn, "book isbn is null"),
        pub: check_book_data(raw_data.pub, "book pub is null"),
        catalog: await get_book_catalog(bid),
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

/** 获取书籍的目录数据 */
async function get_book_catalog(bid: string): Promise<BookCatalogNode[]> {
    const url = BOOK_CATALOG + bid;
    const response = await fetch(url, {
        headers: {
            referer: `${BOOK_HOST}/book/${bid}`,
        },
    });
    const res = await response.json();

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
            level: check_book_data(node.level, "node level is null"),
            pnum: check_book_data(node.pnum, "node pnum is null"),
            isLeaf: check_book_data(node.isLeaf, "node isLeaf is null"),
            children: node.children ? format_catalog(node.children) : null,
        };
        result.push(item);
    }

    return result;
}
