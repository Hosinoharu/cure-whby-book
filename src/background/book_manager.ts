/** 管理书籍的下载等操作 */

import { BookStorageHelper } from "@/share/storage";
import CureLogger from "@/share/logger";
import CryptoJS from "crypto-js";
import CureBookPageDB from "@/share/book_page_db";
import { BOOK_HOST, BOOK_SIMPLE_DATA, BOOK_CATALOG } from "@/share/target_api";

const logger = new CureLogger("bg/book_manager");
const DEBUG = {
    /** 输出获取到的书籍信息 */
    LOG_BOOK_DATA: true,
    /** 输出获取到的书籍某页的内容 */
    LOG_BOOK_PAGE_CONTENT: false,
    /** 在保存一页内容后，输出底层数据库的所有内容，仅用于调试哟 */
    LOG_ALL_BOOK_PAGES: false,
};

/** 管理一本书籍的相关信息，包括下载等等 */
export abstract class CureWhbyBookManager {
    /** 在提取书籍相关信息时进行简单的存在性校验，如果不存在，则输出 `error` 信息
     * @returns 成功则返回 `book_data` 自身
     */
    static check_book_data<T>(book_data: T, error: string): T {
        book_data === undefined && logger.error("book data error:", error);
        return book_data;
    }

    /** 获取书籍的基础数据并保存，成功则返回 true */
    static async save_book_simple_data(bid: string): Promise<boolean> {
        const url = BOOK_SIMPLE_DATA + bid;
        const response = await fetch(url, {
            headers: {
                referer: `${BOOK_HOST}/book/${bid}`,
            },
        });
        const res = await response.json();

        if (this.check_book_data(res.code, "response code is null") !== 0) {
            return false;
        }

        // #cure-warn 该 raw_data 的格式根据实际响应而定
        const raw_data = this.check_book_data(
            res.data,
            "response book data is null",
        );

        const book_data: OneBookData = {
            bid,
            name: this.check_book_data(raw_data.name, "book name is null"),
            author: this.check_book_data(
                raw_data.author,
                "book author is null",
            ),
            pages: this.check_book_data(raw_data.pages, "book pages is null"),
            coverurl: this.check_book_data(
                raw_data.coverurl,
                "book cover is null",
            ),
            date: this.check_book_data(raw_data.date, "book date is null"),
            isbn: this.check_book_data(raw_data.isbn, "book isbn is null"),
            pub: this.check_book_data(raw_data.pub, "book pub is null"),
            catalog: await this.get_book_catalog(bid),
        };

        DEBUG.LOG_BOOK_DATA &&
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
        return true;
    }

    /** 获取书籍的目录数据 */
    private static async get_book_catalog(
        bid: string,
    ): Promise<BookCatalogNode[]> {
        const url = BOOK_CATALOG + bid;
        const response = await fetch(url, {
            headers: {
                referer: `${BOOK_HOST}/book/${bid}`,
            },
        });
        const res = await response.json();

        if (this.check_book_data(res.code, "response code is null") !== 0) {
            return [];
        }

        return this.format_catalog(
            this.check_book_data(res.data, "response book data is null"),
        );
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
                id: this.check_book_data(node.id, "node id is null"),
                pid: this.check_book_data(node.pid, "node pid is null"),
                label: this.check_book_data(node.label, "node label is null"),
                level: this.check_book_data(node.level, "node level is null"),
                pnum: this.check_book_data(node.pnum, "node pnum is null"),
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

    /** 存储 epub 一页的内容 */
    static async save_epub_one_page(
        bid: string,
        page: number,
        chapter: number,
        filename: string,
        content: string,
        type: ContentKind,
    ): Promise<boolean> {
        // xhtml 的内容是加密的，其它的不需要处理哟
        const new_content =
            type === "xhtml" ? EpubModeHelper.decrypt(content) : content;

        DEBUG.LOG_BOOK_PAGE_CONTENT &&
            logger.log(
                "epub page content",
                "bid:",
                bid,
                ", page:",
                page,
                ", content:",
                content,
            );

        const ok = await CureBookPageDB.Instance.save_one_page(
            bid,
            "epub",
            page,
            new_content,
            chapter,
            filename,
            type,
        );
        DEBUG.LOG_ALL_BOOK_PAGES &&
            (await CureBookPageDB.Instance.show_all_data(bid));
        return ok;
    }

    /** 当获取全部内容时，下载书籍到本地 */
    abstract download_book(): void;
}

/** 在流式阅读模式中，辅助获取书籍内容 */
abstract class EpubModeHelper {
    /** 书籍内容是被加密的，此处解密后得到 epub 一页内容
     *
     * 根据网站的代码，此处使用 CryptoJS 解密
     */
    static decrypt(content: string) {
        const bytes = this.base64_to_bytes(content);
        const header_pattern_one = new Uint8Array([
            0x0, 0xd, 0xe, 0xe, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
        ]);
        const header_pattern_two = new Uint8Array([
            0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
        ]);
        const res_suffix = bytes.slice(bytes.length - 0x4, bytes.length);

        const dpbt_value = this.dpbt(res_suffix);
        const len = bytes.length - 0x4 - dpbt_value;
        const key = bytes.slice(len, bytes.length - 0x4);
        const encrypted_data = CryptoJS.lib.WordArray.create(
            bytes.slice(0xa, len),
        );

        const base64_encrypted_data =
            CryptoJS.enc.Base64.stringify(encrypted_data);

        if (
            bytes[0x1] === header_pattern_one[0x1] &&
            bytes[0x2] === header_pattern_one[0x2] &&
            bytes[0x3] === header_pattern_one[0x3]
        ) {
            return this.raw_decrypt(base64_encrypted_data, key);
        } else if (
            bytes[0x1] === header_pattern_two[0x1] &&
            bytes[0x2] === header_pattern_two[0x2] &&
            bytes[0x3] === header_pattern_two[0x3]
        ) {
            // #cure-question 不知道什么情况
            logger.error("header pattern two:", content);
            return this.raw_decrypt(dpbt_value);
        } else {
            // #cure-question 不知道什么情况
            logger.error("header pattern unknown:", content);
            return this.raw_decrypt(bytes);
        }
    }

    private static dpbt(input_arr: Uint8Array) {
        const result = new Uint8Array(4);
        let result_index = result.length - 1;
        let input_index = input_arr.length - 1;
        for (; result_index >= 0; result_index--, input_index--) {
            if (input_index >= 0) {
                result[result_index] = input_arr[input_index];
            } else {
                result[result_index] = 0;
            }
        }
        const byte1 = (result[0] & 0xff) << 0x18;
        const byte2 = (result[1] & 0xff) << 0x10;
        const byte3 = (result[2] & 0xff) << 0x8;
        const byte4 = result[3] & 0xff;
        return byte1 + byte2 + byte3 + byte4;
    }

    private static raw_decrypt(data: any, key?: Uint8Array) {
        const utf_decoder = new TextDecoder("utf-8");
        if (key === undefined) {
            return utf_decoder.decode(data);
        }

        const key1 = utf_decoder.decode(key.slice(0, 16));
        const parsed_key1 = CryptoJS.enc.Utf8.parse(key1);

        const key2 = CryptoJS.enc.Base64.stringify(
            CryptoJS.lib.WordArray.create(key.slice(16 - key.length)),
        );

        const key3 = CryptoJS.enc.Utf8.stringify(
            CryptoJS.AES.decrypt(key2, parsed_key1, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7,
            }),
        );
        const parsed_key3 = CryptoJS.enc.Utf8.parse(key3);

        const decrypted_data = CryptoJS.enc.Utf8.stringify(
            CryptoJS.AES.decrypt(data, parsed_key3, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7,
            }),
        );

        return decrypted_data;
    }

    /** 将 base64 encode 的内容转为 bytes */
    private static base64_to_bytes(str: string) {
        return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
    }
}
