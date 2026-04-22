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
    // https://wqbook.wqxuetang.com/deep/read/epub?bid=3244419
    // https://wqbook.wqxuetang.com/deep/read/pdf?bid=3244419
    // 从 url 中提取对应的 bid，然后获取书籍的基础信息咯
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

    // #cure-tip 发送消息给 background 让它启动
    const data: MsgStartDebugger = {
        type: "start-debugger",
        data: {
            tabId: tab.id,
            bid,
        },
    };
    await chrome.runtime.sendMessage(data);
}

/** 下载指定的书籍 */
async function download_book(bid: string) {
    const book_data = await BookStorageHelper.get_book_data(bid);
    if (book_data) {
        // #cure-tip 需要先让 background 断开该数据库的连接
        const data: MsgStartPack = {
            type: "start-pack",
            data: {
                bid,
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
