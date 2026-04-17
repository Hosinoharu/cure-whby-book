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
