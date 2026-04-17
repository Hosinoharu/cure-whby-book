/** 拦截请求与响应，完成书籍的下载 */

import Protocol from "devtools-protocol";
import CureLogger from "@/share/logger";
import * as target_api from "./target_api";
import { CureWhbyBookManager } from "./book_manager";

const logger = new CureLogger("bg/reqres_handler");
const DEBUG = {
    /** 输出所有捕获到的 cdp 消息 */
    LOG_ALL_CDP_MSG: false,
    /** 输出插件拦截捕获的响应内容 */
    LOG_CATCH_RESPONSE: false,
};

/** 监听特定标签页的请求与响应 */
export async function start_debugger(tabId: number) {
    try {
        await chrome.debugger.attach({ tabId }, "1.3");
        await chrome.debugger.sendCommand({ tabId }, "Network.enable");
        // https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-enable
        // #cure-tip 拦截指定的资源
        // 不同阅读模式下，需要拦截的资源不同，这里直接拦截【所有可能需要的资源好了】
        const patterns: Protocol.Fetch.RequestPattern[] = [
            target_api.BOOK_SIMPLE_DATA.fetch_req_pattern,
            // pdf
            target_api.BOOK_PDF_MODE_CATALOG.fetch_req_pattern,
            target_api.BOOK_PDF_MODE_SPLIT_IMAGE.fetch_req_pattern,
            // epub
            target_api.BOOK_EPUB_MODE_CATALOG.fetch_req_pattern,
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
    logger.log("debugger start", tab.title, " - ", tab.url);
    await start_debugger(tab.id);
});

// #cure-tip 监听 cdp 消息并重写响应
chrome.debugger.onEvent.addListener(async (source, method, params) => {
    const req_url: string | undefined = (params as any).request?.url;

    DEBUG.LOG_ALL_CDP_MSG &&
        logger.log(
            "CDP message",
            method,
            "\n\t => request url:",
            req_url,
            "\n\t => cdp msg body:",
            params,
        );

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

        DEBUG.LOG_CATCH_RESPONSE &&
            logger.log(
                "get response content",
                "\n\t => request url:",
                req_url,
                "\n\t => res content:",
                content,
            );

        // #cure-warn 根据响应的 URL、当前阅读模式等等，处理响应内容
        try {
            handle_response(req_url!, content, "stream");
        } catch (e) {
            logger.error("handle response error", e);
        } finally {
            await send_fetch_fulfill_request(tabId, temp);
        }
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

// #region handle response

/** 根据请求链接来处理特定的内容 */
function handle_response(url: string, content: string, mode: ReadMode) {
    // 因为后期会有大量的关于书籍内容的请求，所以将它放在开头哟，尽可能避免多余的判断
    if (handle_book_content(url, content)) {
        return;
    }

    if (handle_book_simple_data(url, content)) {
        return;
    }

    if (handle_book_catalog(url, content)) {
        return;
    }
}

/** 返回 true 表示处理过了 */
function handle_book_simple_data(url: string, content: string) {
    const is_book_simple_data =
        target_api.BOOK_SIMPLE_DATA.urlpattern.exec(url);
    if (is_book_simple_data === null) {
        return false;
    }

    const bid = is_book_simple_data.search.groups["bid"];
    if (bid === undefined) {
        logger.error("get book id from url failed. url: ", url);
        return false;
    }

    if (!CureWhbyBookManager.save_book_simple_data(content)) {
        logger.error("save_book_simple_data failed, content:", content);
    }

    return true;
}

/** 返回 true 表示处理过了 */
function handle_book_catalog(url: string, content: string) {
    let bid: string | undefined = undefined;

    // 从 url 中提取出 bid，从这里也可以判断出当前网站所处的阅读模式？
    const is_book_pdf_catalog =
        target_api.BOOK_PDF_MODE_CATALOG.urlpattern.exec(url);
    // pdf mode
    if (is_book_pdf_catalog !== null) {
        bid = is_book_pdf_catalog.search.groups["bid"];
        if (bid === undefined) {
            logger.error("get book id from pdf catalog url failed. url: ", url);
        }
    }
    // epub mode
    else {
        const is_book_epub_catalog =
            target_api.BOOK_EPUB_MODE_CATALOG.urlpattern.exec(url);
        if (is_book_epub_catalog !== null) {
            bid = is_book_epub_catalog.pathname.groups["bid"];
            if (bid === undefined) {
                logger.error(
                    "get book id from epub catalog url failed. url: ",
                    url,
                );
            }
        }
    }

    if (bid === undefined) {
        return false;
    }

    if (!CureWhbyBookManager.save_book_catalog(bid, content)) {
        logger.error("save_book_catalog failed, content:", content);
    }

    return true;
}

/** 返回 true 表示处理过了 */
function handle_book_content(url: string, content: string) {
    let handled = false;

    const is_pdf_book_content =
        target_api.BOOK_PDF_MODE_SPLIT_IMAGE.urlpattern.exec(url);
    // pdf mode
    if (is_pdf_book_content !== null) {
        const bid = is_pdf_book_content.pathname.groups["bid"];
        const page = is_pdf_book_content.pathname.groups["page"];

        if (bid !== undefined && page !== undefined) {
            handle_pdf_book_content(bid, parseInt(page), content);
        } else {
            logger.error(
                "get book page info from pdf book content url failed. url: ",
                url,
            );
        }

        handled = true;
    }
    // epub mode
    else {
        const is_epub_book_content =
            target_api.BOOK_EPUB_MODE_ONE_PAGE.urlpattern.exec(url);
        if (is_epub_book_content !== null) {
            const bid = is_epub_book_content.pathname.groups["bid"];
            const page = is_epub_book_content.pathname.groups["page"];
            const chapter = is_epub_book_content.pathname.groups["chapter"];
            const filename = is_epub_book_content.pathname.groups["filename"];

            if (
                bid !== undefined &&
                page !== undefined &&
                chapter !== undefined &&
                filename !== undefined
            ) {
                handle_epub_book_content(
                    bid,
                    parseInt(page),
                    parseInt(chapter),
                    filename,
                    content,
                );
            } else {
                logger.error(
                    "get book page info from epub book content url failed. url: ",
                    url,
                );
            }

            handled = true;
        }
    }

    return handled;
}

/** 处理流式阅读模式中 epub book 的一页内容 */
function handle_epub_book_content(
    bid: string,
    page: number,
    chapter: number,
    filename: string,
    content: string,
) {
    logger.log(
        "get epub book content.",
        "bid:",
        bid,
        ", page:",
        page,
        ", chapter:",
        chapter,
        ", filename:",
        filename,
    );
}

function handle_pdf_book_content(bid: string, page: number, content: string) {
    logger.log("get pdf book content.", "bid:", bid, ", page:", page);
}

// #endregion
