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
const path_1 = __importDefault(require("path"));
const index_js_1 = __importDefault(require("../index.js"));
const t = index_js_1.default.create(path_1.default.resolve(__dirname, './sub-thread.js'), { a: 1, b: 2, c: 3, d: 4 });
Promise.resolve().then(() => __awaiter(void 0, void 0, void 0, function* () {
    t.eventInterceptor = function (name, ...args) { console.log("main event:", name, args); };
    yield t.wait('starting');
    setTimeout(() => t.event('fireup'), 2000);
    t.handle('start_value', (range = 100) => { console.log('range', range); return Math.floor(Math.random() * range) + 50; })
        .on('tick', (count) => {
        console.log('tick', count);
        if (count >= 60) {
            t.invoke('fin').then(() => console.log("fin")).catch((e) => console.error(e));
        }
    })
        .on('exit', (exitCode) => console.log('child exited', exitCode));
}))
    .catch((e) => { console.error("master catch", e); process.exit(1); });
