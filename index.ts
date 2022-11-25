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
import threads from "worker_threads";
import events from "events";


// Shared Contents
interface ThreadControl {
	get eventInterceptor():null|{(event:string, ...args:any[]):void};
	set eventInterceptor(handler:null|{(event:string, ...args:any[]):void});
	get invokeTimeout():number;
	set invokeTimeout(dur_milli:number);
	wait(event_name:string, timeout_milli?:number):Promise<void>;
	handle(func:string, handler:{(...args:any[]):any}, overwrite?:boolean):this;
	event(event_name:string, ...evt_data:any[]):this;
	invoke<ReturnType=any>(func:string, ...call_args:any[]):Promise<ReturnType>;
}

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
} as const;

const ControlType = {EVENT:'event', EXEC:'exec', EXEC_RESULT:'execr', EXEC_ERROR:'exece'} as const;
type TControlType = typeof ControlType;

interface EventPayload { e:TControlType['EVENT']; t:string; d:any[]; }
interface ExecPayload { e:TControlType['EXEC']; i:string;  t:string; d:any[]; }
interface ExecResultPayload { e:TControlType['EXEC_RESULT']; i:string; d:any; }
interface ExecErrorPayload { e:TControlType['EXEC_ERROR']; i:string; m:string; c?:string; d?:any; }
type ControlPayload = EventPayload | ExecPayload | ExecResultPayload | ExecErrorPayload;


const GenId = (()=>{
	"use strict";
	
	// See http://www.isthe.com/chongo/tech/comp/fnv/#FNV-param for the definition of these parameters;
	const FNV_PRIME_HIGH = 0x0100, FNV_PRIME_LOW = 0x0193;	// 16777619 0x01000193
	const OFFSET_BASIS = new Uint8Array([0xC5, 0x9D, 0x1C, 0x81]);	// 2166136261 [0x81, 0x1C, 0x9D, 0xC5]
	const BASE32_MAP = "0123456789abcdefghijklmnopqrstuv".split('');
	const ENV = {
		SEQ:Math.floor(Math.random() * 0xFFFFFFFF),
		PID:0, PPID:0, MACHINE_ID:new Uint8Array(0)
	};
	
	if ( typeof Buffer !== "undefined" && typeof process !== undefined ) {
		ENV.MACHINE_ID = fnv1a32(UTF8Encode(require('os').hostname()));
		ENV.PID = process.pid;
		ENV.PPID = process.ppid;
	}
	else {
		let hostname = '';
		if ( typeof window !== undefined ) {
			hostname = window.location.host;
		}
		else {
			const HOSTNAME_CANDIDATES = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWZYZ_-";
		
			let count = 30;
			while(count-- > 0) hostname += HOSTNAME_CANDIDATES[(Math.random() * HOSTNAME_CANDIDATES.length)|0]
		}

		ENV.MACHINE_ID = fnv1a32(UTF8Encode(hostname));
		ENV.PID = (Math.random() * 65535)|0;
		ENV.PPID = (Math.random() * 65535)|0;
	}



	return function GenTrimId() {
		const time	= Date.now();
		const time_lower = time%0xFFFFFFFF;
		const inc	= (ENV.SEQ=(ENV.SEQ+1) % 0xFFFFFFFF);
		const buff	= new Uint8Array(14);
		const view	= new DataView(buff.buffer);
		
		view.setUint32(0, time_lower, false);				// [0-3] epoch time upper
		buff.set(ENV.MACHINE_ID, 4);					// [4-7] machine id
		view.setUint16(8, ENV.PID,  false);				// [8-9] pid
		view.setUint32(10, inc,	 false);					// [10-13] seq
		
		return Base32Encode(buff);
	};


	


	
	function Base32Encode(bytes:Uint8Array):string {
		if ( bytes.length < 1 ) return '';
		
		
		// Run complete bundles
		let encoded = '';
		let begin, loop = Math.floor(bytes.length/5);
		for (let run=0; run<loop; run++) {
			begin = run * 5;
			encoded += BASE32_MAP[  bytes[begin]           >> 3];								// 0
			encoded += BASE32_MAP[ (bytes[begin  ] & 0x07) << 2 | (bytes[begin+1] >> 6)];	// 1
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x3E) >> 1];								// 2
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x01) << 4 | (bytes[begin+2] >> 4)];	// 3
			encoded += BASE32_MAP[ (bytes[begin+2] & 0x0F) << 1 | (bytes[begin+3] >> 7)];	// 4
			encoded += BASE32_MAP[ (bytes[begin+3] & 0x7C) >> 2];								// 5
			encoded += BASE32_MAP[ (bytes[begin+3] & 0x03) << 3 | (bytes[begin+4] >> 5)];	// 6
			encoded += BASE32_MAP[  bytes[begin+4] & 0x1F];										// 7
		}
		
		// Run remains
		let remain = bytes.length % 5;
		if ( remain === 0 ) { return encoded; }
		
		
		begin = loop*5;
		if ( remain === 1 ) {
			encoded += BASE32_MAP[  bytes[begin]           >> 3];								// 0
			encoded += BASE32_MAP[ (bytes[begin  ] & 0x07) << 2];								// 1
		}
		else
		if ( remain === 2 ) {
			encoded += BASE32_MAP[  bytes[begin]           >> 3];								// 0
			encoded += BASE32_MAP[ (bytes[begin  ] & 0x07) << 2 | (bytes[begin+1] >> 6)];	// 1
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x3E) >> 1];								// 2
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x01) << 4];								// 3
		}
		else
		if ( remain === 3 ) {
			encoded += BASE32_MAP[  bytes[begin]           >> 3];								// 0
			encoded += BASE32_MAP[ (bytes[begin  ] & 0x07) << 2 | (bytes[begin+1] >> 6)];	// 1
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x3E) >> 1];								// 2
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x01) << 4 | (bytes[begin+2] >> 4)];	// 3
			encoded += BASE32_MAP[ (bytes[begin+2] & 0x0F) << 1];								// 4
		}
		else
		if ( remain === 4 ) {
			encoded += BASE32_MAP[  bytes[begin]           >> 3];								// 0
			encoded += BASE32_MAP[ (bytes[begin  ] & 0x07) << 2 | (bytes[begin+1] >> 6)];	// 1
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x3E) >> 1];								// 2
			encoded += BASE32_MAP[ (bytes[begin+1] & 0x01) << 4 | (bytes[begin+2] >> 4)];	// 3
			encoded += BASE32_MAP[ (bytes[begin+2] & 0x0F) << 1 | (bytes[begin+3] >> 7)];	// 4
			encoded += BASE32_MAP[ (bytes[begin+3] & 0x7C) >> 2];								// 5
			encoded += BASE32_MAP[ (bytes[begin+3] & 0x03) << 3];								// 6
		}
		
		return encoded;
	}
	function UTF8Encode(str:string):Uint8Array {
		if ( typeof str !== "string" ) {
			throw new TypeError( "Given input argument must be a js string!" );
		}
	
		let codePoints = [];
		let i=0;
		while( i < str.length ) {
			let codePoint = str.codePointAt(i);
			if ( codePoint === undefined ) throw new RangeError("Given string cannot be encoded into utf8!");
			
			// 1-byte sequence
			if( (codePoint & 0xffffff80) === 0 ) {
				codePoints.push(codePoint);
			}
			// 2-byte sequence
			else if( (codePoint & 0xfffff800) === 0 ) {
				codePoints.push(
					0xc0 | (0x1f & (codePoint >> 6)),
					0x80 | (0x3f & codePoint)
				);
			}
			// 3-byte sequence
			else if( (codePoint & 0xffff0000) === 0 ) {
				codePoints.push(
					0xe0 | (0x0f & (codePoint >> 12)),
					0x80 | (0x3f & (codePoint >> 6)),
					0x80 | (0x3f & codePoint)
				);
			}
			// 4-byte sequence
			else if( (codePoint & 0xffe00000) === 0 ) {
				codePoints.push(
					0xf0 | (0x07 & (codePoint >> 18)),
					0x80 | (0x3f & (codePoint >> 12)),
					0x80 | (0x3f & (codePoint >> 6)),
					0x80 | (0x3f & codePoint)
				);
			}
			
			i += (codePoint>0xFFFF) ? 2 : 1;
		}
		return new Uint8Array(codePoints);
	}
	function fnv1a32(octets:Uint8Array):Uint8Array {
		const U8RESULT		= OFFSET_BASIS.slice(0);
		const U32RESULT		= new Uint32Array(U8RESULT.buffer);
		const RESULT_PROC	= new Uint16Array(U8RESULT.buffer);
		for( let i = 0; i < octets.length; i += 1 ) {
			U32RESULT[0] = U32RESULT[0] ^ octets[i];
			
			let hash_low = RESULT_PROC[0], hash_high = RESULT_PROC[1];
			
			RESULT_PROC[0] = hash_low * FNV_PRIME_LOW;
			RESULT_PROC[1] = hash_low * FNV_PRIME_HIGH + hash_high * FNV_PRIME_LOW + (RESULT_PROC[0]>>>16);
		}
		return U8RESULT;
	}
})();

const DEFUALT_INVOKE_TIMEOUT = 10000;
const DEFAULT_WAIT_TIMEOUT	 = 10000;





// Thread Control
const ThreadState = {INIT:'init', ONLINE:'online', EXITED:'exited'} as const;
type ThreadStates = (typeof ThreadState)[keyof typeof ThreadState];
const ThreadPrivates:WeakMap<Thread|ThreadChild, {
	thread: Thread|ThreadChild;
	commandPort: threads.MessagePort|null;
	state: ThreadStates;
	exitCode: null|number;
	errorInfo: null|Error;
	invokeTimeout: number;
	invokeMap: {[id:string]:{res:(result:any)=>void, rej:(err:Error)=>void, tout:NodeJS.Timeout}};
	invokeHandlers: {[func:string]:{(...args:any[]):any}};
	eventInterceptor: null|{(event:string, ...args:any[]):void};
}> = new WeakMap();


class Thread extends threads.Worker implements ThreadControl {
	constructor(script:string|URL, data?:{}, options?:threads.WorkerOptions) {
		const {port1:cmd_a, port2:cmd_b} = new threads.MessageChannel();
		const workerData = Object.assign(data||{}, {commandPort:cmd_b});
		const workerOptions = Object.assign({}, options, {workerData, transferList:[cmd_b]});
		
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
			commandPort:cmd_a,
			state: ThreadState.INIT,
			exitCode: null,
			errorInfo: null,
			invokeTimeout: DEFUALT_INVOKE_TIMEOUT,
			invokeMap: {},
			invokeHandlers: {},
			eventInterceptor: null
		});
	}



	get eventInterceptor():null|{(event:string, ...args:any[]):void} {
		return ThreadPrivates.get(this)!.eventInterceptor;
	}
	set eventInterceptor(handler:null|{(event:string, ...args:any[]):void}) {
		if ( handler === null || typeof handler === "function" ) {
			ThreadPrivates.get(this)!.eventInterceptor = handler;
			return;
		}
		
		throw Object.assign(new Error("Thread.eventInterceptor accepts only null or a callback function!"), {code:ErrorCodes.ERR_INVALID_EVENT_HANDLER});
	}
	get invokeTimeout():number { return ThreadPrivates.get(this)!.invokeTimeout; }
	set invokeTimeout(dur_milli:number) {
		if ( typeof dur_milli !== "number" || dur_milli < 0 ) { throw new Error("The value of invokeTimeout must be a number greater than 0!"); }
		ThreadPrivates.get(this)!.invokeTimeout = dur_milli;
	}
	get state():ThreadStates { return ThreadPrivates.get(this)!.state; }
	async kill():Promise<number> {
		const thread = ThreadPrivates.get(this)!;
		if ( thread.state === ThreadState.EXITED ) return thread.exitCode!;
		return this.terminate();
	}
	async wait(event_name:string, timeout_milli:number=DEFAULT_WAIT_TIMEOUT):Promise<void> {
		return new Promise((resolve, reject)=>{
			const timeout = ( timeout_milli > 0 ) ?
				setTimeout(
					()=>reject(Object.assign(new Error("Thread event timeout!"), {event:event_name, code:ErrorCodes.ERR_WAIT_TIMEOUT})), 
					timeout_milli
				) : null;
			
			this.once(event_name, ()=>{
				if ( timeout ) clearTimeout(timeout);
				resolve();
			});
		});
	}
	handle(func:string, handler:{(...args:any[]):any}, overwrite:boolean=false):this {
		const handlers = ThreadPrivates.get(this)!.invokeHandlers;
		if ( typeof handler !== "function" ) {
			throw Object.assign(new TypeError(`Given handler is not a function`), {func, code:ErrorCodes.ERR_INVALID_FUNC_HANDLER});
		}

		if ( handlers[func] !== undefined && overwrite === false ) {
			throw Object.assign(new RangeError(`Func name ${func} exists!`), {func, code:ErrorCodes.ERR_FUNCTION_DUPLICATED});
		}
		
		handlers[func] = handler;
		return this;
	}
	event(event_name:string, ...evt_data:any[]):this {
		const eid = GenId();
		ThreadPrivates.get(this)!.commandPort?.postMessage({
			i:eid, e:'event', t:event_name, d:evt_data
		});
		return this;
	}
	async invoke<ReturnType=any>(func:string, ...call_args:any[]):Promise<ReturnType> {
		const thread = ThreadPrivates.get(this)!;
		return new Promise<ReturnType>((resolve, reject)=>{
			if ( !thread.commandPort ) {
				reject(Object.assign(new Error("There's no parent to invoke!"), {func, code:ErrorCodes.ERR_NO_PARENT_THREAD}));
				return;
			}

			const eid = GenId();
			thread.invokeMap[eid] = {
				res:resolve, rej:reject,
				tout:setTimeout(()=>{
					delete thread.invokeMap[eid];
					reject(Object.assign(new Error("Thread invoke timeout!"), {func, code:ErrorCodes.ERR_INVOKE_TIMEOUT}));
				}, thread.invokeTimeout)
			};
			thread.commandPort.postMessage({i:eid, e:'exec', t:func, d:call_args});
		});
	}
};

function HANDLE_ERROR(this:Thread, error:Error) {
	const thread = ThreadPrivates.get(this)!;
	thread.errorInfo = error;
}
function HANDLE_EXIT(this:Thread, exitCode:number) {
	const thread = ThreadPrivates.get(this)!;
	thread.state = ThreadState.EXITED;
	thread.exitCode = exitCode;
}
function HANDLE_ONLINE(this:Thread) {
	ThreadPrivates.get(this)!.state = ThreadState.ONLINE;
}
function HANDLE_CTRL_ERROR(this:Thread|ThreadChild, err:Error) {
	this.emit('controlerror', err);
}
function HANDLE_CTRL(this:Thread|ThreadChild, payload:ControlPayload) {
	if ( Object(payload) !== payload || typeof payload.e !== "string" ) {
		this.emit('controlerror', Object.assign(
			new TypeError("Unable resolve remote control payload!"), 
			{code:ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload}
		));
		return;
	}

	if ( payload.e === ControlType.EVENT ) {
		const {eventInterceptor} = ThreadPrivates.get(this)!;
		const {t, d} = payload;
		if ( !Array.isArray(d) ) {
			this.emit('controlerror', Object.assign(
				new TypeError("Given event payload is invalid!"),
				{code:ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload}
			));
			return;
		}

		if ( eventInterceptor ) eventInterceptor(t, ...d);
		this.emit(t, ...d);
		return;
	}

	if ( payload.e === ControlType.EXEC_RESULT ) {
		const {invokeMap} = ThreadPrivates.get(this)!;

		if ( typeof payload.i !== "string" ) {
			this.emit('controlerror', Object.assign(
				new TypeError("Given exec result payload is invalid!"), 
				{code:ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload}
			));
			return;
		}

		const cb_info = invokeMap[payload.i];
		if ( !cb_info ) return;

		delete invokeMap[payload.i];
		clearTimeout(cb_info.tout);
		cb_info.res(payload.d);
		return;
	}

	if ( payload.e === ControlType.EXEC_ERROR ) {
		const {invokeMap} = ThreadPrivates.get(this)!;
		
		if ( typeof payload.i !== "string" || typeof payload.m !== "string" ) {
			this.emit('controlerror', Object.assign(
				new TypeError("Given exec error payload is invalid!"), 
				{code:ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload}
			));
			return;
		}

		const cb_info = invokeMap[payload.i];
		if ( !cb_info ) return;

		const error = Object.assign(new Error(payload.m), {code:payload.c, data:payload.d});
		delete invokeMap[payload.i];
		clearTimeout(cb_info.tout);
		cb_info.rej(error);
		return;
	}

	if ( payload.e === ControlType.EXEC ) {
		const {invokeHandlers, commandPort} = ThreadPrivates.get(this)!;

		if ( typeof payload.i !== "string" || typeof payload.t !== "string" || !Array.isArray(payload.d) ) {
			this.emit('controlerror', Object.assign(
				new TypeError("Unable to handle remote control payload!"), 
				{code:ErrorCodes.ERR_PAYLOAD_PARSE_ERROR, payload}
			));
			return;
		}

		const handler = invokeHandlers[payload.t];
		if ( typeof handler !== "function" ) {
			const error:ExecErrorPayload = {
				i: payload.i,
				e: ControlType.EXEC_ERROR,
				c: 'THREAD_UNDEFINED_FUNC',
				m: `Func ${payload.t} is not defined!`,
				d: payload.t
			};
			commandPort?.postMessage(error);
			return;
		}



		Promise.resolve().then(()=>handler(...payload.d))
		.then((r)=>{
			const result:ExecResultPayload = {
				i: payload.i,
				e: ControlType.EXEC_RESULT,
				d: r
			};
			commandPort?.postMessage(result);
		})
		.catch((e:Error&{code?:string; detail?:any})=>{
			const error:ExecErrorPayload = {
				i: payload.i,
				e: ControlType.EXEC_ERROR,
				c: e.code,
				m: e.message,
				d: e.detail
			};
			commandPort?.postMessage(error);
		});
		return;
	}



	{
		const p = <ControlPayload>payload;
		this.emit('controlerror', Object.assign(
			new RangeError("Unsupported control type!"), 
			{code:ErrorCodes.ERR_UNSUPPORT_PAYLOAD_TYPE, type:p.e}
		));
	}
}









class ThreadChild extends events.EventEmitter implements ThreadControl {
	constructor() {
		super();


		let cmdport:threads.MessagePort|null;
		if ( Object(threads.workerData) === threads.workerData && threads.workerData.commandPort instanceof threads.MessagePort ) {
			cmdport = threads.workerData.commandPort;
		}
		else {
			cmdport = null;
		}



		if ( cmdport ) {
			cmdport
			.on('message', HANDLE_CTRL.bind(this))
			.on('messageerror', HANDLE_CTRL_ERROR.bind(this));
		}
		
		ThreadPrivates.set(this, {
			thread: this,
			commandPort:cmdport,
			state: ThreadState.ONLINE,
			exitCode: null,
			errorInfo: null,
			invokeTimeout: DEFUALT_INVOKE_TIMEOUT,
			invokeMap: {},
			invokeHandlers: {},
			eventInterceptor: null
		});
	}



	get eventInterceptor():null|{(event:string, ...args:any[]):void} {
		return ThreadPrivates.get(this)!.eventInterceptor;
	}
	set eventInterceptor(handler:null|{(event:string, ...args:any[]):void}) {
		if ( handler === null || typeof handler === "function" ) {
			ThreadPrivates.get(this)!.eventInterceptor = handler;
			return;
		}
		
		throw Object.assign(new Error("Thread.eventInterceptor accepts only null or a callback function!"), {code:ErrorCodes.ERR_INVALID_EVENT_HANDLER});
	}
	get invokeTimeout():number { return ThreadPrivates.get(this)!.invokeTimeout; }
	set invokeTimeout(dur_milli:number) {
		if ( typeof dur_milli !== "number" || dur_milli < 0 ) { throw new Error("The value of invokeTimeout must be a number greater than 0!"); }
		ThreadPrivates.get(this)!.invokeTimeout = dur_milli;
	}

	async wait(event_name:string, timeout_milli:number=DEFAULT_WAIT_TIMEOUT):Promise<void> {
		return new Promise((resolve, reject)=>{
			this.on(event_name, resolve);
			if ( timeout_milli > 0 ) {
				setTimeout(
					()=>reject(Object.assign(new Error("Thread event timeout!"), {event:event_name, code:ErrorCodes.ERR_WAIT_TIMEOUT})), 
					timeout_milli
				);
			}
		});
	}
	handle(func:string, handler:{(...args:any[]):any}, overwrite:boolean=false):this {
		const handlers = ThreadPrivates.get(this)!.invokeHandlers;
		if ( typeof handler !== "function" ) {
			throw Object.assign(new TypeError(`Given handler is not a function`), {func, code:ErrorCodes.ERR_INVALID_FUNC_HANDLER});
		}

		if ( handlers[func] !== undefined && overwrite === false ) {
			throw Object.assign(new RangeError(`Func name ${func} exists!`), {func, code:ErrorCodes.ERR_FUNCTION_DUPLICATED});
		}
		
		handlers[func] = handler;
		return this;
	}
	event(event_name:string, ...evt_data:any[]):this {
		const thread = ThreadPrivates.get(this)!;
		if ( !thread.commandPort ) {
			throw Object.assign(new Error("There's no parent to invoke!"), {event:event_name, code:ErrorCodes.ERR_NO_PARENT_THREAD});
		}

		
		const eid = GenId();
		thread.commandPort.postMessage({
			i:eid, e:'event', t:event_name, d:evt_data
		});
		return this;
	}
	async invoke<ReturnType=any>(func:string, ...call_args:any[]):Promise<ReturnType> {
		const thread = ThreadPrivates.get(this)!;
		return new Promise<ReturnType>((resolve, reject)=>{
			if ( !thread.commandPort ) {
				reject(Object.assign(new Error("There's no parent to invoke!"), {func, code:ErrorCodes.ERR_NO_PARENT_THREAD}));
				return;
			}

			const eid = GenId();
			thread.invokeMap[eid] = {
				res:resolve, rej:reject,
				tout:setTimeout(()=>{
					delete thread.invokeMap[eid];
					reject(Object.assign(new Error("Thread invoke timeout!"), {func, code:ErrorCodes.ERR_INVOKE_TIMEOUT}));
				}, thread.invokeTimeout)
			};
			thread.commandPort.postMessage({i:eid, e:'exec', t:func, d:call_args});
		});
	}
}



export = Object.assign(new ThreadChild(), {
	create:(script:string|URL, data?:{}, options?:threads.WorkerOptions):Thread=>{
		return new Thread(script, data, options);
	},
	Error:ErrorCodes
});