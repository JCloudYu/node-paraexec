"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
/**
 * ISC License
 *
 * Copyright (c) 2022 J. Cloud Yu
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
**/
const worker_threads_1 = __importDefault(require("worker_threads"));
const events_1 = __importDefault(require("events"));
const ErrorCodes = {
    ERR_UNDEFINED_FUNC: 'ERR_UNDEFINED_FUNC',
    ERR_PAYLOAD_PARSE_ERROR: 'ERR_PAYLOAD_PARSE_ERROR',
    ERR_UNSUPPORT_PAYLOAD_TYPE: 'ERR_UNSUPPORT_PAYLOAD_TYPE',
    ERR_WAIT_TIMEOUT: 'ERR_WAIT_TIMEOUT',
    ERR_INVALID_FUNC_HANDLER: 'ERR_INVALID_FUNC_HANDLER',
    ERR_INVALID_EVENT_HANDLER: 'ERR_INVALID_EVENT_HANDLER',
    ERR_FUNCTION_DUPLICATED: 'ERR_FUNCTION_DUPLICATED',
    ERR_INVOKE_TIMEOUT: 'ERR_INVOKE_TIMEOUT',
    ERR_NO_PARENT_THREAD: 'ERR_INVOKE_TIMEOUT'
};
const ControlType = { EVENT: 'event', EXEC: 'exec', EXEC_RESULT: 'execr', EXEC_ERROR: 'exece' };
const GenId = (() => {
    "use strict";
    // See http://www.isthe.com/chongo/tech/comp/fnv/#FNV-param for the definition of these parameters;
    const FNV_PRIME_HIGH = 0x0100, FNV_PRIME_LOW = 0x0193; // 16777619 0x01000193
    const OFFSET_BASIS = new Uint8Array([0xC5, 0x9D, 0x1C, 0x81]); // 2166136261 [0x81, 0x1C, 0x9D, 0xC5]
    const BASE32_MAP = "0123456789abcdefghijklmnopqrstuv".split('');
    const ENV = {
        SEQ: Math.floor(Math.random() * 0xFFFFFFFF),
        PID: 0, PPID: 0, MACHINE_ID: new Uint8Array(0)
    };
    if (typeof Buffer !== "undefined" && typeof process !== undefined) {
        ENV.MACHINE_ID = fnv1a32(UTF8Encode(require('os').hostname()));
        ENV.PID = process.pid;
        ENV.PPID = process.ppid;
    }
    else {
        let hostname = '';
        if (typeof window !== undefined) {
            hostname = window.location.host;
        }
        else {
            const HOSTNAME_CANDIDATES = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWZYZ_-";
            let count = 30;
            while (count-- > 0)
                hostname += HOSTNAME_CANDIDATES[(Math.random() * HOSTNAME_CANDIDATES.length) | 0];
        }
        ENV.MACHINE_ID = fnv1a32(UTF8Encode(hostname));
        ENV.PID = (Math.random() * 65535) | 0;
        ENV.PPID = (Math.random() * 65535) | 0;
    }
    return function GenTrimId() {
        const time = Date.now();
        const time_lower = time % 0xFFFFFFFF;
        const inc = (ENV.SEQ = (ENV.SEQ + 1) % 0xFFFFFFFF);
        const buff = new Uint8Array(14);
        const view = new DataView(buff.buffer);
        view.setUint32(0, time_lower, false); // [0-3] epoch time upper
        buff.set(ENV.MACHINE_ID, 4); // [4-7] machine id
        view.setUint16(8, ENV.PID, false); // [8-9] pid
        view.setUint32(10, inc, false); // [10-13] seq
        return Base32Encode(buff);
    };
    function Base32Encode(bytes) {
        if (bytes.length < 1)
            return '';
        // Run complete bundles
        let encoded = '';
        let begin, loop = Math.floor(bytes.length / 5);
        for (let run = 0; run < loop; run++) {
            begin = run * 5;
            encoded += BASE32_MAP[bytes[begin] >> 3]; // 0
            encoded += BASE32_MAP[(bytes[begin] & 0x07) << 2 | (bytes[begin + 1] >> 6)]; // 1
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x3E) >> 1]; // 2
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x01) << 4 | (bytes[begin + 2] >> 4)]; // 3
            encoded += BASE32_MAP[(bytes[begin + 2] & 0x0F) << 1 | (bytes[begin + 3] >> 7)]; // 4
            encoded += BASE32_MAP[(bytes[begin + 3] & 0x7C) >> 2]; // 5
            encoded += BASE32_MAP[(bytes[begin + 3] & 0x03) << 3 | (bytes[begin + 4] >> 5)]; // 6
            encoded += BASE32_MAP[bytes[begin + 4] & 0x1F]; // 7
        }
        // Run remains
        let remain = bytes.length % 5;
        if (remain === 0) {
            return encoded;
        }
        begin = loop * 5;
        if (remain === 1) {
            encoded += BASE32_MAP[bytes[begin] >> 3]; // 0
            encoded += BASE32_MAP[(bytes[begin] & 0x07) << 2]; // 1
        }
        else if (remain === 2) {
            encoded += BASE32_MAP[bytes[begin] >> 3]; // 0
            encoded += BASE32_MAP[(bytes[begin] & 0x07) << 2 | (bytes[begin + 1] >> 6)]; // 1
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x3E) >> 1]; // 2
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x01) << 4]; // 3
        }
        else if (remain === 3) {
            encoded += BASE32_MAP[bytes[begin] >> 3]; // 0
            encoded += BASE32_MAP[(bytes[begin] & 0x07) << 2 | (bytes[begin + 1] >> 6)]; // 1
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x3E) >> 1]; // 2
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x01) << 4 | (bytes[begin + 2] >> 4)]; // 3
            encoded += BASE32_MAP[(bytes[begin + 2] & 0x0F) << 1]; // 4
        }
        else if (remain === 4) {
            encoded += BASE32_MAP[bytes[begin] >> 3]; // 0
            encoded += BASE32_MAP[(bytes[begin] & 0x07) << 2 | (bytes[begin + 1] >> 6)]; // 1
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x3E) >> 1]; // 2
            encoded += BASE32_MAP[(bytes[begin + 1] & 0x01) << 4 | (bytes[begin + 2] >> 4)]; // 3
            encoded += BASE32_MAP[(bytes[begin + 2] & 0x0F) << 1 | (bytes[begin + 3] >> 7)]; // 4
            encoded += BASE32_MAP[(bytes[begin + 3] & 0x7C) >> 2]; // 5
            encoded += BASE32_MAP[(bytes[begin + 3] & 0x03) << 3]; // 6
        }
        return encoded;
    }
    function UTF8Encode(str) {
        if (typeof str !== "string") {
            throw new TypeError("Given input argument must be a js string!");
        }
        let codePoints = [];
        let i = 0;
        while (i < str.length) {
            let codePoint = str.codePointAt(i);
            if (codePoint === undefined)
                throw new RangeError("Given string cannot be encoded into utf8!");
            // 1-byte sequence
            if ((codePoint & 0xffffff80) === 0) {
                codePoints.push(codePoint);
            }
            // 2-byte sequence
            else if ((codePoint & 0xfffff800) === 0) {
                codePoints.push(0xc0 | (0x1f & (codePoint >> 6)), 0x80 | (0x3f & codePoint));
            }
            // 3-byte sequence
            else if ((codePoint & 0xffff0000) === 0) {
                codePoints.push(0xe0 | (0x0f & (codePoint >> 12)), 0x80 | (0x3f & (codePoint >> 6)), 0x80 | (0x3f & codePoint));
            }
            // 4-byte sequence
            else if ((codePoint & 0xffe00000) === 0) {
                codePoints.push(0xf0 | (0x07 & (codePoint >> 18)), 0x80 | (0x3f & (codePoint >> 12)), 0x80 | (0x3f & (codePoint >> 6)), 0x80 | (0x3f & codePoint));
            }
            i += (codePoint > 0xFFFF) ? 2 : 1;
        }
        return new Uint8Array(codePoints);
    }
    function fnv1a32(octets) {
        const U8RESULT = OFFSET_BASIS.slice(0);
        const U32RESULT = new Uint32Array(U8RESULT.buffer);
        const RESULT_PROC = new Uint16Array(U8RESULT.buffer);
        for (let i = 0; i < octets.length; i += 1) {
            U32RESULT[0] = U32RESULT[0] ^ octets[i];
            let hash_low = RESULT_PROC[0], hash_high = RESULT_PROC[1];
            RESULT_PROC[0] = hash_low * FNV_PRIME_LOW;
            RESULT_PROC[1] = hash_low * FNV_PRIME_HIGH + hash_high * FNV_PRIME_LOW + (RESULT_PROC[0] >>> 16);
        }
        return U8RESULT;
    }
})();
const DEFUALT_INVOKE_TIMEOUT = 10000;
const DEFAULT_WAIT_TIMEOUT = 10000;
// Thread Control
const ThreadState = { INIT: 'init', ONLINE: 'online', EXITED: 'exited' };
const ThreadPrivates = new WeakMap();
class Thread extends worker_threads_1.default.Worker {
    constructor(script, data, options) {
        const { port1: cmd_a, port2: cmd_b } = new worker_threads_1.default.MessageChannel();
        const workerData = Object.assign(data || {}, { commandPort: cmd_b });
        const workerOptions = Object.assign({}, options, { workerData, transferList: [cmd_b] });
        super(script, workerOptions);
        this
            .on('online', HANDLE_ONLINE)
            .on('error', HANDLE_ERROR)
            .on('exit', HANDLE_EXIT);
        cmd_a
            .on('message', HANDLE_CTRL.bind(this))
            .on('messageerror', HANDLE_CTRL_ERROR.bind(this));
        ThreadPrivates.set(this, {
            thread: this,
            commandPort: cmd_a,
            state: ThreadState.INIT,
            exitCode: null,
            errorInfo: null,
            invokeTimeout: DEFUALT_INVOKE_TIMEOUT,
            invokeMap: {},
            invokeHandlers: {},
            eventInterceptor: null
        });
    }
    get eventInterceptor() {
        return ThreadPrivates.get(this).eventInterceptor;
    }
    set eventInterceptor(handler) {
        if (handler === null || typeof handler === "function") {
            ThreadPrivates.get(this).eventInterceptor = handler;
            return;
        }
        throw Object.assign(new Error("Thread.eventInterceptor accepts only null or a callback function!"), { code: ErrorCodes.ERR_INVALID_EVENT_HANDLER });
    }
    get invokeTimeout() { return ThreadPrivates.get(this).invokeTimeout; }
    set invokeTimeout(dur_milli) {
        if (typeof dur_milli !== "number" || dur_milli < 0) {
            throw new Error("The value of invokeTimeout must be a number greater than 0!");
        }
        ThreadPrivates.get(this).invokeTimeout = dur_milli;
    }
    get state() { return ThreadPrivates.get(this).state; }
    kill() {
        return __awaiter(this, void 0, void 0, function* () {
            const thread = ThreadPrivates.get(this);
            if (thread.state === ThreadState.EXITED)
                return thread.exitCode;
            return this.terminate();
        });
    }
    wait(event_name, timeout_milli = DEFAULT_WAIT_TIMEOUT) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const timeout = (timeout_milli > 0) ?
                    setTimeout(() => reject(Object.assign(new Error("Thread event timeout!"), { event: event_name, code: ErrorCodes.ERR_WAIT_TIMEOUT })), timeout_milli) : null;
                this.once(event_name, () => {
                    if (timeout)
                        clearTimeout(timeout);
                    resolve();
                });
            });
        });
    }
    handle(func, handler, overwrite = false) {
        const handlers = ThreadPrivates.get(this).invokeHandlers;
        if (typeof handler !== "function") {
            throw Object.assign(new TypeError(`Given handler is not a function`), { func, code: ErrorCodes.ERR_INVALID_FUNC_HANDLER });
        }
        if (handlers[func] !== undefined && overwrite === false) {
            throw Object.assign(new RangeError(`Func name ${func} exists!`), { func, code: ErrorCodes.ERR_FUNCTION_DUPLICATED });
        }
        handlers[func] = handler;
        return this;
    }
    event(event_name, ...evt_data) {
        var _a;
        const eid = GenId();
        (_a = ThreadPrivates.get(this).commandPort) === null || _a === void 0 ? void 0 : _a.postMessage({
            i: eid, e: 'event', t: event_name, d: evt_data
        });
        return this;
    }
    invoke(func, ...call_args) {
        return __awaiter(this, void 0, void 0, function* () {
            const thread = ThreadPrivates.get(this);
            return new Promise((resolve, reject) => {
                if (!thread.commandPort) {
                    reject(Object.assign(new Error("There's no parent to invoke!"), { func, code: ErrorCodes.ERR_NO_PARENT_THREAD }));
                    return;
                }
                const eid = GenId();
                thread.invokeMap[eid] = {
                    res: resolve, rej: reject,
                    tout: setTimeout(() => {
                        delete thread.invokeMap[eid];
                        reject(Object.assign(new Error("Thread invoke timeout!"), { func, code: ErrorCodes.ERR_INVOKE_TIMEOUT }));
                    }, thread.invokeTimeout)
                };
                thread.commandPort.postMessage({ i: eid, e: 'exec', t: func, d: call_args });
            });
        });
    }
}
;
function HANDLE_ERROR(error) {
    const thread = ThreadPrivates.get(this);
    thread.errorInfo = error;
}
function HANDLE_EXIT(exitCode) {
    const thread = ThreadPrivates.get(this);
    thread.state = ThreadState.EXITED;
    thread.exitCode = exitCode;
}
function HANDLE_ONLINE() {
    ThreadPrivates.get(this).state = ThreadState.ONLINE;
}
function HANDLE_CTRL_ERROR(err) {
    this.emit('controlerror', err);
}
function HANDLE_CTRL(payload) {
    if (Object(payload) !== payload || typeof payload.e !== "string") {
        this.emit('controlerror', Object.assign(new TypeError("Unable resolve remote control payload!"), { code: ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload }));
        return;
    }
    if (payload.e === ControlType.EVENT) {
        const { eventInterceptor } = ThreadPrivates.get(this);
        const { t, d } = payload;
        if (!Array.isArray(d)) {
            this.emit('controlerror', Object.assign(new TypeError("Given event payload is invalid!"), { code: ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload }));
            return;
        }
        if (eventInterceptor)
            eventInterceptor(t, ...d);
        this.emit(t, ...d);
        return;
    }
    if (payload.e === ControlType.EXEC_RESULT) {
        const { invokeMap } = ThreadPrivates.get(this);
        if (typeof payload.i !== "string") {
            this.emit('controlerror', Object.assign(new TypeError("Given exec result payload is invalid!"), { code: ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload }));
            return;
        }
        const cb_info = invokeMap[payload.i];
        if (!cb_info)
            return;
        delete invokeMap[payload.i];
        clearTimeout(cb_info.tout);
        cb_info.res(payload.d);
        return;
    }
    if (payload.e === ControlType.EXEC_ERROR) {
        const { invokeMap } = ThreadPrivates.get(this);
        if (typeof payload.i !== "string" || typeof payload.m !== "string") {
            this.emit('controlerror', Object.assign(new TypeError("Given exec error payload is invalid!"), { code: ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload }));
            return;
        }
        const cb_info = invokeMap[payload.i];
        if (!cb_info)
            return;
        const error = Object.assign(new Error(payload.m), { code: payload.c, data: payload.d });
        delete invokeMap[payload.i];
        clearTimeout(cb_info.tout);
        cb_info.rej(error);
        return;
    }
    if (payload.e === ControlType.EXEC) {
        const { invokeHandlers, commandPort } = ThreadPrivates.get(this);
        if (typeof payload.i !== "string" || typeof payload.t !== "string" || !Array.isArray(payload.d)) {
            this.emit('controlerror', Object.assign(new TypeError("Unable to handle remote control payload!"), { code: ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload }));
            return;
        }
        const handler = invokeHandlers[payload.t];
        if (typeof handler !== "function") {
            const error = {
                i: payload.i,
                e: ControlType.EXEC_ERROR,
                c: 'THREAD_UNDEFINED_FUNC',
                m: `Func ${payload.t} is not defined!`,
                d: payload.t
            };
            commandPort === null || commandPort === void 0 ? void 0 : commandPort.postMessage(error);
            return;
        }
        Promise.resolve().then(() => handler(...payload.d))
            .then((r) => {
            const result = {
                i: payload.i,
                e: ControlType.EXEC_RESULT,
                d: r
            };
            commandPort === null || commandPort === void 0 ? void 0 : commandPort.postMessage(result);
        })
            .catch((e) => {
            const error = {
                i: payload.i,
                e: ControlType.EXEC_ERROR,
                c: e.code,
                m: e.message,
                d: e.detail
            };
            commandPort === null || commandPort === void 0 ? void 0 : commandPort.postMessage(error);
        });
        return;
    }
    {
        const p = payload;
        this.emit('controlerror', Object.assign(new RangeError("Unsupported control type!"), { code: ErrorCodes.ERR_UNSUPPORT_PAYLOAD_TYPE, type: p.e }));
    }
}
class ThreadChild extends events_1.default.EventEmitter {
    constructor() {
        super();
        let cmdport;
        if (Object(worker_threads_1.default.workerData) === worker_threads_1.default.workerData && worker_threads_1.default.workerData.commandPort instanceof worker_threads_1.default.MessagePort) {
            cmdport = worker_threads_1.default.workerData.commandPort;
        }
        else {
            cmdport = null;
        }
        if (cmdport) {
            cmdport
                .on('message', HANDLE_CTRL.bind(this))
                .on('messageerror', HANDLE_CTRL_ERROR.bind(this));
        }
        ThreadPrivates.set(this, {
            thread: this,
            commandPort: cmdport,
            state: ThreadState.ONLINE,
            exitCode: null,
            errorInfo: null,
            invokeTimeout: DEFUALT_INVOKE_TIMEOUT,
            invokeMap: {},
            invokeHandlers: {},
            eventInterceptor: null
        });
    }
    get eventInterceptor() {
        return ThreadPrivates.get(this).eventInterceptor;
    }
    set eventInterceptor(handler) {
        if (handler === null || typeof handler === "function") {
            ThreadPrivates.get(this).eventInterceptor = handler;
            return;
        }
        throw Object.assign(new Error("Thread.eventInterceptor accepts only null or a callback function!"), { code: ErrorCodes.ERR_INVALID_EVENT_HANDLER });
    }
    get invokeTimeout() { return ThreadPrivates.get(this).invokeTimeout; }
    set invokeTimeout(dur_milli) {
        if (typeof dur_milli !== "number" || dur_milli < 0) {
            throw new Error("The value of invokeTimeout must be a number greater than 0!");
        }
        ThreadPrivates.get(this).invokeTimeout = dur_milli;
    }
    wait(event_name, timeout_milli = DEFAULT_WAIT_TIMEOUT) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.on(event_name, resolve);
                if (timeout_milli > 0) {
                    setTimeout(() => reject(Object.assign(new Error("Thread event timeout!"), { event: event_name, code: ErrorCodes.ERR_WAIT_TIMEOUT })), timeout_milli);
                }
            });
        });
    }
    handle(func, handler, overwrite = false) {
        const handlers = ThreadPrivates.get(this).invokeHandlers;
        if (typeof handler !== "function") {
            throw Object.assign(new TypeError(`Given handler is not a function`), { func, code: ErrorCodes.ERR_INVALID_FUNC_HANDLER });
        }
        if (handlers[func] !== undefined && overwrite === false) {
            throw Object.assign(new RangeError(`Func name ${func} exists!`), { func, code: ErrorCodes.ERR_FUNCTION_DUPLICATED });
        }
        handlers[func] = handler;
        return this;
    }
    event(event_name, ...evt_data) {
        const thread = ThreadPrivates.get(this);
        if (!thread.commandPort) {
            throw Object.assign(new Error("There's no parent to invoke!"), { event: event_name, code: ErrorCodes.ERR_NO_PARENT_THREAD });
        }
        const eid = GenId();
        thread.commandPort.postMessage({
            i: eid, e: 'event', t: event_name, d: evt_data
        });
        return this;
    }
    invoke(func, ...call_args) {
        return __awaiter(this, void 0, void 0, function* () {
            const thread = ThreadPrivates.get(this);
            return new Promise((resolve, reject) => {
                if (!thread.commandPort) {
                    reject(Object.assign(new Error("There's no parent to invoke!"), { func, code: ErrorCodes.ERR_NO_PARENT_THREAD }));
                    return;
                }
                const eid = GenId();
                thread.invokeMap[eid] = {
                    res: resolve, rej: reject,
                    tout: setTimeout(() => {
                        delete thread.invokeMap[eid];
                        reject(Object.assign(new Error("Thread invoke timeout!"), { func, code: ErrorCodes.ERR_INVOKE_TIMEOUT }));
                    }, thread.invokeTimeout)
                };
                thread.commandPort.postMessage({ i: eid, e: 'exec', t: func, d: call_args });
            });
        });
    }
}
module.exports = Object.assign(new ThreadChild(), {
    create: (script, data, options) => {
        return new Thread(script, data, options);
    },
    Error: ErrorCodes
});
