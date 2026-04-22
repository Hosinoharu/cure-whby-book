/** 因为 content scripts 不能使用 ES Module，
 * 所以只好将其独立打包成 iife 格式咯
 */

import path from "path";
import { defineConfig } from "vite";

const outDir = path.resolve(__dirname, "dist/content");

export default defineConfig({
    root: "./src",
    build: {
        rolldownOptions: {
            input: path.resolve(__dirname, "src/content/index.ts"),
            output: {
                entryFileNames: "[name].js",
            },
        },
        outDir,
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
});
