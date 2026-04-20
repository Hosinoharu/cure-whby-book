/** 存储书籍每一页的内容到 IndexedDB，此处统一操作 */

import CureLogger from "./logger";

const logger = new CureLogger("share/book_page_db");
const DEBUG = {
    /** 输出添加的页面内容 */
    LOG_ADD_PAGE_DATA: false,
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

    private db_name = chrome.runtime.getManifest().name;
    private store_name = "book_pages";

    private db: IDBDatabase | null = null;
    /** 数据库是否初始化完成 */
    private initialized = false;

    private constructor() {
        this.init();
    }

    static get Instance() {
        if (this.instance === undefined) {
            this.instance = new CureBookPageDB();
        }
        return this.instance;
    }

    private async init() {
        const self = this;

        if (self.initialized) {
            return;
        }
        self.initialized = true;

        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.open(self.db_name, 3);
            req.onsuccess = (e) => {
                logger.log(`open database success`);
                self.db = (e.target as IDBOpenDBRequest).result;
                resolve();
            };
            req.onerror = (e) => {
                logger.error(`open database failed`, e);
                reject();
            };
            req.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(self.store_name)) {
                    const obs = db.createObjectStore(self.store_name, {
                        keyPath: "id",
                        autoIncrement: true,
                    });
                    // 后续会通过 book id 来查找，所以需要建立索引
                    obs.createIndex("bid", "bid", { unique: false });
                    // 作为页面的唯一标识，需要建立索引，避免重复添加
                    obs.createIndex("unique_id", "unique_id", { unique: true });
                    obs.transaction.oncomplete = () => {
                        resolve();
                    };
                    obs.transaction.onerror = (e) => {
                        logger.error(
                            `create <${self.store_name}> object store failed`,
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
        if (this.db === null) {
            try {
                await this.init();
            } catch (e) {
                logger.error("init db failed", e);
                return false;
            }
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

            const unique_id =
                type === "xhtml"
                    ? `${bid}-${chapter}-${page}`
                    : `${bid}-${filename}`;

            const data: BookPageStoreItem = {
                bid,
                pid: `${chapter}-${page}`,
                unique_id,
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
        const req = this.db
            ?.transaction(this.store_name, "readwrite")
            .objectStore(this.store_name)
            ?.add(data);

        if (req === undefined) {
            return false;
        }

        return new Promise((resolve, reject) => {
            req.onsuccess = () => {
                DEBUG.LOG_ADD_PAGE_DATA &&
                    logger.log("save_epub_one_page data ok", data);
                resolve(true);
            };
            req.onerror = (e) => {
                const err = (e.target as IDBRequest).error;
                if (
                    err?.name === "ConstraintError" &&
                    err?.message.includes("unique_id")
                ) {
                    DEBUG.LOG_ADD_PAGE_DATA &&
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

    /** 获取书籍某一页的内容
     * @param bid 书籍的 id
     * @param mode 该书籍的阅读模式
     * @param page 页数
     * @param chapter 章节数，仅 epub 需要此参数
     *
     */
    async get_one_page(
        bid: string,
        mode: ReadMode,
        page: number,
        chapter?: number,
    ): Promise<string | undefined> {
        if (this.db === null) {
            try {
                await this.init();
            } catch (e) {
                logger.error("init db failed", e);
                return;
            }
        }

        if (mode === "pdf") {
            return await this.get_pdf_one_page(page);
        } else if (mode === "epub") {
            if (chapter === undefined) {
                logger.error("epub mode need chapter number");
                return undefined;
            }
            return await this.get_epub_one_page(page, chapter);
        }

        throw new Error(`unknown mode: ${mode}`);
    }

    private async get_pdf_one_page(page: number): Promise<string | undefined> {
        throw new Error("Method not implemented.");
    }

    private async get_epub_one_page(
        page: number,
        chapter: number,
    ): Promise<string | undefined> {
        throw new Error("Method not implemented.");
    }

    /** 获取书籍的所有页内容 */
    async get_all_pages(bid: string): Promise<BookPageStoreItem[]> {
        if (this.db === null) {
            try {
                await this.init();
            } catch (e) {
                logger.error("init db failed", e);
                return [];
            }
        }

        // 基于索引 bid 查找所有内容
        const req = this.db
            ?.transaction(this.store_name, "readonly")
            .objectStore(this.store_name)
            ?.index("bid")
            ?.getAll(bid);

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

    /** 删除数据库 */
    async remove() {
        this?.db?.close();
        const req = indexedDB.deleteDatabase(this.db_name);
        req.onsuccess = () => {
            logger.log("remove db success");
            this.initialized = false;
        };
        req.onerror = () => {
            logger.error("remove db failed");
        };
    }

    /** 输出所有页面数据，仅用于调试 */
    async show_all_data() {
        const req = this.db
            ?.transaction(this.store_name, "readonly")
            ?.objectStore(this.store_name)
            ?.getAll();

        if (req === undefined) {
            return;
        }

        req.onsuccess = () => {
            logger.log("show_all_data", req.result);
        };
    }

    // #region helper

    // #endregion
}
