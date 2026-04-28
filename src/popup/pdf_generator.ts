/** 生成 pdf 文件 */

import CureLogger from "@/share/logger";
import jsPDF from "jspdf";

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

        // 计算最终合并的图片尺寸。注意拿到的图片是被竖着拼接的
        // 所以高度相同，宽度为所有图片宽度的和
        const height = imgs[0].height;
        const width = imgs.reduce((prev, cur) => prev + cur.width, 0);

        // 利用 canvas 合并图片
        this.canvas.width = width;
        this.canvas.height = height;

        // #cure-warn 调整图片的旋转并摆正
        // 根据顺序合并出来的图片是旋转后的，所以要调整绘制的过程，让最终成型的图片方向正确
        // 有些图片只向右旋转了 90 度、或者旋转了 180 度
        // 暂时不清楚如何从请求中找到规律
        // 从图片大小来说，旋转 180 度之后，图片的高还是原来的高，有 2000 多
        // 旋转 90 度之后，图片的高是原来的宽，只有 1400 多
        // 倒是可以基于此来判断旋转图片多少度，感觉不可靠
        let x = 0;
        for (const img of imgs.reverse()) {
            this.ctx.save();
            // 定位到要绘制的图片的位置中心，旋转、并绘制
            this.ctx.translate(x + img.width / 2, height / 2);
            this.ctx.rotate(Math.PI);
            this.ctx.drawImage(img, -img.width / 2, -img.height / 2);
            this.ctx.restore();
            x += img.width;
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
            filename: `${this.book_data.name}.pdf`,
        });
    }

    // #endregion

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
