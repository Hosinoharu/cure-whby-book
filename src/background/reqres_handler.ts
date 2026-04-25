/** 拦截请求与响应，完成书籍内容的下载 */

import Protocol from "devtools-protocol";
import CureLogger from "@/share/logger";
import * as target_api from "@/share/target_api";
import { CureWhbyBookManager, PdfModeOnePageManager } from "./book_manager";

const logger = new CureLogger("bg/reqres_handler");
const DEBUG = {
    /** 输出所有捕获到的 cdp 消息 */
    LOG_ALL_CDP_MSG: false,
    /** 输出插件拦截捕获的、原始的响应内容 */
    LOG_CATCH_RESPONSE: false,
    /** 输出保存书籍内容时的日志，比如是第几页等，不会输出要保存的页内容哟 */
    LOG_SAVE_BOOK_CONTENT: true,
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
            // pdf
            target_api.BOOK_PDF_MODE_SPLIT_IMAGE.fetch_req_pattern,
            target_api.BOOK_PDF_MODE_BEFORE_SPLIT_IMAGE.fetch_req_pattern,
            // epub
            target_api.BOOK_EPUB_MODE_ONE_PAGE.fetch_req_pattern,
            target_api.BOOK_EPUB_MODE_PAGE_CSS.fetch_req_pattern,
            target_api.BOOK_EPUB_MODE_PAGE_IMAGE.fetch_req_pattern,
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

// #cure-core 监听 cdp 消息并重写响应
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
        !requestId ||
        !tabId ||
        tabId === chrome.tabs.TAB_ID_NONE ||
        method !== "Fetch.requestPaused"
    ) {
        return;
    }

    // https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#event-requestPaused
    const temp = params as Protocol.Fetch.RequestPausedEvent;

    // request state
    if (!temp.responseStatusCode) {
        await send_fetch_continue_request(tabId, requestId);
    }
    // response state
    else {
        const response = await get_req_response(tabId, requestId);
        // 获取响应内容之后立即放开拦截
        await send_fetch_fulfill_request(tabId, temp);
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
            await handle_response(req_url!, content);
        } catch (e) {
            logger.error("handle response error", e);
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

    if (
        // 在拿到书籍的内容时，不需要再进行一次 base64 decode，直接拿去进行解密处理就好
        target_api.get_data_from_epub_mode_one_page(req_url) ||
        // 拿到 epub 中需要的图片时，也不需要解码
        target_api.get_data_from_epub_mode_page_image(req_url) ||
        // pdf 中的图片也不需要解码
        target_api.get_data_from_pdf_split_image(req_url)
    ) {
        result = false;
    }

    return result;
}

// #endregion

// #region handle response

/** 根据请求链接来处理特定的内容 */
async function handle_response(url: string, content: string) {
    // 因为后期会有大量的关于书籍内容的请求，所以将它放在开头哟，尽可能避免多余的判断
    if (await handle_book_content(url, content)) {
        return;
    }

    // 处理 epub 书籍中的请求的 css、图片等静态文件
    if (await handle_epub_book_assets(url, content)) {
        return;
    }
}

/** 处理 pdf book 中的小图片、以及 epub book 的一页内容
 *
 * 返回 true 表示处理过了
 */
async function handle_book_content(
    url: string,
    content: string,
): Promise<boolean> {
    let handled = false;
    let type: "img" | "before-img" = "img";
    // pdf split img
    let is_pdf = target_api.get_data_from_pdf_split_image(url);
    handled = is_pdf !== null;
    // pdf before split img
    if (!handled) {
        is_pdf = target_api.get_data_from_pdf_before_split_image(url);
        handled = is_pdf !== null;
        if (handled) {
            type = "before-img";
        }
    }

    // pdf mode
    if (is_pdf) {
        const { bid, page, kvalue } = is_pdf;
        if (bid && page && kvalue) {
            await handle_pdf_book_content(
                bid,
                parseInt(page),
                kvalue,
                content,
                type,
            );
        } else {
            logger.error(
                "get book page info from pdf book content url failed. url: ",
                url,
            );
        }
    }
    // epub mode
    else {
        const is_epub = target_api.get_data_from_epub_mode_one_page(url);
        handled = is_epub !== null;
        if (is_epub) {
            const { bid, page, chapter, filename } = is_epub;
            if (bid && page && chapter && filename) {
                await handle_epub_book_content(
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
        }
    }

    return handled;
}

/** 处理流式阅读模式中 epub book 的一页内容 */
async function handle_epub_book_content(
    bid: string,
    page: number,
    chapter: number,
    filename: string,
    content: string,
) {
    DEBUG.LOG_SAVE_BOOK_CONTENT &&
        logger.log(
            "get epub book content",
            "bid:",
            bid,
            ", page:",
            page,
            ", chapter:",
            chapter,
            ", filename:",
            filename,
        );

    await CureWhbyBookManager.save_epub_one_page(
        bid,
        page,
        chapter,
        filename,
        content,
        "xhtml",
    );
}

/** 处理关于 pdf 的内容
 * @param kvalue 请求链接中的 k 参数值
 * @param type  该请求的类型
 * - "img"：访问的是小图片
 * - "before_img"：访问的是小图片的前置请求
 */
async function handle_pdf_book_content(
    bid: string,
    page: number,
    kvalue: string,
    content: string,
    type: "img" | "before-img",
) {
    DEBUG.LOG_SAVE_BOOK_CONTENT &&
        logger.log(
            "get pdf book content.",
            "bid:",
            bid,
            ", page:",
            page,
            ", type:",
            type,
        );

    if (type === "before-img") {
        await PdfModeOnePageManager.Instance.add_before_img_req_info(
            bid,
            page,
            kvalue,
            content,
        );
    } else {
        await PdfModeOnePageManager.Instance.add_img_req_info(
            bid,
            page,
            kvalue,
            content,
        );
    }
}

/** 处理 epub book 中的请求的 css、图片等静态文件 */
async function handle_epub_book_assets(
    url: string,
    content: string,
): Promise<boolean> {
    let handled = false;
    let type: ContentKind = "css";

    // css
    let final_pattern_result = target_api.get_data_from_epub_mode_page_css(url);
    handled = final_pattern_result !== null;
    // image
    if (!handled) {
        final_pattern_result =
            target_api.get_data_from_epub_mode_page_image(url);
        handled = final_pattern_result !== null;
        if (handled) {
            type = "img";
        }
    }

    // 可以统一操作，提取相同的信息
    if (final_pattern_result) {
        const { bid, page, chapter, filename } = final_pattern_result;
        // 额...下面这个缩进、格式，有点费眼睛呀
        if (bid && page && chapter && filename && type) {
            DEBUG.LOG_SAVE_BOOK_CONTENT &&
                logger.log(
                    "get epub book assets",
                    "bid:",
                    bid,
                    ", page:",
                    page,
                    ", chapter:",
                    chapter,
                    ", filename:",
                    filename,
                );

            await CureWhbyBookManager.save_epub_one_page(
                bid,
                parseInt(page),
                parseInt(chapter),
                filename,
                content,
                type,
            );
        } else {
            logger.error("get epub book assets file failed. url: ", url);
        }
    }

    return handled;
}

// #endregion
