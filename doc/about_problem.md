这里记录遇到的问题。

# 插件访问书籍信息的 API

在书籍阅读页面，如 `https://wqbook.wqxuetang.com/book/3244419` 页面会访问一个 API `https://wqbook.wqxuetang.com/api/v7/book/initbook?bid=3244419`（称之为 `initbook API`，它可以获取书籍的信息，**但关于书籍的总页数则出现问题**：

- 如果该书籍**只有**原貌阅读模式，则上述接口中的【书籍总页数】是正确的
- 如果该书籍有流式阅读模式，那么上述接口中的【书籍总页数】是对应的 Epub 的

所以，如果想要获取 PDF 格式正确的总页数，需要访问书籍阅读页 `https://wqbook.wqxuetang.com/deep/read/pdf?bid=3244419`，其中有一个 API `https://wqbook.wqxuetang.com/api/v7/read/initread?bid=3244419`（称之为 `initread API`）才能得到正确的 API。

所以，我想用插件直接请求该 `initread API`，但是该插件要想获取正确的数据，**需要为请求添加 Referer 字段**，而插件使用 `fetch API` 发送请求时，根本不能添加 Referer 字段，相关讨论在[在 Chrome 扩展开发中使用 fetch() ，无法设置 Referer头。问题解决方案 - 开发调优 - LINUX DO](https://linux.do/t/topic/3984)

综上：为了获取书籍的信息，需要访问 `initbook API`，为了获取当前阅读模式下书籍的正确页数，则需要访问 `initread API`。

这下本插件要的权限可就多了。
