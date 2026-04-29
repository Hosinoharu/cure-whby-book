<template>
    <h1>Cure Whby Book</h1>

    <section class="btns">
        <button type="button" @click="start">开始</button>
        <button type="button" @click="download_book">下载</button>
        <button type="button" @click="">更新</button>
        <button type="button" @click="">清空缓存</button>
    </section>

    <section class="book-info">
        <div class="item">
            <span class="label">书名：</span>
            <span class="value">书名</span>
        </div>
    </section>
</template>

<script setup lang="ts">
import CureBookPageDB from "@/share/book_page_db";
import { BookStorageHelper } from "@/share/storage";
import CureEpubGenerator from "./epub_generator";
import CureLogger from "@/share/logger";
import { get_data_from_read_page } from "@/share/target_api";
import CurePdfGenerator from "./pdf_generator";

const logger = new CureLogger("popup");

/** 开启响应拦截 */
async function start() {
    if (__IS_DEV_UI__) return;

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
    if (__IS_DEV_UI__) return;

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

</script>

<style>
* {
    margin: 0;
    padding: 0;
}

body {
    background-color: #333;
    color: #ccc;

    --cure-answer: #C576FF;
    --cure-mystique: #FE6998;
    --cure-eclair: #40B9E1;
    --cure-arcana-shadow: #5C438A;
}
</style>

<style scoped>
h1 {
    color: var(--cure-mystique);
}
</style>
