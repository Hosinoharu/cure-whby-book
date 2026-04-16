/** 拦截请求与响应，完成书籍的下载 */

import Protocol from "devtools-protocol";
import CureLogger from "./logger";
import * as target_api from "./target_api";

const logger = new CureLogger("bg/reqres_handler");

/** 监听特定标签页的请求与响应 */
export async function start_debugger(tabId: number) {
    try {
        await chrome.debugger.attach({ tabId }, "1.3");
        await chrome.debugger.sendCommand({ tabId }, "Network.enable");
        // https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-enable
        // #cure-tip 拦截指定的资源
        // 不同阅读模式下，需要拦截的资源不同，这里直接拦截【所有可能需要的资源好了】
        const patterns: Protocol.Fetch.RequestPattern[] = [
            target_api.BOOK_INFO.fetch_req_pattern,
            target_api.BOOK_CATALOG.fetch_req_pattern,
            target_api.BOOK_EPUB_MODE_ONE_PAGE.fetch_req_pattern,
        ];
        await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
            patterns,
        });
    } catch (e: any) {
        if (!e.message.includes("Another debugger is already attached")) {
            logger.error("start_debugger error", e.message);
        }
    }
}

export async function stop_debugger(tabId: number) {
    try {
        await chrome.debugger.detach({ tabId });
    } catch {}
}

// #cure--test 点击图标启动调试来进行测试
chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) {
        return;
    }
    logger.log("debugger start");
    await start_debugger(tab.id);
});

// #cure-tip 监听 cdp 消息并重写响应
chrome.debugger.onEvent.addListener(async (source, method, params) => {
    const req_url: string | undefined = (params as any).request?.url;

    // logger.log(
    //     "CDP message",
    //     method,
    //     "\n\t => request url:",
    //     req_url,
    //     "\n\t => cdp msg body:",
    //     params,
    // );

    const tabId = source.tabId;
    const requestId = (params as any).requestId as string;

    if (
        requestId === undefined ||
        tabId === undefined ||
        tabId === chrome.tabs.TAB_ID_NONE ||
        method !== "Fetch.requestPaused"
    ) {
        return;
    }

    // https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#event-requestPaused
    const temp = params as Protocol.Fetch.RequestPausedEvent;

    // request state
    if (temp.responseStatusCode === undefined) {
        await send_fetch_continue_request(tabId, requestId);
    }
    // response state
    else {
        const response = await get_req_response(tabId, requestId);
        const content = should_decode_res(req_url!)
            ? base64_decode_to_utf8(response.body)
            : response.body;

        logger.log(
            "get response content",
            "\n\t => request url:",
            req_url,
            "\n\t => res content:",
            content,
        );

        await send_fetch_fulfill_request(tabId, temp);
    }
});

// #region cdp helper functions

// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-continueRequest
async function send_fetch_continue_request(tabId: number, requestId: string) {
    const data: Protocol.Fetch.ContinueRequestRequest = {
        requestId,
    };
    await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.continueRequest",
        data as any,
    );
}

// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-getResponseBody
async function get_req_response(tabId: number, requestId: string) {
    const data = (await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.getResponseBody",
        {
            requestId,
        },
    )) as Protocol.Fetch.GetResponseBodyResponse;

    return data;
}

// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-fulfillRequest
/** 放开对响应的拦截
 * @param body 如果要重写响应，其必须是 base64 encode 的数据
 */
async function send_fetch_fulfill_request(
    tabId: number,
    param: Protocol.Fetch.RequestPausedEvent,
    body?: string,
) {
    const data: Protocol.Fetch.FulfillRequestRequest = {
        requestId: param.requestId,
        responseCode: param.responseStatusCode || 200,
        responseHeaders: param.responseHeaders,
        body,
    };
    await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.fulfillRequest",
        data as any,
    );
}

/** base64 decode and to utf8 */
function base64_decode_to_utf8(str: string) {
    const decoded = atob(str);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
    }
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    return utf8;
}

/** 根据实际请求的内容来决定是否转换 base64 编码 */
function should_decode_res(req_url: string) {
    let result = true;

    // 在拿到书籍的内容时，不需要再进行一次 base64 decode，直接拿去进行解密处理就好
    // 其它的情况中，大都是需要转换的，比如获取书籍的信息
    if (target_api.BOOK_EPUB_MODE_ONE_PAGE.urlpattern.test(req_url)) {
        result = false;
    }

    return result;
}

// #endregion
