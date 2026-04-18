/** 插件的存储结构 */

type StorageStruct = {
    /** 要下载的书籍信息 */
    Books: { [bid: string]: OneBookData };
};

/** 保存一本书的完整信息 */
type OneBookData = OneBookSimpleData & {
    /** 已经下载的页数 */
    downloaded_pages?: number[];
    /** 书籍的目录信息 */
    catalog?: BookCatalogNode[];
};

/** 存储书籍内容到数据库中时，表示一项数据（也就是一页的内容） */
type BookPageStoreItem = {
    /** 书籍的 id */
    bid: string;
    /** 在存储时每一页的 id
     * - 对于 pdf 文件，是页码
     * - 对于 epub 文件，是`章节的 id + 页码`，例如 `1-1`
     */
    pid: string;
    /** 避免重复写入，它作为每一页的唯一 id */
    unique_id: string;
    /** 表示存储的是该阅读模式下的页面 */
    mode: ReadMode;
    /** 该页的名称，只有 epub 才有 */
    filename?: string;
    /** 该页的内容 */
    content: string;
};
