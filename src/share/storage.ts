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
}

/** 用于读写插件的配置信息 */
export abstract class ExtensionConfigHelper {
    private static readonly name = "ExtensionConfig";

    /** 获取当前正在下载的 tabId。如果返回 null 则说明当前没有下载 */
    static async get_target_tab(): Promise<number | null> {
        const res = await get_storage(this.name);
        return res?.target_tab ?? null;
    }

    /** 设置当前正在下载的 tabId。
     * - 如果传入 null 则说明当前没有下载，情况相关配置
     * - 否则，设置 target_tab
     */
    static async set_target_tab(tabId: number | null) {
        await set_storage(this.name, { target_tab: tabId });
    }
}
