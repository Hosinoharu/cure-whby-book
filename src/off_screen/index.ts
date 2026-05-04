/** 此处完成 epub、pdf 的生成、打包、触发下载 */

import CureLogger from "@/share/logger";
import CureEpubGenerator from "./epub_generator";
import CurePdfGenerator from "./pdf_generator";
import CureBookPageDB from "@/share/book_page_db";

const logger = new CureLogger("off-screen");

// #cure-core 监听 background 的信息
chrome.runtime.onMessage.addListener(
    async (request: MsgInBgAndOffScreen, sender, sendResponse) => {
        logger.log("background message", request);

        if (request.from !== "bg" || request.to !== "off-screen") return;

        if (request.type === "start-pack") {
            const url = await gen_download_url(
                request.data.bid,
                request.data.mode,
                request.data.book_data,
            );
            return url;
        }
    },
);

/** 生成下载书籍的 url */
async function gen_download_url(
    bid: string,
    mode: ReadMode,
    book_data: OneBookData,
) {
    const book_pages = await CureBookPageDB.Instance.get_all_pages(bid, mode);
    if (book_pages.length === 0) {
        logger.warn("no book pages found", "book name:", book_data.name);
        return;
    }

    let url;

    if (mode === "epub") {
        const gen = new CureEpubGenerator(
            book_data,
            book_pages as EpubBookPageStoreItem[],
        );
        url = await gen.gen_download_url();
    } else {
        const gen = new CurePdfGenerator(
            book_data,
            book_pages as PdfBookPageStoreItem[],
        );
        url = (await gen.gen_download_url()).toString();
    }

    return url;
}
