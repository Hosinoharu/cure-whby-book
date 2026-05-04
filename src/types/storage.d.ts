/** 插件的存储结构 */

type StorageStruct = {
    /** 插件本身的配置 */
    ExtensionConfig: ExtensionConfig;
    /** 要下载的书籍信息 */
    Books: { [bid: string]: OneBookData };
};

/** 插件自身的配置项 */
type ExtensionConfig = {
    /** 只能下载一本书。开启监听时，该值就记录监听的 tabId，取消监听时重置它 */
    target_tab: number | null;
};

/** 保存一本书的完整信息 */
type OneBookData = OneBookSimpleData & {
    /** 已经下载的 epub 页数 */
    cached_pages?: number;
    /** 已经下载的 pdf 页数 */
    cached_pdf_pages?: number;
};

type BaseBookPageStoreItem = {
    /** 它作为每一页的唯一 id，其构成为
     * - 当保存为 xhtml 时，其构成为 `${chapter 章节编号}-${page 页码}`，这才是唯一的！
     * - 当保存为 css、img 时，它本身就是唯一的，所以使用文件名 `${filename}`
     * - 当保存为 pdf 时，它就是页码！
     */
    id: `${number}-${number}` | string;
    /** 书籍的 id，表示该页属于哪本书籍 */
    bid: string;
    /** 在存储时每一页的 id
     * - 对于 pdf 文件，是页码
     * - 对于 epub 文件，是`章节的 id + 页码`，例如 `1-1`
     */
    pid: string | number;
    /** 表示存储的是该阅读模式下的页面 */
    mode: ReadMode;
};

type EpubBookPageStoreItem = BaseBookPageStoreItem & {
    mode: "epub";
    /** 该页的名称，只有 epub 才有 */
    filename: string;
    /** 该页的内容
     * - `type` 为 `img`` 时，它是一个图片的 base64 encode 内容
     */
    content: string;
    /** 存储的内容格式，它也可以存储静态文件哟，只有 epub 才有 */
    type: ContentKind;
};

type PdfBookPageStoreItem = BaseBookPageStoreItem & {
    mode: "pdf";
    /** 该页的内容，保存的是 `PdfSplitImageContent` */
    content: PdfSplitImageContent;
};

/** 存储书籍内容到数据库中时，表示一项数据（也就是一页的内容） */
type BookPageStoreItem = EpubBookPageStoreItem | PdfBookPageStoreItem;

type OneBookDBConnection = {
    bid: string;
    db: IDBDatabase | null;
    initialized: boolean;
};
