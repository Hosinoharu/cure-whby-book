import CureLogger from "@/share/logger";

const logger = new CureLogger("content");

chrome.runtime.onMessage.addListener(
    (message: MsgInBgAndContent, sender, sendResponse) => {
        logger.log("get message", message);
        switch (message.type) {
            case "set-auto":
                message.data.mode === "epub"
                    ? action_in_epub_mode(message.data.on)
                    : action_in_pdf_mode(message.data.on);
                break;
        }
    },
);

// #region 自动化操作

/** epub 阅读模式下的自动化计时器的 id */
let epub_interval = 0;
/** 翻页需要触发的事件 */
const epub_event = new KeyboardEvent("keyup", {
    // 经过测试，网站是检测 keyCode 触发的翻页
    key: "ArrowRight",
    code: "ArrowRight",
    keyCode: 39,
    which: 39,
});

/** pdf 阅读模式下的自动化计时器的 id */
let pdf_interval = 0;

const interval_time = 3000;

/** epub 阅读模式下，按左右方向键翻页哟 */
function action_in_epub_mode(on: boolean) {
    if (on) {
        epub_interval = setInterval(() => {
            document.dispatchEvent(epub_event);
        }, interval_time) as any;
        logger.log("interval start", "in epub mode");
    } else {
        clearInterval(epub_interval);
        logger.log("interval stop", "in epub mode");
    }
}

function action_in_pdf_mode(on: boolean) {
    //
}

// #endregion
