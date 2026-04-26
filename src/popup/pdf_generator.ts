/** 生成 pdf 文件 */

import CureLogger from "@/share/logger";

const logger = new CureLogger("popup/pdf_generator");

export default class CurePdfGenerator {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

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
    }

    // #region 单张图片的处理

    /** 合并小图片为大图片，返回对应图片的 base64 encode 内容 */
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

        let x = 0;
        for (const img of imgs) {
            this.ctx.drawImage(img, x, 0);
            x += img.width;
        }

        return this.canvas.toDataURL("image/png");
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

    /** 测试，仅下载书籍的一张图片 */
    async test_download_one_img() {
        const img = await this.merge_split_imgs(this.book_pages[0].content);
        const a = document.createElement("a");
        a.href = img;
        a.download = "test.png";
        a.click();
    }

    // #endregion
}
