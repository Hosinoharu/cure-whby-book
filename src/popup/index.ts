import CureBookPageDB from "@/share/book_page_db";
import { BookStorageHelper } from "@/share/storage";
import CureEpubGenerator from "./epub_generator";
import CureLogger from "@/share/logger";
import { get_data_from_read_page } from "@/share/target_api";
import CurePdfGenerator from "./pdf_generator";

const logger = new CureLogger("popup");

document.querySelector("#start")?.addEventListener("click", async () => {
    await start();
});

document.querySelector("#download")?.addEventListener("click", async () => {
    await download_book();
});

/** 开启响应拦截 */
async function start() {
    // #cure-test/warn 在阅读页面开启插件功能
    const tab_info = await get_tab_info();
    const { bid, mode } = get_data_from_read_page(tab_info?.url);
    if (!tab_info || !bid || !mode) {
        return;
    }

    // #cure-tip 发送消息给 background 让它启动
    const data: MsgInBgAndPopup = {
        type: "start-debugger",
        data: {
            tabId: tab_info.tabId,
            mode,
            bid,
        },
    };
    await chrome.runtime.sendMessage(data);
}

/** 下载指定的书籍 */
async function download_book() {
    // #cure-test 测试打包，在当前阅读界面点击下载就可以
    const tab_info = await get_tab_info();
    const { bid, mode } = get_data_from_read_page(tab_info?.url);
    if (!tab_info || !bid || !mode) {
        return;
    }

    const book_data = await BookStorageHelper.get_book_data(bid);
    if (book_data) {
        // #cure-tip 需要先让 background 断开该数据库的连接
        const data: MsgInBgAndPopup = {
            type: "start-pack",
            data: {
                bid,
                mode,
                tabId: tab_info.tabId,
            },
        };
        await chrome.runtime.sendMessage(data);

        const book_pages = await CureBookPageDB.Instance.get_all_pages(
            bid,
            mode,
        );
        if (book_pages.length === 0) {
            logger.warn("no book pages found", "book name:", book_data.name);
            return;
        }

        if (mode === "epub") {
            const gen = new CureEpubGenerator(
                book_data,
                book_pages as EpubBookPageStoreItem[],
            );
            gen.pack_and_download();
        } else {
            const gen = new CurePdfGenerator(
                book_data,
                book_pages as PdfBookPageStoreItem[],
            );
            __IS_DEV__
                ? gen.test_download_one_img_to_pdf()
                : gen.pack_and_download();
        }
    }
}

async function get_tab_info() {
    const tab = (
        await chrome.tabs.query({ active: true, currentWindow: true })
    )[0];
    if (tab.id === undefined || tab.url === undefined) {
        return null;
    }
    return {
        tabId: tab.id,
        url: tab.url,
    };
}
