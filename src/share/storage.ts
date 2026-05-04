/** 统一 chrome storage 操作 */

/** 输出存储的内容 */
export async function show_storage() {
    const res = await get_storage();
    console.log("[The Local Storage Structure]", res);
}

// #region 读写 local storage

/** 读取某个存储项。传入 undefined 则获取所有配置项！ */
export async function get_storage<T extends keyof StorageStruct>(
    key?: T,
): Promise<StorageStruct[T] | undefined> {
    const res: any = await chrome.storage.local.get(key);
    return key === undefined ? res : res[key];
}

/** 删除某个存储项 */
export async function remove_storage<T extends keyof StorageStruct>(key: T) {
    await chrome.storage.local.remove(key);
}

/** 写入某个存储项 */
export async function set_storage<T extends keyof StorageStruct>(
    key: T,
    value: StorageStruct[T],
) {
    await chrome.storage.local.set({ [key]: value });
}

// #endregion

/** 用于读写书籍信息 */
export abstract class BookStorageHelper {
    private static readonly name = "Books";

    /** 获取书籍的基本信息 */
    static async get_book_data(bid: string): Promise<OneBookData | undefined> {
        const books = await get_storage(this.name);
        return books?.[bid];
    }

    /** 新增或更新书籍的基本信息 */
    static async add_book_data(book_data: OneBookData) {
        const bid = book_data.bid;
        const books = await get_storage(this.name);
        if (books === undefined) {
            await set_storage(this.name, { [bid]: book_data });
        } else {
            books[bid] = book_data;
            await set_storage(this.name, books);
        }
    }

    static async remove_book_data(bid: string) {
        const books = await get_storage(this.name);
        if (books !== undefined) {
            delete books[bid];
            await set_storage(this.name, books);
        }
    }

    /** 当缓存一页时，调用它来更新已经下载的页数 */
    static async cache_one_page(bid: string, mode: ReadMode) {
        const book = await this.get_book_data(bid);
        if (book === undefined) return;

        let complete = false;

        if (mode === "epub") {
            book.cached_pages = (book.cached_pages ?? 0) + 1;
            complete = book.cached_pages === book.pages;
        } else {
            book.cached_pdf_pages = (book.cached_pdf_pages ?? 0) + 1;
            complete = book.cached_pdf_pages === book.pdf_pages;
        }

        await this.add_book_data(book);

        complete && ExtensionConfigHelper.set_complete();
    }
}

/** 用于读写插件的配置信息 */
export abstract class ExtensionConfigHelper {
    public static readonly name = "ExtensionConfig";

    /** 获取当前正在下载的书籍的 id 和模式等信息 */
    static async get_current_download() {
        const res = await get_storage(this.name);
        if (!res) return;

        return {
            tabId: res.tabId,
            bid: res.bid,
            mode: res.mode,
        };
    }

    /** 设置当前正在下载的书籍的 id 和模式 */
    static async set_current_download(
        tabId: number,
        bid: string,
        mode: ReadMode,
    ) {
        const res = await get_storage(this.name);
        await set_storage(this.name, { ...res, tabId, bid, mode });
    }

    /** 当下载完成后，调用它清空配置 */
    static async clear_current_download() {
        await set_storage(this.name, {});
    }

    /** 设置标志位：当前已经完成了下载。后续可以监听此变化完成打包 */
    static async set_complete() {
        const res = await get_storage(this.name);
        await set_storage(this.name, { ...res, complete: true });
    }
}
