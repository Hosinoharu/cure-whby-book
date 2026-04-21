/** 存储书籍每一页的内容到 IndexedDB，此处统一操作。
 *
 * 数据库设计见 `doc/about_book_db.md`
 */

import CureLogger from "./logger";

const logger = new CureLogger("share/book_page_db");
const DEBUG = {
    /** 输出添加到数据库的每一项数据 */
    LOG_ADD_ITEM: false,
};

/** 书籍内容存储 —— 单例模式
 *
 * 数据库表中一直都在添加数据，不需要【先读取，再追加，再写入数据库】，
 * 每添加的一条内容就是书籍的某一页内容哟。
 *
 * 将来可以提取所有特定书籍 id 的【页内容】咯
 *
 * # 注意
 * 该数据库中会保存书籍某一页的内容，比如在 epub 阅读模式中，书籍一页的内容是 xhtml 格式。
 * 但是 xhtml 内容还涉及到一些 css、imgage 等文件，也会被保存到该数据库中。
 *
 * 这样，将来根据书籍 id 就可以拿到其所有的数据，然后将 xhtml、css、image 等分类写入到 epub 格式的文件中！
 */
export default class CureBookPageDB {
    private static instance?: CureBookPageDB;

    private readonly db_name_prefix = chrome.runtime.getManifest().name;
    private readonly store_name = "book_pages";
    /** 存储所有数据库连接 */
    private readonly db_map = new Map<string, OneBookDBConnection>();

    private constructor() {}

    static get Instance() {
        if (this.instance === undefined) {
            this.instance = new CureBookPageDB();
        }
        return this.instance;
    }

    // #region db map helper method

    private get_book_conn(bid: string): OneBookDBConnection {
        return this.db_map.get(bid) || { bid, db: null, initialized: false };
    }

    private save_book_conn(conn: OneBookDBConnection) {
        this.db_map.set(conn.bid, conn);
    }

    // #endregion

    /** 为书籍 `bid` 初始化其数据库 */
    async init(bid: string) {
        const self = this;
        const conn = self.get_book_conn(bid);
        if (conn.initialized) {
            return;
        }
        conn.initialized = true;

        return new Promise<void>((resolve, reject) => {
            const db_name = `${self.db_name_prefix}-${bid}`;
            const req = indexedDB.open(db_name, 1);
            req.onsuccess = async (e) => {
                logger.log(`open database success`, db_name);
                conn.db = (e.target as IDBOpenDBRequest).result;
                self.save_book_conn(conn);
                resolve();
            };
            req.onerror = (e) => {
                logger.error(`open database failed`, db_name, ", error:", e);
                reject();
            };
            req.onblocked = (e) => {
                logger.error(`open database blocked`, db_name, ", error:", e);
                reject();
            };
            req.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                // #cure-tip init book pages object store
                if (!db.objectStoreNames.contains(self.store_name)) {
                    const obs = db.createObjectStore(self.store_name, {
                        keyPath: "id",
                        autoIncrement: false,
                    });
                    obs.transaction.oncomplete = () => {
                        resolve();
                    };
                    obs.transaction.onerror = (e) => {
                        logger.error(
                            `create object store book_pages failed`,
                            db_name,
                            ", error:",
                            e,
                        );
                        reject();
                    };
                }
            };
        });
    }

    // #region save page

    /** 保存书籍一页的内容，不同的阅读下需要的参数不同
     * @param bid 书籍的 id
     * @param mode 该书籍的阅读模式
     * @param page 页数
     * @param content 该页的内容
     * @param chapter 章节数，仅 epub 需要此参数
     * @param filename 该页的名字，仅 epub 需要此参数
     * @param type 实际存储的内容类型，仅 epub 需要此参数
     *
     *
     * @returns 保存成功则返回 true
     */
    async save_one_page(
        bid: string,
        mode: ReadMode,
        page: number,
        content: string,
        chapter?: number,
        filename?: string,
        type?: ContentKind,
    ): Promise<boolean> {
        try {
            await this.init(bid);
        } catch (e) {
            logger.error("init db failed", e);
            return false;
        }

        if (mode === "pdf") {
            return await this.save_pdf_one_page(bid, page);
        } else if (mode === "epub") {
            if (
                chapter === undefined ||
                filename === undefined ||
                type === undefined
            ) {
                logger.error("epub mode need chapter number and filename");
                return false;
            }

            const data: BookPageStoreItem = {
                id: type === "xhtml" ? `${chapter}-${page}` : filename,
                bid,
                pid: `${chapter}-${page}`,
                mode,
                filename,
                content,
                type,
            };
            return await this.save_epub_one_page(data);
        }

        throw new Error(`unknown mode: ${mode}`);
    }

    private async save_pdf_one_page(
        bid: string,
        page: number,
    ): Promise<boolean> {
        throw new Error("Method not implemented.");
    }

    private async save_epub_one_page(
        data: BookPageStoreItem,
    ): Promise<boolean> {
        const db = this.get_book_conn(data.bid).db;
        const req = db
            ?.transaction(this.store_name, "readwrite")
            .objectStore(this.store_name)
            ?.add(data);

        if (req === undefined) {
            return false;
        }

        return new Promise((resolve, reject) => {
            req.onsuccess = () => {
                DEBUG.LOG_ADD_ITEM &&
                    logger.log("save_epub_one_page data ok", data);
                resolve(true);
            };
            req.onerror = (e) => {
                const err = (e.target as IDBRequest).error;
                if (
                    err?.name === "ConstraintError" &&
                    err?.message === "Key already exists in the object store."
                ) {
                    DEBUG.LOG_ADD_ITEM &&
                        logger.warn("save_epub_one_page data exist", data);

                    return resolve(true);
                }
                logger.error("save_one_epub_page failed", e);
                reject(err?.message);
            };
        });
    }

    // #endregion

    // #region get page

    /** 获取书籍的所有页内容 */
    async get_all_pages(bid: string): Promise<BookPageStoreItem[]> {
        try {
            await this.init(bid);
        } catch (e) {
            logger.error("init db failed", e);
            return [];
        }

        const db = this.get_book_conn(bid).db;
        const req = db
            ?.transaction(this.store_name, "readonly")
            .objectStore(this.store_name)
            ?.getAll();

        if (req === undefined) {
            return [];
        }

        return new Promise((resolve, reject) => {
            req.onsuccess = () => {
                resolve(req.result as BookPageStoreItem[]);
            };
            req.onerror = (e) => {
                logger.error("get_all_pages failed", e);
                reject(e);
            };
        });
    }

    // #endregion

    // #region helper

    /** 断开数据库的连接 */
    async exit_conn(bid: string) {
        const conn = this.get_book_conn(bid);
        conn.db?.close();
    }

    /** 删除指定数据库 */
    async remove(bid: string) {
        const conn = this.get_book_conn(bid);
        if (conn.db === null) {
            this.db_map.delete(bid);
            return;
        }

        const db_name = conn.db.name;
        conn.db.close();
        const req = indexedDB.deleteDatabase(db_name);
        req.onsuccess = () => {
            logger.log("remove db success", db_name);
        };
        req.onerror = () => {
            logger.error("remove db failed", db_name);
        };
    }

    /** 删除所有数据库 */
    async remove_all() {
        for (const bid of this.db_map.keys()) {
            await this.remove(bid);
        }
    }

    /** 输出所有页面数据，仅用于调试 */
    async show_all_data(bid: string) {
        const conn = this.get_book_conn(bid);
        const req = conn.db
            ?.transaction(this.store_name, "readonly")
            ?.objectStore(this.store_name)
            ?.getAll();

        if (req === undefined) {
            return;
        }

        req.onsuccess = () => {
            logger.log("show_all_data", conn.db?.name, ", result:", req.result);
        };
    }

    // #endregion
}
