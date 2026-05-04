/** 本配置用于调试 popup page 的 ui
 *
 * 使用 `npm run dev-popup` 启动调试
 */

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig({
    root: __dirname,
    define: {
        __IS_DEV__: true,
        __IS_DEV_UI__: true,
    },
    plugins: [vue()],
    build: {
        write: false,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "../"),
        },
    },
});
