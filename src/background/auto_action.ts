/** 插件的自动化操作，让网页翻页，从而触发书籍内容的加载
 *
 * 关于自动化的设计见 `doc/about_auto_action.md` 文档
 */

import CureLogger from "@/share/logger";
import { ExtensionConfigHelper } from "@/share/storage";
import Protocol from "devtools-protocol";

const logger = new CureLogger("bg/auto_action");
const alarm_name = "auto_action";
/** 按下翻页键后保持一定时间后再释放，单位是毫秒 */
const hold_timeout = 2000;
/** 实现按键长按时，发送 key event 的间隔，单位是毫秒，数值越小翻得越快 */
const send_key_event_speed = 200;
/** 定时器的间隔，默认是 3s，但注意还要保持按键哟 */
const period_in_minutes = (3 + hold_timeout / 1000) / 60;

/** 触发一次键盘的向下方向键 */
async function press_arrow_down_key(targetId: string) {
    await press_key(targetId, "ArrowDown", 40, hold_timeout);
}

/** 完整的触发一次按键，包括：keydown 和 keyup
 *
 * @param release_timeout 按键释放的时间，单位是毫秒
 */
async function press_key(
    targetId: string,
    key: string,
    key_code: number,
    release_timeout: number,
) {
    try {
        const keydown: Protocol.Input.DispatchKeyEventRequest = {
            type: "keyDown",
            code: key,
            key,
            windowsVirtualKeyCode: key_code,
        };

        const start_time = Date.now();
        while (Date.now() - start_time < release_timeout) {
            await chrome.debugger.sendCommand(
                { targetId },
                "Input.dispatchKeyEvent",
                keydown as any,
            );
            await new Promise((resolve) =>
                setTimeout(resolve, send_key_event_speed),
            );
        }

        const keyup: Protocol.Input.DispatchKeyEventRequest = {
            type: "keyUp",
            code: key,
            key,
            windowsVirtualKeyCode: key_code,
        };
        await chrome.debugger.sendCommand(
            { targetId },
            "Input.dispatchKeyEvent",
            keyup as any,
        );
    } catch (e) {
        logger.error("press_key error", "key:", key, ", error: ", e);
    }
}

/** 当开启下载后，就需要进行自动化翻页了，不同模式下有不同的翻页方式 */
export async function start_auto_action(tabId: number) {
    await chrome.tabs.reload(tabId);
    // #cure-tip 创建定时器，3s 触发一次
    await chrome.alarms.create(alarm_name, {
        // 等待网页加载完成
        // 这其实不稳妥，如果网页加载时间过长，则依然无用
        delayInMinutes: 0.05,
        periodInMinutes: period_in_minutes,
    });
}

/** 停止翻页等自动化操作 */
export async function stop_auto_action() {
    await chrome.alarms.clear(alarm_name);
}

/** 根据当前调试的标签页，获取其 main frame 的 targetId */
async function get_main_frame(tabId: number) {
    const result = await chrome.debugger.getTargets();
    const target = result.find(
        (item) => item.attached && item.type === "page" && item.tabId === tabId,
    );
    // target && logger.log("get_main_frame", target);
    return target?.id;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    const tabId = await ExtensionConfigHelper.get_target_tab();
    if (tabId) {
        const targetId = await get_main_frame(tabId);
        targetId && (await press_arrow_down_key(targetId));
    }
});
