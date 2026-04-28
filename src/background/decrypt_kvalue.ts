// @ts-nocheck
/** 本部分代码取自网页 */

import { BOOK_HOST } from "@/share/target_api";
import CureLogger from "@/share/logger";

const logger = new CureLogger("bg/decrypt_kvalue");
const DEBUG = {
    /** 输出获取到的、用于解密的 key */
    LOG_KEY: false,
};

class R {
    constructor(e) {
        ((this.wasmModule = null),
            (this.exports = null),
            (this.memory = null),
            (this.isInitialized = !1),
            (this._initPromise = null),
            (this.KEY_SIZE = 32),
            (this.NONCE_SIZE = 12),
            (this.BLOCK_SIZE = 64),
            (this.DEFAULT_COUNTER = 1));
    }
    async ready(e) {
        this._autoInit(e);
        if (
            (this._initPromise && (await this._initPromise),
            !this.isInitialized)
        )
            throw new Error("WASM模块未初始化");
    }
    _checkInitialized() {
        return !!this.isInitialized;
    }
    _autoInit(e) {
        try {
            e.startsWith("/") || e.startsWith("http")
                ? (this._initPromise = this._initFromUrl(e))
                : (this._initPromise = this._initFromBase64(e));
        } catch (e) {
            this._initPromise = Promise.reject(e);
        }
    }
    async _initFromBase64(e) {
        try {
            var t,
                A,
                n,
                r,
                i = atob(e),
                o = new Uint8Array(i.length);
            for (let e = 0; e < i.length; e++) o[e] = i.charCodeAt(e);
            if (o)
                return (
                    (t = {
                        env: {
                            get_gf: () => this._getGf(),
                        },
                    }),
                    (this.wasmModule = await WebAssembly.instantiate(o, t)),
                    (this.exports = this.wasmModule.instance.exports),
                    (this.memory = this.exports.memory),
                    this._validateExports(),
                    "function" == typeof this.exports.get_gf_staging &&
                        ((A = this.exports.get_gf_staging()),
                        (n = Number(0xffffffffn & A)),
                        (r = Number((A >> 32n) & 0xffffffffn)),
                        (this.stagingPtr = n >>> 0),
                        (this.stagingCap = r >>> 0)),
                    (this.isInitialized = !0),
                    o
                );
            this.isInitialized = !1;
        } catch (e) {
            return null;
        }
    }
    async _initFromUrl(e) {
        try {
            var t = await fetch(e);
            if (!t.ok) throw new Error(`HTTP ${t.status}: ` + t.statusText);
            var A,
                n,
                r,
                i,
                o = await t.arrayBuffer();
            o
                ? ((A = {
                      env: {
                          get_gf: () => this._getGf(),
                      },
                  }),
                  (this.wasmModule = await WebAssembly.instantiate(o, A)),
                  (this.exports = this.wasmModule.instance.exports),
                  (this.memory = this.exports.memory),
                  this._validateExports(),
                  "function" == typeof this.exports.get_gf_staging &&
                      ((n = this.exports.get_gf_staging()),
                      (r = Number(0xffffffffn & n)),
                      (i = Number((n >> 32n) & 0xffffffffn)),
                      (this.stagingPtr = r >>> 0),
                      (this.stagingCap = i >>> 0)),
                  (this.isInitialized = !0))
                : (this.isInitialized = !1);
        } catch (e) {
            return null;
        }
    }
    _validateExports() {
        if (!this.exports || !this.exports.memory)
            throw new Error("缺少memory导出");
        this.exports.run;
    }
    _getGf() {
        try {
            var e,
                t = this.exports.memory,
                A =
                    ((0 != (0 | this.stagingPtr) &&
                        0 != (0 | this.stagingCap)) ||
                        ("function" == typeof this.exports.get_gf_staging &&
                            ((e = this.exports.get_gf_staging()),
                            (this.stagingPtr = Number(0xffffffffn & e) >>> 0),
                            (this.stagingCap =
                                Number((e >> 32n) & 0xffffffffn) >>> 0))),
                    (this.stagingPtr >>> 0) + (this.stagingCap >>> 0) + 16),
                n = t.buffer.byteLength,
                r =
                    (n < A && t.grow(Math.ceil((A - n) / 65536)),
                    new TextEncoder().encode(this._getGfStringFromCookie())),
                i = Math.min(r.length, this.stagingCap >>> 0);
            return (
                new Uint8Array(t.buffer, this.stagingPtr >>> 0, i).set(
                    r.subarray(0, i),
                ),
                i
            );
        } catch {
            return -1;
        }
    }
    _getGfStringFromCookie() {
        let e = "";
        var t;
        return (e =
            "undefined" != typeof document &&
            "string" == typeof document.cookie &&
            ((t = String.fromCharCode(103, 105, 100, 102).replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
            )),
            (t = new RegExp("(?:^|;\\s*)" + t + "=([^;]*)")),
            (t = document.cookie.match(t)))
                ? decodeURIComponent(t[1])
                : e);
    }
    _toUint8Array(e) {
        if ("string" == typeof e) return new TextEncoder().encode(e);
        if (e instanceof ArrayBuffer) return new Uint8Array(e);
        if (e instanceof Uint8Array) return e;
        throw new Error(
            "不支持的数据类型，请使用string、ArrayBuffer或Uint8Array",
        );
    }
    generateKey() {
        this._checkInitialized();
        var e = new Uint8Array(this.KEY_SIZE);
        return (crypto.getRandomValues(e), e);
    }
    generateNonce() {
        this._checkInitialized();
        var e = new Uint8Array(this.NONCE_SIZE);
        return (crypto.getRandomValues(e), e);
    }
    _ensureMemory(e) {
        var e = 4096 + e + this.KEY_SIZE + this.NONCE_SIZE + 2048,
            t = this.memory.buffer.byteLength / 65536,
            e = Math.ceil(e / 65536);
        return (
            t < e && this.memory.grow(e - t),
            this.memory.buffer.byteLength
        );
    }
    _cryptOperation(t, A, n, r, i) {
        if (
            (this._checkInitialized(),
            (A = A || new Uint8Array(this.KEY_SIZE)),
            (n = n || new Uint8Array(this.NONCE_SIZE)),
            A && A.length !== this.KEY_SIZE)
        )
            throw new Error(
                `密钥长度必须为${this.KEY_SIZE}字节，当前为${A.length}字节`,
            );
        if (n && n.length !== this.NONCE_SIZE)
            throw new Error(
                `Nonce长度必须为${this.NONCE_SIZE}字节，当前为${n.length}字节`,
            );
        if (0 === t.length) return new Uint8Array(0);
        this._ensureMemory(t.length);
        var e = 4096,
            o = e + t.length + 1024,
            a = o + this.KEY_SIZE + 256;
        if ("function" == typeof this.exports.run) {
            let e = "number" == typeof i ? i >>> 0 : this.DEFAULT_COUNTER >>> 0;
            var c = 1 + this.KEY_SIZE + this.NONCE_SIZE + 4 + t.length,
                c = new Uint8Array(c),
                s = 0,
                g =
                    ((c[s++] = 0),
                    c.set(A, 1),
                    (s += this.KEY_SIZE),
                    c.set(n, s),
                    (s += this.NONCE_SIZE),
                    new DataView(c.buffer, s, 4).setUint32(0, e, !0),
                    c.set(t, (s += 4)),
                    (4 + (s = (3 + ((4096 + c.length) >>> 0)) & -4)) >>> 0),
                c =
                    (this._ensureMemory(g + t.length + 64),
                    new Uint8Array(this.memory.buffer, 4096, c.length).set(c),
                    new DataView(this.memory.buffer, s, 4).setUint32(
                        0,
                        t.length >>> 0,
                        !0,
                    ),
                    this.exports.run(4096, c.length >>> 0, g >>> 0, s >>> 0));
            if (0 !== c)
                throw (
                    (c = new DataView(this.memory.buffer, s, 4).getUint32(
                        0,
                        !0,
                    )),
                    new Error(`${r ? "加密" : "解密"}失败: 容量不足，需要 ` + c)
                );
            c = new DataView(this.memory.buffer, s, 4).getUint32(0, !0);
            return new Uint8Array(this.memory.buffer, g, c).slice();
        }
        ((s = new Uint8Array(this.memory.buffer)),
            s.set(t, e),
            s.set(A, o),
            s.set(n, a),
            (g = r
                ? this.exports.chacha20_encrypt
                : this.exports.chacha20_decrypt));
        let l = "number" == typeof i ? i : this.DEFAULT_COUNTER;
        c = g(e, t.length, o, a, l);
        if (0 !== c)
            throw new Error(`${r ? "加密" : "解密"}操作失败，错误码: ` + c);
        A = new Uint8Array(this.memory.buffer);
        return new Uint8Array(A.slice(e, e + t.length));
    }
    encrypt(e, t, A, n = this.DEFAULT_COUNTER) {
        e = this._toUint8Array(e);
        return this._cryptOperation(e, t, A, !0, n);
    }
    decrypt(e, t, A, n = this.DEFAULT_COUNTER) {
        return this._cryptOperation(e, t, A, !1, n);
    }
    encryptText(e, t, A, n = 1) {
        e = this.encrypt(e, t, A, n);
        return btoa(String.fromCharCode(...e));
    }
    decryptText(e, t, A, n = 1) {
        ((e = new Uint8Array(
            atob(e)
                .split("")
                .map((e) => e.charCodeAt(0)),
        )),
            (e = this.decrypt(e, t, A, n)));
        return new TextDecoder().decode(e);
    }
    encryptJSON(e, t, A) {
        e = JSON.stringify(e);
        return this.encryptText(e, t, A);
    }
    decryptJSON(e, t, A) {
        e = this.decryptText(e, t, A);
        return JSON.parse(e);
    }
    async getGfByRun(e = 256) {
        if (!this._checkInitialized()) throw new Error("WASM 未初始化");
        if ("function" != typeof this.exports.run)
            throw new Error("加载错误，请检查wasm文件");
        var t,
            A = new Uint8Array([1]),
            n = (4 + (t = (3 + ((16384 + A.length) >>> 0)) & -4)) >>> 0;
        new Uint8Array(this.memory.buffer, 16384, A.length).set(A);
        let r = Math.max(64, e >>> 0);
        for (let e = 0; e < 4; e++) {
            (this._ensureMemory(n + r + 64),
                new DataView(this.memory.buffer, t, 4).setUint32(
                    0,
                    r >>> 0,
                    !0,
                ));
            var i,
                o = this.exports.run(16384, A.length >>> 0, n >>> 0, t >>> 0),
                a = new DataView(this.memory.buffer, t, 4).getUint32(0, !0);
            if (0 === o)
                return (
                    (i = new Uint8Array(this.memory.buffer, n, a)),
                    new TextDecoder().decode(i)
                );
            if (a <= r) throw new Error(`get_gf 失败，rc=${o}，need=` + a);
            r = Math.min(Math.max(a, 2 * r), 1 << 20);
        }
        throw new Error("get_gf 失败：多次扩容仍不足");
    }
    async setGf(e, t = 256) {
        if (!this._checkInitialized()) throw new Error("WASM 未初始化");
        if ("function" != typeof this.exports.run)
            throw new Error("当前 wasm 未暴露 run 接口");
        var A,
            e =
                "string" == typeof e && e.startsWith("::XO::")
                    ? e
                    : R.utils.xo(String(e || "")),
            e = new TextEncoder().encode(e),
            n = new Uint8Array(1 + e.length),
            r =
                ((n[0] = 1),
                n.set(e, 1),
                (4 + (A = (3 + ((32768 + n.length) >>> 0)) & -4)) >>> 0);
        let i = Math.max(64, t >>> 0);
        for (let e = 0; e < 4; e++) {
            (this._ensureMemory(r + i + 64),
                new Uint8Array(this.memory.buffer, 32768, n.length).set(n),
                new DataView(this.memory.buffer, A, 4).setUint32(
                    0,
                    i >>> 0,
                    !0,
                ));
            var o = this.exports.run(32768, n.length >>> 0, r >>> 0, A >>> 0),
                a = new DataView(this.memory.buffer, A, 4).getUint32(0, !0);
            if (0 === o) return;
            if (a <= i) throw new Error(`setGf 失败，rc=${o}，need=` + a);
            i = Math.min(Math.max(a, 2 * i), 1 << 20);
        }
        throw new Error("setGf 失败：多次扩容仍不足");
    }
    async decryptDeep(e, t = "uint8array", A) {
        if (!this._checkInitialized()) throw new Error("WASM 未初始化");
        if ("function" != typeof this.exports.run)
            throw new Error("当前 wasm 未暴露 run 接口");
        if ("string" != typeof e) throw new Error("base64Text 必须为字符串");
        var n,
            e = e.trim().replace(/^data:.*?;base64,/, ""),
            r = new TextEncoder().encode(e),
            i = new Uint8Array(1 + r.length),
            o =
                ((i[0] = 0),
                i.set(r, 1),
                (4 + (n = (3 + ((49152 + i.length) >>> 0)) & -4)) >>> 0),
            r = 3 * Math.ceil(e.length / 4);
        let a = Math.max(64 + r, A >>> 0 || 0) || 1024;
        for (let e = 0; e < 4; e++) {
            (this._ensureMemory(o + a + 64),
                new Uint8Array(this.memory.buffer, 49152, i.length).set(i),
                new DataView(this.memory.buffer, n, 4).setUint32(
                    0,
                    a >>> 0,
                    !0,
                ));
            var c = this.exports.run(49152, i.length >>> 0, o >>> 0, n >>> 0),
                s = new DataView(this.memory.buffer, n, 4).getUint32(0, !0);
            if (0 === c)
                return (
                    (c = new Uint8Array(this.memory.buffer, o, s)),
                    "string" === t ? new TextDecoder().decode(c) : c.slice()
                );
            a = Math.min(Math.max(s > a ? s : 2 * a, 1024), 1 << 22);
        }
        throw new Error("decryptDeep 失败：多次扩容仍不足");
    }
    createEncryptedPackage(e, t = null, A = null) {
        ((t = t || this.generateKey()),
            (A = A || this.generateNonce()),
            (e = this.encrypt(e, t, A)));
        return {
            data: btoa(String.fromCharCode(...e)),
            key: "",
            nonce: btoa(String.fromCharCode(...A)),
            algorithm: "ChaCha20",
            timestamp: Date.now(),
            version: "1.0.0",
        };
    }
    decryptPackage(e, t = "uint8array", A) {
        var n = new Uint8Array(
            atob(e.data)
                .split("")
                .map((e) => e.charCodeAt(0)),
        );
        if (!A) throw new Error("解密需要外部提供密钥");
        var e = new Uint8Array(
                atob(e.nonce)
                    .split("")
                    .map((e) => e.charCodeAt(0)),
            ),
            r = this.decrypt(n, A, e);
        switch (t) {
            case "string":
                return new TextDecoder().decode(r);
            case "json":
                return JSON.parse(new TextDecoder().decode(r));
            default:
                return r;
        }
    }
}
R.utils = {
    bytesToHex(e) {
        return Array.from(e)
            .map((e) => e.toString(16).padStart(2, "0"))
            .join("");
    },
    hexToBytes(t) {
        var A = new Uint8Array(t.length / 2);
        for (let e = 0; e < t.length; e += 2)
            A[e / 2] = parseInt(t.substr(e, 2), 16);
        return A;
    },
    bytesEqual(e, A) {
        return e.length === A.length && e.every((e, t) => e === A[t]);
    },
    base64ToBytes(e) {
        if ("undefined" != typeof Buffer)
            return Uint8Array.from(Buffer.from(e, "base64"));
        var t = atob(e),
            A = new Uint8Array(t.length);
        for (let e = 0; e < t.length; e++) A[e] = t.charCodeAt(e);
        return A;
    },
    bytesToBase64(t) {
        if ("undefined" != typeof Buffer)
            return Buffer.from(t).toString("base64");
        let A = "";
        for (let e = 0; e < t.length; e++) A += String.fromCharCode(t[e]);
        return btoa(A);
    },
    base64ToArrayBuffer(e) {
        return R.utils.base64ToBytes(e).buffer;
    },
    xo(n) {
        var r = "::XO::";
        if (n.startsWith(r)) {
            var i = R.utils.base64ToBytes(n.slice(r.length));
            if (0 === i.length) return "";
            let e = i[0];
            var o = i.subarray(1);
            let t = new Uint8Array(o.length),
                A = e >>> 0;
            for (let e = 0; e < o.length; e++) {
                var a = o[e] ^ A;
                ((t[e] = a), (A = a));
            }
            return new TextDecoder().decode(t);
        }
        var t = new TextEncoder().encode(n);
        let A = 0;
        for (let e = 0; e < t.length; e++) A = (A + t[e]) & 255;
        let c = new Uint8Array(1 + t.length),
            s = (c[0] = A) >>> 0;
        for (let e = 0; e < t.length; e++) {
            var g = t[e] ^ s;
            ((c[1 + e] = g), (s = t[e]));
        }
        return r + R.utils.bytesToBase64(c);
    },
};

const r_instance = new R();
let initializing = false;
let intialized = false;

/** 该值是浏览器的指纹，似乎还随时间变动，因为之前取的值已经失效了。
 *
 * 但网站计算出来后会将其写入到 `cookie` 的 `gidf` 字段中，所以直接使用该值即可。
 */
async function get_r_key() {
    const cookie = await chrome.cookies.get({
        url: BOOK_HOST,
        name: "gidf",
    });
    const v = cookie.value;
    DEBUG.LOG_KEY && console.log("get_r_key", v);
    return v;
}

async function init_decryptor() {
    if (intialized) return;

    // 等待初始化完成
    if (initializing) {
        return new Promise<void>((resolve) => {
            const tid = setInterval(() => {
                if (intialized) {
                    clearInterval(tid);
                    resolve();
                }
            }, 1000);
        });
    }
    initializing = true;

    await r_instance.ready(
        "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AkAgAkEAKAKEjsCAAEcNAEEAIQMCQANAIAIgAyIERg0BIARBAWohAyAEQYSGwIAAai0AACAEQYCAwABqLQAARg0ACwsgBCACSSEDC0GAgMAAIQQDQCACRQ0BIARBADoAACAEQQFqIQQgAkF/aiECDAALCyADCwoAQoCAwICAgAELeQIBfwF+I4CAgIAAQTBrIgMkgICAgAAgAyABNgIEIAMgADYCACADQQI2AgwgA0GogsCAADYCCCADQgI3AhQgA0GBgICAAK1CIIYiBCADrYQ3AyggAyAEIANBBGqthDcDICADIANBIGo2AhAgA0EIaiACEI+AgIAAAAsPACAAIAEgAhCWgICAAAALDwAgACABIAIQl4CAgAAACzYBAX8jgICAgABBEGsiAiSAgICAACACQQE7AQwgAiABNgIIIAIgADYCBCACQQRqEIaAgIAAAAuXAwEIfyOAgICAAEEQayIDJICAgIAAQQohBCAAIQUCQCAAQegHSQ0AQQohBCAAIQYDQCADQQZqIARqIgdBfWogBiAGQZDOAG4iBUGQzgBsayIIQf//A3FB5ABuIglBAXQiCkG5gsCAAGotAAA6AAAgB0F8aiAKQbiCwIAAai0AADoAACAHQX9qIAggCUHkAGxrQf//A3FBAXQiCEG5gsCAAGotAAA6AAAgB0F+aiAIQbiCwIAAai0AADoAACAEQXxqIQQgBkH/rOIESyEHIAUhBiAHDQALCwJAAkAgBUEJSw0AIAUhBgwBCyADQQZqIARqQX9qIAUgBUH//wNxQeQAbiIGQeQAbGtB//8DcUEBdCIHQbmCwIAAai0AADoAACADQQZqIARBfmoiBGogB0G4gsCAAGotAAA6AAALAkACQCAARQ0AIAZFDQELIANBBmogBEF/aiIEaiAGQQF0QR5xQbmCwIAAai0AADoAAAsgAiABQQFBACADQQZqIARqQQogBGsQkYCAgAAhBiADQRBqJICAgIAAIAYLsQYCCH8BfgJAAkAgAQ0AIAVBAWohBiAAKAIIIQdBLSEIDAELQStBgIDEACAAKAIIIgdBgICAAXEiARshCCABQRV2IAVqIQYLAkACQCAHQYCAgARxDQBBACECDAELAkACQCADQRBJDQAgAiADEJKAgIAAIQEMAQsCQCADDQBBACEBDAELIANBA3EhCQJAAkAgA0EETw0AQQAh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",
    );
    var A = R.utils.xo(await get_r_key());
    await r_instance.setGf(A);

    intialized = true;
    initializing = false;
}

/** 解密 k 值，返回一个对象。
 * 它的返回值根据实际的结果变化！如果返回 undefined，说明网站更新了算法
 */
export default async function decrypt_kvalue(k: string): Promise<any> {
    await init_decryptor();
    try {
        // 注意！插件获取到的 k 值是经过 encodeURIComponent 的，所以需要 decodeURIComponent
        // 而算法中也需要一次 decodeURIComponent
        const raw = r_instance.decryptText(
            decodeURIComponent(decodeURIComponent(k)),
        );
        return JSON.parse(raw);
    } catch (e) {
        console.log("decrypt_kvalue error:", e, "\nkvalue:", k);
    }
    return;
}
