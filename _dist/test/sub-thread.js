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
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = __importDefault(require("../index.js"));
Promise.resolve().then(() => __awaiter(void 0, void 0, void 0, function* () {
    index_js_1.default.eventInterceptor = function (name, ...args) { console.log("sub event:", name, args); };
    setTimeout(() => { console.log("trigger starting"); index_js_1.default.event('starting'); }, 2000);
    const re = yield index_js_1.default.wait('fireup').catch((err) => { console.error("sub", err); return 0; });
    if (re === 0) {
        process.exit(1);
        return;
    }
    let start_value = yield index_js_1.default.invoke('start_value', 10);
    let hInterval = setInterval(() => {
        index_js_1.default.event('tick', start_value++);
    }, 1000);
    index_js_1.default.handle('fin', () => {
        console.log('received fin');
        clearInterval(hInterval);
        setTimeout(() => process.exit(0), 0);
        return;
    });
})).catch((e) => console.error(e));
