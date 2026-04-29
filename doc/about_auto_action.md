这里记录关于插件自动化翻页的部分。

首先明确一个前提：无论何种阅读模式下，都可以按上下键翻页。

# 为什么不插入 JS 来执行自动化

因为通过 JS 触发的自动化是会被检测到的，所以现在决定使用 `chrome devtools protocol` 触发按键（主要是向下按键 `ArrowDown`）来翻页。

此外通过 `chrome.alarms` API 来定时触发书籍的翻页。

# 关于发送 CDP 消息翻页

大概代码如下，关于数字 `40` 的取值见 [KeyboardEvent.keyCode - Web API | MDN](https://developer.mozilla.org/zh-CN/docs/Web/API/KeyboardEvent/keyCode)

```ts
const keydown: Protocol.Input.DispatchKeyEventRequest = {
    type: "keyDown",
    key: "ArrowDown",
    code: "ArrowDown",
    // 这是必须的，有了它才会像真实按键那样触发【按下】
    windowsVirtualKeyCode: 40,
};
await chrome.debugger.sendCommand(
    // ===========================
    // 注意！这个 targetId 很重要
    // ===========================
    { targetId },  
    "Input.dispatchKeyEvent",
    keydown as any,
);
```



虽说是这样但还是有一些很细节的地方。

-   对于 epub 阅读模式下，网站设置了快捷键翻页，所以上面的 `targetId` 就可以取标签页的 `tabId`。
-   对于 pdf 阅读模式下，上述的 `targetId` 必须是 `main frame` 才行，且**必须聚焦到该 frame 上述按键的发送才有效**。

# 总结

无论何种阅读模式，可以统一进行如下操作：

1.   开启下载后，监听请求，再刷新网页，这是为了下载当前页面的内容
2.   启动 `chrome alarms` 定时发送按键到页面
3.   当定时器到达时，**必须先获取到 main frame 的 id**，然后触发**聚焦**，进行翻页
4.   然后重复第 3 步，直到定时器取消 —— 可能是下载成功或失败