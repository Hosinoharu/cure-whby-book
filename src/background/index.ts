import CureBookPageDB from "@/share/book_page_db";
import "./reqres_handler";
import CureLogger from "@/share/logger";
import { get_data_from_read_page } from "@/share/target_api";

const logger = new CureLogger("Cure Whby Book");
logger.log("Cure Cure ~\\(≧▽≦)/~");

// #cure-tip 测试时应该保留下载的内容，方便后续快速测试 epub 打包
// 安装时创建数据库
chrome.runtime.onInstalled.addListener(() => {
    CureBookPageDB.Instance.remove_all();
});

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

/** 在该标签页启用插件 */
async function enable_extension(tabId: number) {
    // 如果标签页原本不是目标页面，插件被禁止使用
    // 现在调用本方法，就说明进行了刷新等操作，相当于重置了插件的状态了咯
    // 可以忽略下面的重置语句
    // await chrome.action.setTitle({ title: "", tabId });
    // await chrome.action.setIcon({
    //     path: {
    //         16: "/icons/icon-16.png",
    //         32: "/icons/icon-32.png",
    //         64: "/icons/icon-64.png",
    //         128: "/icons/icon-128.png",
    //     },
    //     tabId,
    // });
    await chrome.action.enable(tabId);
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
    }
});

// #cure-tip 监听标签页切换
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(tabId);
    await set_extension_status_on_tab(tabId, tab.url);
});

// #endregion
