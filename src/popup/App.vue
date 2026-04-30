<template>
    <main>
        <header>
            <h1>Cure Whby Book</h1>
        </header>

        <section class="btns">
            <button type="button" @click="start">开始</button>
            <button type="button" @click="download_book">下载</button>
            <button type="button" @click="">更新</button>
            <button type="button" @click="">清空缓存</button>
        </section>

        <section v-if="book_info" class="book-info">
            <div class="item">
                <span class="label">书名</span>
                <span class="value" id="book-name">{{ book_info.name }}</span>
            </div>
            <div class="item">
                <span class="label">作者</span>
                <span class="value">{{ book_info.author }}</span>
            </div>
            <div class="item">
                <span class="label">BID</span>
                <span class="value">{{ book_info.bid }}</span>
            </div>
            <div class="item">
                <span class="label">格式</span>
                <span class="value">{{ read_mode }}</span>
            </div>
            <div class="item">
                <span class="label">页数</span>
                <span class="value">{{ book_info.pages }}</span>
            </div>
            <div class="item">
                <span class="label">ISBN</span>
                <span class="value">{{ book_info.isbn }}</span>
            </div>
            <div class="item">
                <span class="label">版权</span>
                <span class="value">{{ book_info.pub }}</span>
            </div>
            <div class="item">
                <span class="label">出版</span>
                <span class="value">{{ book_info.date }}</span>
            </div>

        </section>
        <section v-else class="no-book-info">
            <h2>
                没有获取到书籍信息
                <span>&gt;_&lt;</span>
                似乎出了问题哟
            </h2>
        </section>
    </main>
</template>

<script setup lang="ts">
import CureBookPageDB from "@/share/book_page_db";
import { BookStorageHelper } from "@/share/storage";
import CureEpubGenerator from "./epub_generator";
import CureLogger from "@/share/logger";
import { get_data_from_read_page } from "@/share/target_api";
import CurePdfGenerator from "./pdf_generator";
import { onMounted, ref } from "vue";

const logger = new CureLogger("popup");

const book_info = ref<OneBookData | undefined>();
const read_mode = ref<ReadMode | undefined>();
const tab_info = ref<{ tabId: number, url: string } | undefined>();


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

async function get_book_info(bid: string): Promise<OneBookData | undefined> {
    if (__IS_DEV_UI__) {
        return {
            name: "从零开始的魔法少女生活",
            author: "Hosinoharu",
            bid: "2026",
            pages: 300,
            isbn: "1234567890",
            pub: "魔法城堡图书管理部",
            date: "2026-04-30",
        }
    }

    let book_data = await BookStorageHelper.get_book_data(bid);
    if (!book_data) {

    }

    return book_data;
}


onMounted(async () => {
    if (__IS_DEV_UI__) {
        read_mode.value = "pdf"
        book_info.value = await get_book_info("dev mode");
        return;
    }

    // #cure-init tab info
    const _tab_info = await get_tab_info();
    if (!_tab_info) {
        logger.error("get tab info failed");
        return;
    }
    tab_info.value = _tab_info;

    // #cure-init read mode
    const book_data = get_data_from_read_page(tab_info.value.url);
    if (!book_data.bid || !book_data.mode) {
        logger.log("get book data failed");
        return;
    }
    read_mode.value = book_data.mode;

    // #cure-init book info
    book_info.value = await get_book_info(book_data.bid);
});

</script>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html {
    /* Edge、Chrome 浏览器上插件的页面显示不统一，
     居然是因为 rem 的根大小不同！ 
    */
    font-size: 16px;
}

body {
    --bg-color: #333;
    --light-bg-color: #444;
    --font-color: #ccc;
    --border-color: #4C4D4F;
    --cure-answer: #C576FF;
    --cure-mystique: #FE6998;
    --cure-eclair: #40B9E1;
    --cure-arcana-shadow: #5C438A;

    --font-size: 1rem;

    background-color: var(--bg-color);
    color: var(--font-color);
    width: 400px;
    height: 400px;
}
</style>

<style scoped>
main {
    border: 1px solid green;
    padding: 10px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}

section {
    width: 100%;
}


header {
    color: var(--cure-mystique);
    user-select: none;
}

.btns {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 10px;
}

.btns button {
    font-size: var(--font-size);
    color: var(--font-color);
    background-color: var(--light-bg-color);
    border: 2px solid var(--border-color);
    padding: 5px 15px;
    border-radius: 5px;

    cursor: pointer;
}

.btns button:hover {
    color: var(--cure-answer);
    border-color: var(--cure-answer);
}

.book-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: var(--font-size);
}

.book-info .item {
    display: flex;
    align-items: stretch;
}

.book-info .item:hover {
    outline: 2px solid var(--cure-arcana-shadow);
}

.book-info span {
    display: block;
    padding: 3px 10px;
    border: 1px solid var(--border-color);
}

.book-info .label {
    background-color: var(--light-bg-color);
    width: 4em;
    text-align: right;

    border-right: none;
    border-top-left-radius: 5px;
    border-bottom-left-radius: 5px;
    user-select: none;
}

.book-info .value {
    width: calc(100% - 4em);
    border-top-right-radius: 5px;
    border-bottom-right-radius: 5px;
}

#book-name {
    color: var(--cure-eclair);
    font-weight: bold;
}

.no-book-info h2 {
    width: fit-content;
    padding: 10px 30px;
    margin: auto;
    text-align: center;
    color: var(--cure-arcana-shadow);
    border: 2px solid var(--cure-arcana-shadow);
    border-radius: 10px;
}

.no-book-info span {
    display: block;
    height: 2em;
    line-height: 1.8em;
    color: var(--cure-eclair);
}
</style>
