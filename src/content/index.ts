import CureLogger from "@/share/logger";

const ext_name = chrome.runtime.getManifest().name;
const logger = new CureLogger(`${ext_name}/content`);
const DEBUG = {
    /** 输出接收到的消息 */
    LOG_GET_MSG: true,
};

chrome.runtime.onMessage.addListener(
    async (message: MsgInBgAndContent, sender, sendResponse) => {
        DEBUG.LOG_GET_MSG && logger.log("get message", message);
        switch (message.type) {
            case "set-auto":
                message.data.mode === "epub"
                    ? await action_in_epub_mode(message.data.on)
                    : action_in_pdf_mode(message.data.on);
                break;
        }
    },
);

// #region 自动化操作

/** epub 阅读模式下的自动化计时器的 id */
let epub_interval = 0;
/** 翻页需要触发的事件 */
const epub_right_event = new KeyboardEvent("keyup", {
    // 经过测试，网站是检测 keyCode 触发的翻页
    key: "ArrowRight",
    code: "ArrowRight",
    keyCode: 39,
    which: 39,
});
const epub_left_event = new KeyboardEvent("keyup", {
    key: "ArrowLeft",
    code: "ArrowLeft",
    keyCode: 37,
    which: 37,
});

/** pdf 阅读模式下的自动化计时器的 id */
let pdf_interval = 0;

const interval_time = 3000;

/** epub 阅读模式下，按左右方向键翻页哟 */
async function action_in_epub_mode(on: boolean) {
    if (on) {
        await init_action_in_epub_mode();
        // 然后持续向右翻页
        epub_interval = setInterval(() => {
            document.dispatchEvent(epub_right_event);
        }, interval_time) as any;
    } else {
        clearInterval(epub_interval);
    }
}

/** 为了能下载当前页面，不选择刷新页面，而是
 * 【先向右翻页，然后翻回来，从而下载当前页面哟】
 */
async function init_action_in_epub_mode() {
    document.dispatchEvent(epub_right_event);
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            document.dispatchEvent(epub_left_event);
            resolve();
        }, interval_time);
    });
}

function action_in_pdf_mode(on: boolean) {
    //
}

// #endregion
