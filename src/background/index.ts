import CureBookPageDB from "@/share/book_page_db";
import "./reqres_handler";
import CureLogger from "@/share/logger";

new CureLogger("Cure Whby Book").log("Cure Cure ~\\(≧▽≦)/~");

// #cure-tip 测试时应该保留下载的内容，方便后续快速测试 epub 打包
// 安装时创建数据库
chrome.runtime.onInstalled.addListener(() => {
    CureBookPageDB.Instance.remove();
    CureBookPageDB.Instance;
});
