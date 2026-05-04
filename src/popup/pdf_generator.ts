/** 生成 pdf 文件 */

import CureLogger from "@/share/logger";
import jsPDF, { type OutlineItem } from "jspdf";

const logger = new CureLogger("popup/pdf_generator");

export default class CurePdfGenerator {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

    private readonly pdf: jsPDF;
    private readonly pagee_width: number;
    private readonly page_height: number;

    constructor(
        /** 书籍的基本信息 */
        private book_data: OneBookData,
        /** 书籍的每一页内容 */
        private book_pages: PdfBookPageStoreItem[],
    ) {
        this.canvas = document.createElement("canvas");
        const ctx = this.canvas.getContext("2d");
        if (!ctx) {
            throw new Error("canvas context is null");
        }
        this.ctx = ctx;
        // 默认是 a4 大小
        this.pdf = new jsPDF({ format: "a4" });
        this.pagee_width = this.pdf.internal.pageSize.getWidth();
        this.page_height = this.pdf.internal.pageSize.getHeight();
    }

    // #region 单张图片的处理

    /** 合并小图片为大图片，并压缩成 jpeg 返回二进制内容 */
    private async merge_split_imgs(content: PdfSplitImageContent) {
        const imgs = await Promise.all(
            [
                content[0],
                content[1],
                content[2],
                content[3],
                content[4],
                content[5],
            ].map((s) => this.base64_str_to_img(s)),
        );

        // 计算最终合并的图片尺寸，高度相同，宽度为所有图片宽度的和
        const temp_height = imgs[0].height;
        const temp_width = imgs.reduce((prev, cur) => prev + cur.width, 0);
        const is_rorate_180 = temp_height > temp_width;
        const width = is_rorate_180 ? temp_width : temp_height;
        const height = is_rorate_180 ? temp_height : temp_width;
        this.canvas.width = width;
        this.canvas.height = height;

        // #cure-warn 调整图片的旋转并摆正
        // 根据顺序合并出来的图片是旋转后的，所以要调整绘制的过程，让最终成型的图片方向正确
        // 具体分析见 `doc/analysis.md` 文档

        const angle = is_rorate_180 ? Math.PI : -Math.PI / 2;
        /** 每次在 canvas 绘制图片时，从该 x、y 坐标开始计算 */
        let x = 0;
        let y = 0;
        for (const img of imgs.reverse()) {
            this.ctx.save();
            // 在 canvas 中定位到要绘制的图片的位置中心
            const point_x = is_rorate_180
                ? x + img.width / 2
                : x + img.height / 2;
            const point_y = is_rorate_180
                ? y + img.height / 2
                : y + img.width / 2;
            this.ctx.translate(point_x, point_y);
            this.ctx.rotate(angle);
            this.ctx.drawImage(img, -img.width / 2, -img.height / 2);
            this.ctx.restore();

            if (is_rorate_180) {
                x += img.width;
            } else {
                y += img.width;
            }
        }

        // #cure-warn 调整图片质量
        // 原本一张 png 图片 1mb 大小，300 多页的书籍那还得了
        return this.canvas.toDataURL("image/jpeg", 0.5);
    }

    /** 将字符串形式的图片转为 Image 对象 */
    private async base64_str_to_img(s: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = "data:image/webp;base64," + s;
        });
    }

    /** 测试，仅下载书籍的一张图片并打包成 PDF */
    async test_download_one_img_to_pdf() {
        const img = await this.merge_split_imgs(this.book_pages[0].content);
        this.pdf.addImage(
            img,
            "JPEG",
            0,
            0,
            // 填充整个页面
            this.pagee_width,
            this.page_height,
        );
        const url = this.pdf.output("bloburl");
        await chrome.downloads.download({
            url: url.toString(),
            filename: "test.pdf",
        });
    }

    // #endregion

    async add_bookmark() {
        this.book_data.catalog?.forEach((c) => this.raw_add_bookmark(null, c));
    }

    /** 添加书签的原始版本哟 */
    private raw_add_bookmark(
        parent: OutlineItem | null,
        node: BookCatalogNode,
    ) {
        // 如果实际获取的页数少了，添加书签的时候会报错，所以这里做个判断
        // 对该情况，将页码设置为最大页数咯
        const pnum =
            node.pnum > this.book_pages.length - 1
                ? this.book_pages.length - 1
                : node.pnum;

        const new_parent = this.pdf.outline.add(parent, node.label, {
            pageNumber: pnum,
        });

        node.children?.forEach((c) => this.raw_add_bookmark(new_parent, c));
    }

    async pack_and_download() {
        for (let i = 0; i < this.book_pages.length; i++) {
            const page = this.book_pages[i];
            const img = await this.merge_split_imgs(page.content);
            this.pdf.addImage(
                img,
                "JPEG",
                0,
                0,
                // 填充整个页面
                this.pagee_width,
                this.page_height,
            );
            i < this.book_pages.length - 2 && this.pdf.addPage();
        }

        this.add_bookmark();

        const url = this.pdf.output("bloburl");
        const filename = `${this.book_data.name}(${this.book_data.author}).pdf`;
        const downloadId = await chrome.downloads.download({
            url: url.toString(),
            filename: __IS_DEV__ ? "test.pdf" : filename,
            // 测试的时候直接覆盖下载的文件
            conflictAction: __IS_DEV__ ? "overwrite" : undefined,
            saveAs: !__IS_DEV__,
        });
    }
}
