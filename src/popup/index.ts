import CureBookPageDB from "@/share/book_page_db";
import { BookStorageHelper } from "@/share/storage";
import CureEpubGenerator from "./epub_generator";
import CureLogger from "@/share/logger";
import { get_data_from_read_page } from "@/share/target_api";

const logger = new CureLogger("popup");

document.querySelector("#start")?.addEventListener("click", async () => {
    await start();
});

document.querySelector("#download")?.addEventListener("click", async () => {
    // #cure-test 测试打包，在当前阅读界面点击下载就可以
    const tab = (
        await chrome.tabs.query({ active: true, currentWindow: true })
    )[0];
    if (tab.id === undefined || tab.url === undefined) {
        return null;
    }

    const bid = get_data_from_read_page(tab.url)?.bid;
    if (bid === null) {
        return;
    }
    download_book(bid);
});

/** 开启响应拦截 */
async function start() {
    // #cure-test/warn 在阅读页面开启插件功能
    const tab_info = await get_tab_info();
    if (tab_info === null) {
        return;
    }

    const bid = get_data_from_read_page(tab_info.url)?.bid;
    if (bid === null) {
        return;
    }

    // #cure-tip 发送消息给 background 让它启动
    const data: MsgInBgAndPopup = {
        type: "start-debugger",
        data: {
            tabId: tab_info.tabId,
            bid,
        },
    };
    await chrome.runtime.sendMessage(data);
}

/** 下载指定的书籍 */
async function download_book(bid: string) {
    const tab_info = await get_tab_info();
    if (tab_info === null) {
        return;
    }

    const book_data = await BookStorageHelper.get_book_data(bid);
    if (book_data) {
        // #cure-tip 需要先让 background 断开该数据库的连接
        const data: MsgInBgAndPopup = {
            type: "start-pack",
            data: {
                bid,
                tabId: tab_info.tabId,
            },
        };
        await chrome.runtime.sendMessage(data);

        const book_pages = await CureBookPageDB.Instance.get_all_pages(bid);
        if (book_pages.length > 0) {
            const gen = new CureEpubGenerator(book_data, book_pages);
            gen.pack_and_download();
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
