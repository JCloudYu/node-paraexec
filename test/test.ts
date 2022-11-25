import path from "path";
import thread from "../index.js";

const t = thread.create(path.resolve(__dirname, './sub-thread.js'), {a:1, b:2, c:3, d:4});
Promise.resolve().then(async()=>{
	t.eventInterceptor = function(name:string, ...args:any[]) { console.log("main event:", name, args); }
	await t.wait('starting');
	setTimeout(()=>t.event('fireup'), 2000);

	t.handle('start_value', (range:number=100)=>{console.log('range', range); return Math.floor(Math.random() * range) + 50;})
	.on('tick', (count:number)=>{ 
		console.log('tick', count); 
		if (count >= 60) {
			t.invoke('fin').then(()=>console.log("fin")).catch((e)=>console.error(e));
		}
	})
	.on('exit', (exitCode:number)=>console.log('child exited', exitCode));
})
.catch((e)=>{console.error("master catch", e); process.exit(1);})