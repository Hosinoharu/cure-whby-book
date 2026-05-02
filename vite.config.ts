import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const outDir = path.resolve(__dirname, "dist");

export default defineConfig(({ mode }) => ({
    root: "./src",
    define: {
        __IS_DEV__: mode === "dev",
        __IS_DEV_UI__: false,
    },
    plugins: [
        vue(),
        vite_plugin_copy_files(outDir, [
            {
                from: path.resolve(__dirname, "manifest.json"),
                to: ".",
            },
            {
                from: path.resolve(__dirname, "icons"),
                to: "icons",
            },
        ]),
    ],
    build: {
        rolldownOptions: {
            input: {
                service_worker: path.resolve(
                    __dirname,
                    "src/background/index.ts",
                ),
                popup: path.resolve(__dirname, "src/popup/index.html"),
            },
            output: {
                entryFileNames: (chunk_info) => {
                    let prefix = "";
                    if (chunk_info.name === "service_worker") {
                        prefix = "background/";
                    } else if (chunk_info.name === "popup") {
                        prefix = "popup/";
                    }
                    return prefix + "[name].js";
                },
                manualChunks(id) {
                    if (id.includes("node_modules")) {
                        const name = id
                            .toString()
                            .split("node_modules/")[1]
                            ?.split("/")[0];
                        return "lib/" + (name || "vendor");
                    }
                },
                chunkFileNames: (chunk_info) => {
                    const prefix = chunk_info.name.startsWith("lib/")
                        ? ""
                        : "lib/";
                    return prefix + "[name].js";
                },
                // 只有 popup page 才会这些东西哟
                assetFileNames: "popup/[name].[ext]",
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
}));

// #region vite plugin copy files

type CopyOptions = {
    /** 如果是文件，则复制该文件；如果是目录，则复制其下面的所有文件（包括子目录） */
    from: string;
    /** 这个路径是相对于插件根目录的。比如 `to` 值为 `xx/yy`，
     * 那么最终将上述的文件都复制到 `插件根目录/xx/yy` 目录下。
     */
    to: string;
    /** 当复制文件时，可以指定一个新名字哟 */
    new_filename?: string;
};

/** 实现一个简略的 vite 插件，用于将 `manifest.json`、`icons` 等静态文件
 * 静态文件打包到插件下面的指定的目录哟。
 *
 * @param extension_out_dir 插件的输出目录。
 * @param option 指定要复制的文件（目录），以及输出目录。
 */
export function vite_plugin_copy_files(
    extension_out_dir: string,
    option: CopyOptions[],
) {
    /** 复制文件到指定目录 */
    function copy_one_file(
        filepath: string,
        des: string,
        new_filename?: string,
    ) {
        if (!fs.existsSync(filepath)) {
            console.error("[copy] file not found:", filepath);
            return;
        }
        if (!fs.existsSync(des)) {
            fs.mkdirSync(des, { recursive: true });
            console.log(`[copy] create destination dir:`, des);
        }

        const filename = new_filename ?? path.basename(filepath);
        try {
            fs.copyFileSync(filepath, path.join(des, filename));
            console.log(`[copy] file <${filename}> to:`, des);
        } catch (e) {
            console.error(`[copy] file <${filename}> failed:`, e);
        }
    }

    /** 复制一个目录下的所有文件到指定目录 */
    function copy_one_dir(dir: string, des: string) {
        if (!fs.existsSync(dir)) {
            console.error("[copy] file not found:", dir);
            return;
        }
        if (!fs.existsSync(des)) {
            fs.mkdirSync(des, { recursive: true });
            console.log(`[copy] create destination dir:`, des);
        }

        // 读取目录下所有的文件，对于文件则直接复制，对于目录则递归调用
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            if (fs.statSync(filepath).isDirectory()) {
                return copy_one_dir(filepath, path.join(des, file));
            }
            copy_one_file(filepath, des);
        }
    }

    return {
        name: "vite-plugin-copy-files",

        closeBundle() {
            for (const opt of option) {
                const des = path.join(extension_out_dir, opt.to);
                if (fs.statSync(opt.from).isDirectory()) {
                    copy_one_dir(opt.from, des);
                } else {
                    copy_one_file(opt.from, des, opt.new_filename);
                }
            }
        },
    };
}

// #endregion
