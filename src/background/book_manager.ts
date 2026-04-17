/** 管理书籍的下载等操作 */

import { BookStorageHelper } from "@/share/storage";
import CureLogger from "@/share/logger";

const logger = new CureLogger("book_manager");

/** 管理一本书籍的相关信息，包括下载等等 */
export abstract class CureWhbyBookManager {
    /** 在提取书籍相关信息时进行简单的存在性校验，如果不存在，则输出 `error` 信息
     * @returns 成功则返回 `book_data` 自身
     */
    static check_book_data<T>(book_data: T, error: string): T {
        book_data === undefined && logger.error("book data error:", error);
        return book_data;
    }

    /** 保存书籍的基础数据，成功则返回 true */
    static async save_book_simple_data(str_book_data: string) {
        const res = JSON.parse(str_book_data);
        if (this.check_book_data(res.code, "response code is null") !== 0) {
            return false;
        }

        // #cure-warn 该 raw_data 的格式根据实际响应而定
        const raw_data = this.check_book_data(
            res.data,
            "response book data is null",
        );
        const bid = this.check_book_data(String(res.data.bid), "bid is null");
        const old_book_data = await BookStorageHelper.get_book_data(bid);
        const book_data: OneBookData = {
            // 记得保留原始数据
            ...old_book_data,
            bid,
            name: this.check_book_data(raw_data.name, "book name is null"),
            author: this.check_book_data(
                raw_data.author,
                "book author is null",
            ),
            pages: this.check_book_data(raw_data.pages, "book pages is null"),
        };
        await BookStorageHelper.add_book_data(book_data);
        return true;
    }

    /** 保存书籍的目录数据，成功则返回 true */
    static async save_book_catalog(bid: string, str_book_catalog: string) {
        const res = JSON.parse(str_book_catalog);
        if (this.check_book_data(res.code, "response code is null") !== 0) {
            return false;
        }

        const raw_data = this.check_book_data(
            res.data,
            "response book data is null",
        );
        const old_book_data = await BookStorageHelper.get_book_data(bid);
        if (!old_book_data) {
            logger.error("save_book_catalog failed: old_book_data is null");
            return false;
        }

        const catalog: BookCatalogNode[] = this.format_catalog(raw_data);
        const book_data: OneBookData = {
            // 记得保留原始数据
            ...old_book_data,
            catalog,
        };
        await BookStorageHelper.add_book_data(book_data);
        return true;
    }

    /** 统一将将书签格式化
     * 不同阅读模式下的目录略微不同，部分键名的确相同，但值的类型不同，可能是字符串也可能是数字
     * 所以下面会统一转换
     */
    private static format_catalog(nodes: any[]): BookCatalogNode[] {
        const result: BookCatalogNode[] = [];

        // #cure-warn 该 node 的格式根据实际响应而定
        for (const node of nodes) {
            const item: BookCatalogNode = {
                id: this.check_book_data(String(node.id), "node id is null"),
                pid: this.check_book_data(String(node.pid), "node pid is null"),
                label: this.check_book_data(node.label, "node label is null"),
                level: parseInt(
                    this.check_book_data(node.level, "node level is null"),
                ),
                pnum: parseInt(
                    this.check_book_data(node.pnum, "node pnum is null"),
                ),
                isLeaf: this.check_book_data(
                    node.isLeaf,
                    "node isLeaf is null",
                ),
                children: node.children
                    ? this.format_catalog(node.children)
                    : null,
            };
            result.push(item);
        }

        return result;
    }

    /** 当获取全部内容时，下载书籍到本地 */
    abstract download_book(): void;
}
