/** 生成 epub 文件，标准遵循 Epub3：https://www.w3.org/TR/epub-33/
 *
 * 验证 epub 文件：https://github.com/w3c/epubcheck
 * - 如果是从网页下载的 xhtml 内容有误，则不会处理哟
 * - 仅处理我生成的 epub 内部文件的错误，比如 `content.opf` 文件等等
 */

import JSZip from "jszip";
import CureLogger from "@/share/logger";

const logger = new CureLogger("popup/epub_generator");
const DEBUG = {
    /** 输出生成 content.opf 文件的内容 */
    LOG_OPF: false,
    /** 输出生成 nav.xhtml 文件的内容 */
    LOG_NAV: false,
};

/**
 * 这是一个非常简单的 epub 生成，最后打包成一个 zip 文件。
 *
 * https://www.w3.org/TR/epub-33/#sec-container-zip
 *
 * 因为从网页中已经能获取到每一页的 .xhtml 内容,
 * 此处仅组织它们并生成 epub 文件啦
 *
 * # 打包的目录结构
 * https://www.w3.org/TR/epub-33/#sec-container-file-and-dir-structure
 * ```plaintext
 * mimetype
 * META-INF
 *      container.xml
 * OEBPS
 *      toc.ncx
 *      content.opf
 *      css/     # 存储所有 css 文件
 *      images/  # 存储所有图片文件
 *      ...      # 存储所有 xhtml 文件
 * ```
 */
export default class CureEpubGenerator {
    private zip: JSZip;

    constructor(
        /** 书籍的基本信息 */
        private book_data: OneBookData,
        /** 书籍的每一页内容 */
        private book_pages: BookPageStoreItem[],
    ) {
        this.zip = new JSZip();
    }

    /** 写入 `mimetype` 文件 */
    private write_file_mimetype() {
        // https://www.w3.org/TR/epub-33/#sec-zip-container-mime
        const content = "application/epub+zip";
        this.zip.file("mimetype", content);
    }

    // #region META-INF directory
    // https://www.w3.org/TR/epub-33/#sec-container-abstract
    // https://www.w3.org/TR/epub-33/#sec-container-metainf

    /** 写入 `META-INF/container.xml` 文件 */
    private write_file_container() {
        //  https://www.w3.org/TR/epub-33/#sec-container-metainf-container.xml
        const content = `
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>`;
        this.zip.file("META-INF/container.xml", content.trim(), {
            createFolders: true,
        });
    }

    // #endregion

    // #region OEBPS directory

    // #region file content.opf

    /** 生成 `OEBPS/content.opf 文件的内容`
     *
     * https://www.w3.org/TR/epub-33/#sec-package-doc
     *
     */
    private gen_file_opf_content(
        tag_metadata: string,
        tag_manifest: string,
        tag_spine: string,
    ) {
        return `
<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="ISBN">
${tag_metadata}
${tag_manifest}
${tag_spine}
</package>`;
    }

    /** 生成 `OEBPS/content.opf` 文件的 `metadata` 标签  */
    private gen_opf_tag_metadata(cover_img_id?: string) {
        // https://idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.2
        const cover_meta = cover_img_id
            ? `<meta content="${cover_img_id}" name="cover"/>`
            : "";

        // https://www.w3.org/TR/epub-33/#example-indicating-an-identifier-is-an-isbn
        return `
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="ISBN">urn:isbn:${this.book_data.isbn}</dc:identifier>
    <dc:title>${this.book_data.name}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>${this.book_data.author}</dc:creator>
    <dc:publisher>${this.book_data.pub}</dc:publisher>
    <dc:date>${this.book_data.date}</dc:date>
    <meta property="dcterms:modified">${this.gen_current_date()}</meta>
    ${cover_meta}
</metadata>`;
    }

    /** 写入 `OEBPS/content.opf` 文件 */
    private write_file_opf() {
        /** 插入到 manifest 中的、所有关于 xhtml 的 item */
        const xhtml_item: string[] = [];
        let xhtml_index = 0;
        /** 插入到 manifest 中的、所有关于 css 的 item */
        const css_item: string[] = [];
        let css_index = 0;
        /** 插入到 manifest 中的、所有关于图片的 item */
        const img_item: string[] = [];
        let img_index = 0;
        /** 还是为 epub 2 考虑一下，新增对应 meta 标签，因为我用的 epub 阅读器居然不能识别 epub 3？？
         * The meta element also allows EPUB creators to identify a cover image
         * for EPUB 2 reading systems.
         */
        let cover_img_id: string | undefined = undefined;
        /** 插入到 spine 中的、所有关于 xhtml 的 item */
        const spine_item: string[] = [];

        // 先排序 xhtml，这样后面写入 spine 标签等操作时可以直接写入
        this.book_pages.sort((a, b) => {
            const [a1, a2] = a.pid.split("-");
            const [b1, b2] = b.pid.split("-");
            return parseInt(a1) - parseInt(b1) || parseInt(a2) - parseInt(b2);
        });
        // 放在这里就只需要遍历一次，完成了两件事：写入和创建 item
        this.book_pages.forEach((item) => {
            if (!item.filename) {
                throw new Error("book page item's filename is empty");
            }

            switch (item.type) {
                case "xhtml":
                    // #cure-warn 判断目录文件，并生成 nav 文件
                    // 根据文件名来判断似乎不可靠，但我也没有什么好办法啦
                    if (item.filename === "content.xhtml") {
                        // 避免可能的命名冲突
                        const filename = "cure-nav.xhtml";
                        if (this.write_nav_file(filename, item.content)) {
                            // Exactly one manifest item must declare the "nav" property
                            xhtml_item.push(
                                `<item id="nav" properties="nav" media-type="application/xhtml+xml" href="${filename}" />`,
                            );
                            // 似乎就不需要这个多余的 content.xhtml 了？？目录都已经有了嘛
                            // 不对，根据所述
                            // As a conforming XHTML content document, EPUB creators MAY include the EPUB navigation document in the spine.
                            // 所以保留 content.xhtml 吧
                            // return;
                        }
                    }

                    this.write_one_xhtml_file(item.filename, item.content);
                    xhtml_item.push(
                        `<item id="xhtml-${xhtml_index}" media-type="application/xhtml+xml" href="${item.filename}" />`,
                    );
                    spine_item.push(`<itemref idref="xhtml-${xhtml_index}" />`);
                    xhtml_index++;
                    break;
                case "css":
                    this.write_one_css_file(item.filename, item.content);
                    css_item.push(
                        `<item id="css-${css_index}" media-type="text/css" href="css/${item.filename}" />`,
                    );
                    css_index++;
                    break;
                case "img":
                    this.write_one_img_file(item.filename, item.content);
                    // #cure-warn 判断封面图片文件，并标记它
                    // 根据文件名来判断似乎不可靠，但我也没有什么好办法啦
                    const is_cover = item.filename === "cover.jpg";
                    if (is_cover) {
                        cover_img_id = `img-${img_index}`;
                    }
                    // In EPUB 3, the cover image must be identified
                    // using the cover-image property on the manifest item for the image.
                    const img_properties = is_cover
                        ? // https://www.w3.org/TR/epub-33/#sec-cover-image
                          'properties="cover-image"'
                        : "";

                    img_item.push(
                        `<item id="img-${img_index}" ${img_properties} media-type="image/jpeg" href="images/${item.filename}" />`,
                    );
                    img_index++;
                    break;
                default:
                    throw new Error(
                        `unknown book page item type: ${item.type}`,
                    );
            }
        });

        const tag_metadata = this.gen_opf_tag_metadata(cover_img_id);

        // https://www.w3.org/TR/epub-33/#sec-pkg-manifest
        const tag_manifest = `
<manifest>
${xhtml_item.join("\n")}

${css_item.join("\n")}

${img_item.join("\n")}
</manifest>`;

        const tag_spine = `
<spine>
${spine_item.join("\n")}
</spine>`;

        const content = this.gen_file_opf_content(
            tag_metadata,
            tag_manifest,
            tag_spine,
        );

        DEBUG.LOG_OPF && logger.log("epub opf content", content);
        this.zip.file("OEBPS/content.opf", content.trim(), {
            createFolders: true,
        });
    }

    // #endregion

    /** 写入 `OEBPS/nav.xhtml` 和 `OEBPS/toc.ncx` 文件，返回 true 表示操作成功！
     *
     * 网站下载的书籍有一个 content.xhtml 文件，它包含了目录信息。
     *
     * 注意，该目录信息是专门用于 epub 文件的，而不是纸质书籍那种目录。
     *
     * 但是该 content.xhtml 并不符合 epub3 规范，所以需要重新生成一个目录文件，
     *
     * 此时有两种方案：
     * - 生成 epub2 规范的目录 toc.ncx
     * - 生成 epub3 规范的目录 nav.xhtml
     *
     * 我使用的 epub 阅读器不能解析 epub3 规范，
     * 也许应该同时生成 epub2 规范的目录 toc.ncx、epub3 规范的目录 nav.xhtml
     */
    private write_nav_file(filename: string, content: string): boolean {
        const new_content = new NavGenerator(
            this.book_data.name,
            content,
        ).generate_nav_xhtml();
        if (content) {
            this.write_one_xhtml_file(filename, new_content);
        }
        return true;
    }

    /** 生成当前时间，格式 `CCYY-MM-DDThh:mm:ssZ` */
    private gen_current_date() {
        return new Date().toISOString().split(".")[0] + "Z";
    }

    /** 写入一个 xhtml 到 `OEBPS` 目录中 */
    private write_one_xhtml_file(filename: string, content: string) {
        this.zip.file(`OEBPS/${filename}`, content, {
            createFolders: true,
        });
    }

    /** 写入一个 css 到 `OEBPS/css` 目录中 */
    private write_one_css_file(filename: string, content: string) {
        this.zip.file(`OEBPS/css/${filename}`, content, {
            createFolders: true,
        });
    }

    /** 写入一个图片到 `OEBPS/images` 目录中 */
    private write_one_img_file(filename: string, content: string) {
        this.zip.file(`OEBPS/images/${filename}`, content, {
            createFolders: true,
            base64: true,
        });
    }

    // #endregion

    /** 生成一个打包后的 zip，再让插件触发下载 */
    async pack_and_download() {
        this.write_file_mimetype();
        this.write_file_container();
        this.write_file_opf();

        const blob = await this.zip.generateAsync({
            type: "blob",
            mimeType: "application/epub+zip",
        });
        const url = URL.createObjectURL(blob);
        try {
            // #cure-todo 下载完成之后自动清理数据库保存的书籍信息？还是手动清除？
            const downloadId = await chrome.downloads.download({
                url,
                filename: `${this.book_data.name}(${this.book_data.author}).epub`,
                saveAs: true,
            });
        } catch (e) {
            logger.error("download epub error", e);
        }
    }
}

/** 根据 `content.xhtml` 内容生成 `nav.xhtml` 的内容
 *
 * https://www.w3.org/TR/epub-33/#sec-nav
 */
class NavGenerator {
    constructor(
        private book_name: string,
        private content: string,
    ) {}

    /** 解析 `content.xhtml` 提取出结构化的数据 */
    private get_formatted_data() {
        const parser = new DOMParser();
        const doc = parser.parseFromString(
            this.content.trim(),
            "application/xhtml+xml",
        );

        const parse_error = doc.querySelector("parsererror");
        if (parse_error) {
            logger.error(
                "content xhtml parse error",
                "book:",
                this.book_name,
                ", error:",
                parse_error.textContent,
            );
            return;
        }

        const result: OneParsedNavItem[] = [];
        doc.querySelectorAll("p").forEach((item) => {
            const link = item.querySelector("a");
            if (link) {
                const href = link.getAttribute("href");
                const level = parseInt(
                    item.getAttribute("class")?.at(-1) || "1",
                );
                const title = link.textContent.trim();
                if (href && title) {
                    result.push({ href, title, level });
                }
            }
        });

        // 应该不需要排序，默认就是有序的...应该是
        return result;
    }

    // #region epub 3 规范

    /** 生成书签的各个 tag */
    private gen_epub3_content_tag(data: OneParsedNavItem[]) {
        // #cure-test 先不管层级关系，直接生成简单的目录
        const li_content = data
            .map((item) => {
                return `<li><a href="${item.href}">${item.title}</a></li>`;
            })
            .join("\n");
        return `<ol>\n${li_content}\n</ol>`;
    }

    /** https://www.w3.org/TR/epub-33/#sec-nav-def-model */
    private gen_epub3_tag_nav() {
        const data = this.get_formatted_data();
        if (!data) {
            return "";
        }

        const content_tag = this.gen_epub3_content_tag(data);
        return `<nav epub:type="toc">\n${content_tag}\n</nav>`;
    }

    /** 生成 epub 3 规范的 nav.xhtml 内容 */
    generate_nav_xhtml() {
        const tag_nav = this.gen_epub3_tag_nav();
        return `
<?xml version="1.0" encoding="utf-8"?>
<html xml:lang="zh-cn" xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
	<title>${this.book_name}</title>
</head>
<body>
    ${tag_nav}
</body>
</html>
`.trim();
    }

    // #endregion

    // #region epub 2 规范

    /** 生成 epub 2 规范的 toc_ncx 内容 */
    generate_toc_ncx() {
        //
    }

    // #endregion
}

// #region type

type OneParsedNavItem = {
    /** 书签的标题 */
    title: string;
    /** 书签的跳转连接，有两种形式
     * - 文件名：`preface4.xhtml`
     * - 带有锚点的文件名：`chapter1.xhtml#isbn9787302596585_1_1_1_2`
     * 其中后面 `1_1_1_2` 表示了层级关系哟
     */
    href: string;
    /** 书签的层级，数字 1 表示顶层，数字 2 表示次层级咯
     *
     * 根据 `<p class="contents-1"><a href="part1.xhtml">xxxx</a></p>` 中的 `class` 属性来确定哟
     */
    level: number;
};

// #endregion
