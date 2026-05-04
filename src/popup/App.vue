<template>
    <main>
        <header @click="goto_cure">
            <img class="flower-header" src="./flower.png" alt="cure flower" />
            <h1>
                <span>Cure Whby </span>
                <span style="color: var(--cure-mystique)">B</span>
                <span style="color: var(--cure-answer)">O</span>
                <span style="color: var(--cure-eclair)">O</span>
                <span style="color: var(--cure-arcana-shadow)">K</span>
            </h1>
            <img
                class="flower-header-right"
                src="./flower2.png"
                alt="cure flower"
            />
        </header>

        <section class="btns">
            <button type="button" @click="start">开始</button>
            <button type="button" @click="download_book">下载</button>
            <button type="button" @click="update_book_info(true)">更新</button>
            <button type="button" @click="clear_book_data">清空缓存</button>
        </section>

        <section v-if="book_info" class="book-info">
            <div class="item">
                <span class="label">书名</span>
                <span
                    class="value"
                    style="color: var(--cure-eclair); font-weight: bold"
                    >{{ book_info.name }}</span
                >
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
                <span
                    class="value"
                    style="color: var(--cure-answer); font-weight: bold"
                    >{{ read_mode }}</span
                >
            </div>
            <div class="item">
                <span class="label">页数</span>
                <span
                    class="value"
                    style="color: var(--cure-arcana-shadow); font-weight: bold"
                >
                    {{
                        read_mode === "epub"
                            ? book_info.pages
                            : book_info.pdf_pages
                    }}
                    /
                    {{
                        read_mode === "epub"
                            ? (book_info.cached_pages ?? 0)
                            : (book_info.cached_pdf_pages ?? 0)
                    }}
                </span>
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
                没有书籍信息
                <span>&gt;_&lt;</span>
                点击 [ 更新 ] 尝试获取
            </h2>
        </section>
    </main>

    <footer>
        <span>{{ status }}</span>
    </footer>
    <img class="flower-bottom" src="./flower.png" alt="cure flower" />
</template>

<script setup lang="ts">
import CureBookPageDB from "@/share/book_page_db";
import { BookStorageHelper } from "@/share/storage";
import CureEpubGenerator from "./epub_generator";
import CureLogger from "@/share/logger";
import { get_data_from_read_page } from "@/share/target_api";
import CurePdfGenerator from "./pdf_generator";
import { onMounted, ref } from "vue";
import { save_book_simple_data } from "@/share/request_api";

const logger = new CureLogger("popup");

const book_info = ref<OneBookData | undefined>();
const read_mode = ref<ReadMode | undefined>();
const tab_info = ref<{ tabId: number; url: string } | undefined>();
/** 底部状态条的内容 */
const status = ref("");

/** 开启响应拦截 */
async function start() {
    if (__IS_DEV_UI__) return;

    // #cure-test/warn 在阅读页面开启插件功能
    const tab_info = await get_tab_info();
    const { bid, mode } = get_data_from_read_page(tab_info?.url);
    if (!tab_info || !bid || !mode) {
        set_status("从当前 URL 中获取书籍的 id 失败");
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

    set_status("开始缓存书籍内容");
}

/** 下载指定的书籍 */
async function download_book() {
    if (__IS_DEV_UI__) return;

    // #cure-test 测试打包，在当前阅读界面点击下载就可以
    const tab_info = await get_tab_info();
    const { bid, mode } = get_data_from_read_page(tab_info?.url);
    if (!tab_info || !bid || !mode) {
        set_status("从当前 URL 中获取书籍的 id 失败");
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
            set_status("并没有缓存该书籍的内容");
            logger.warn("no book pages found", "book name:", book_data.name);
            return;
        }

        set_status(`正在打包生成 ${mode} 文件供下载`);
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
    } else {
        set_status("没有获取到书籍的信息");
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

/** 重新获取书籍的信息
 * @param force 是否强制重新获取，否则仅仅是从 storage 中更新
 */
async function update_book_info(force = false) {
    book_info.value = undefined;

    if (__IS_DEV_UI__) {
        read_mode.value = "epub";
        book_info.value = await get_book_info("dev mode", false);
        set_status("当前展示的是开发模式下的信息");
        return;
    }

    // #cure-init tab info
    const _tab_info = await get_tab_info();
    if (!_tab_info) {
        set_status("获取标签页信息失败");
        logger.error("get tab info failed");
        return;
    }
    tab_info.value = _tab_info;

    // #cure-init read mode
    const book_data = get_data_from_read_page(tab_info.value.url);
    if (!book_data.bid || !book_data.mode) {
        set_status("从当前 URL 中获取书籍的 id 失败");
        logger.log("get book data failed");
        return;
    }
    read_mode.value = book_data.mode;

    // #cure-init book info
    book_info.value = await get_book_info(book_data.bid, force);

    set_status("初始化完成");
}

/** 清空书籍所有的信息，包括下载的消息哟 */
async function clear_book_data() {
    if (__IS_DEV_UI__ || !book_info.value) return;

    const bid = book_info.value.bid;
    await BookStorageHelper.remove_book_data(bid);
    await CureBookPageDB.Instance.remove(bid);
    book_info.value = undefined;
    set_status("已清空缓存");
}

/** 从 storage 或者 web 获取书籍信息
 * @param from_web 指定是否访问 web 获取最新的书籍信息
 * - 如果为 false，会先访问 storage，如果没有找到，才会访问 web
 */
async function get_book_info(
    bid: string,
    from_web: boolean,
): Promise<OneBookData | undefined> {
    // #cure-test 测试静态页面的数据
    if (__IS_DEV_UI__) {
        return {
            name: "从零开始的魔法少女生活",
            author: "Hosinoharu",
            bid: "2026",
            pages: 300,
            pdf_pages: 500,
            isbn: "1234567890",
            pub: "魔法城堡图书管理部",
            date: "2026-04-30",
            has_epub: true,
            cached_pages: 10,
            cached_pdf_pages: 20,
        };
    }

    const book_data = from_web
        ? await save_book_simple_data(bid)
        : (await BookStorageHelper.get_book_data(bid)) ||
          (await save_book_simple_data(bid));

    return book_data;
}

function set_status(s: string) {
    status.value = s;
}

async function goto_cure() {
    if (__IS_DEV_UI__) return;

    await chrome.tabs.create({
        url: "https://www.toei-anim.co.jp/tv/precure/",
    });
}

!__IS_DEV_UI__ &&
    chrome.debugger.onDetach.addListener((debuggee) => {
        set_status("已停止缓存书籍的内容");
    });

onMounted(async () => {
    await update_book_info();
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
    --bg-color: #303336;
    --light-bg-color: #404346;
    --font-color: #eee;
    --dark-font-color: #888;
    --border-color: #4f4e4c;

    --cure-answer: #c576ff;
    --cure-mystique: #fe6998;
    --cure-eclair: #40b9e1;
    --cure-arcana-shadow: #ea9a7e;

    --font-size: 1rem;

    background-color: var(--bg-color);
    color: var(--font-color);
    width: 400px;
    height: 400px;
}
</style>

<style scoped>
main {
    /* border: 1px solid green; */
    padding: 10px 20px 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

section {
    width: 100%;
}

header {
    position: relative;
    font-family: "Segoe UI";
    font-size: 1rem;
    letter-spacing: 3px;
    margin-bottom: 15px;
    user-select: none;
}

header::first-letter {
    color: var(--cure-answer);
}

.btns {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 10px;
}

.btns button {
    font-size: 0.8rem;
    color: var(--font-color);
    background-color: transparent;
    border: 2px solid var(--border-color);
    padding: 5px 15px;
    border-radius: 5px;

    cursor: pointer;
}

.btns button:active {
    transform: scale(0.8);
}

.btns button:hover {
    color: var(--cure-answer);
    border-color: var(--cure-answer);
    animation: shake 0.3s ease-in-out;
}

@keyframes shake {
    0% {
        transform: rotate(0deg);
    }
    25% {
        transform: rotate(8deg);
    }
    50% {
        transform: rotate(0deg);
    }
    75% {
        transform: rotate(-8deg);
    }
    100% {
        transform: rotate(0deg);
    }
}

.book-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.8rem;
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

.no-book-info h2 {
    width: fit-content;
    padding: 10px 30px;
    margin: 10px auto 0;
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

footer {
    position: fixed;
    left: 0;
    bottom: 0;
    width: 100%;
    padding: 2px 10px;
    font-size: 0.6rem;
    color: var(--dark-font-color);
    background-color: var(--bg-color);
    border-top: 1px solid var(--cure-mystique);
    z-index: 2;
}

.flower-header {
    position: absolute;
    scale: 0.2;
    left: -4rem;
    top: -3rem;
    animation: flower 5s linear infinite;
}

.flower-header-right {
    position: absolute;
    scale: 0.2;
    right: -4rem;
    bottom: -3.5rem;
    animation: flower 5s linear infinite reverse;
}

.flower-bottom {
    position: fixed;
    scale: 0.5;
    /* 图片大小是 128x128 */
    left: calc(50% - 64px);
    bottom: -2.5rem;
    animation: flower 15s linear infinite;
    z-index: 1;
}

@keyframes flower {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>
