import CureBookPageDB from "@/share/book_page_db";
import "./reqres_handler";
import CureLogger from "@/share/logger";
import { get_data_from_read_page } from "@/share/target_api";
import { start_debugger, stop_debugger } from "./reqres_handler";
import { start_auto_action, stop_auto_action } from "./auto_action";
import { BookStorageHelper, ExtensionConfigHelper } from "@/share/storage";

const logger = new CureLogger("bg/index");
logger.log("Cure Cure ~\\(≧▽≦)/~");

// #cure-test 测试时应该保留下载的内容，方便后续快速测试 epub、pdf 的生成
if (!__IS_DEV__) {
    chrome.runtime.onInstalled.addListener(() => {
        CureBookPageDB.Instance.remove_all();
    });
}

// #region 让插件只在阅读界面启用

/** 在该标签页禁用插件 */
async function disable_extension(tabId: number) {
    await chrome.action.setTitle({
        title: "只能在书籍阅读页面中启用插件",
        tabId,
    });
    await chrome.action.setIcon({
        path: {
            16: "/icons/icon-16-gray.png",
            32: "/icons/icon-32-gray.png",
            64: "/icons/icon-64-gray.png",
            128: "/icons/icon-128-gray.png",
        },
        tabId,
    });
    await chrome.action.disable(tabId);
}

/** 可以在该标签页启用插件 */
async function enable_extension(tabId: number) {
    // 如果标签页原本不是目标页面，插件被禁止使用
    // 现在调用本方法，就说明进行了刷新等操作，相当于重置了插件的状态了咯
    // 可以忽略一些重置语句
    await chrome.action.enable(tabId);
}

/** 插件下载书籍时，添加一些展示状态
 * - 下载书籍时，on 为 true
 * - 非下载书籍时，on 为 false
 */
async function set_extension_downloading_status(tabId: number, on: boolean) {
    const text = on ? "ON" : "";
    // cure mystique
    const color = on ? "#FE6998" : "#000000";
    await chrome.action.setBadgeText({ text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
}

/** 判断当前网站是否为书籍的阅读页面，如果是，插件才能启用功能哟 */
async function set_extension_status_on_tab(tabId: number, url?: string) {
    if (tabId === chrome.tabs.TAB_ID_NONE) {
        return;
    }

    const { mode, bid } = get_data_from_read_page(url);
    if (bid && (mode === "epub" || mode === "pdf")) {
        await enable_extension(tabId);
    } else {
        await disable_extension(tabId);
    }
}

// #cure-tip 监听标签页更新
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading") {
        await set_extension_status_on_tab(tabId, tab.url);

        // 在开启调试后，如果先【设置插件状态】，那么后续开始自动化时会刷新网页
        // 网页刷新之后就不再显示插件启动的标示了，所以在在这里重新设置一下
        const target = await ExtensionConfigHelper.get_target_tab();
        if (target === tabId) {
            await set_extension_downloading_status(tabId, true);
        }
    }
});

// #cure-tip 监听标签页切换
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(tabId);
    await set_extension_status_on_tab(tabId, tab.url);
});

// #endregion

// #region chat with off screen

/** 使用 off_screen 来打包、下载书籍哟 */
async function init_off_screen() {
    if (!(await chrome.offscreen.hasDocument())) {
        await chrome.offscreen.createDocument({
            url: "/off_screen/index.html",
            // 打包之后需要生成 blob url 嘛
            reasons: ["BLOBS"],
            justification: "gen book download url",
        });
    }
}

async function close_off_screen() {
    await chrome.offscreen.closeDocument();
}

async function start_pack(bid: string, mode: ReadMode) {
    const book_data = await BookStorageHelper.get_book_data(bid);
    if (!book_data) return;

    const data: MsgInBgAndOffScreen = {
        type: "start-pack",
        from: "bg",
        to: "off-screen",
        data: {
            bid,
            mode,
            book_data,
        },
    };

    // 拿到的是最终的下载 url
    const url = await chrome.runtime.sendMessage(data);
    if (!url) {
        logger.error("gen download url failed");
        return;
    }

    const filename = `${book_data.name}(${book_data.author}).${mode}`;
    const downloadId = await chrome.downloads.download({
        url: url,
        filename: __IS_DEV__ ? `test.${mode}` : filename,
        // 测试的时候直接覆盖下载的文件
        conflictAction: __IS_DEV__ ? "overwrite" : undefined,
        saveAs: !__IS_DEV__,
    });
}

// #endregion

// #cure-tip 手动关闭了标签页的调试
chrome.debugger.onDetach.addListener(async (debuggee, reason) => {
    const { tabId } = debuggee;
    if (tabId) {
        CureBookPageDB.Instance.exit_all_conn();
        await set_extension_downloading_status(tabId, false);
        await stop_auto_action();
        await close_off_screen();
        await ExtensionConfigHelper.set_target_tab(null);
        logger.log("debugger detached", tabId);
    }
});

// #cure-core 监听 popup 消息，开启标签页的 debugger
chrome.runtime.onMessage.addListener(
    async (request: MsgInBgAndPopup, sender, sendResponse) => {
        if (request.from !== "popup" || request.to !== "bg") return;

        logger.log("popup message", request);
        switch (request.type) {
            case "start-debugger":
                sendResponse();
                const { tabId, bid } = request.data;
                await start_debugger(tabId);
                await ExtensionConfigHelper.set_target_tab(tabId);

                // #cure-tip 开启监听之后，立即创建数据库，并开启页面自动化翻页
                await CureBookPageDB.Instance.init(bid);
                await start_auto_action(tabId);
                break;
            case "start-pack":
                // #cure-tip 取消监听时需要第一时间断开数据库连接啦
                CureBookPageDB.Instance.exit_conn(request.data.bid);
                await stop_debugger(request.data.tabId);
                await set_extension_downloading_status(
                    request.data.tabId,
                    false,
                );
                await ExtensionConfigHelper.set_target_tab(null);

                await stop_auto_action();
                sendResponse();

                await init_off_screen();
                await start_pack(request.data.bid, request.data.mode);
                await close_off_screen();
                break;
        }
    },
);
