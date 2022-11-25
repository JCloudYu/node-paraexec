import thread from "../index.js";

Promise.resolve().then(async()=>{
	thread.eventInterceptor = function(name:string, ...args:any[]) { console.log("sub event:", name, args); }
	setTimeout(()=>{console.log("trigger starting"); thread.event('starting')}, 2000);

	const re = await thread.wait('fireup').catch((err)=>{console.error("sub", err); return 0;});
	if ( re === 0 ) { process.exit(1); return; }

	let start_value = await thread.invoke('start_value', 10);
	let hInterval = setInterval(()=>{
		thread.event('tick', start_value++);
	}, 1000);
	thread.handle('fin', ()=>{
		console.log('received fin');
		clearInterval(hInterval);
		setTimeout(()=>process.exit(0), 0);
		return;
	});
}).catch((e)=>console.error(e));