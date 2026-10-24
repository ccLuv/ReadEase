// Manual integration check. Uses the configured provider and may consume API credits.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitText} from '../app/parsers.js';
import {executeAgentTool} from '../app/agent-tools.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const configPath=path.join(root,'config','ai-config.json');
const config=JSON.parse((await readFile(configPath,'utf8')).replace(/^\uFEFF/,''));
if(!config.apiKey)throw Error('尚未配置 API Key');
const book={id:'d'.repeat(64),title:'星河邮差',chapters:splitText(await readFile(path.join(root,'samples','星河邮差.txt'),'utf8'))};
const fogBook={id:'e'.repeat(64),title:'雾港钟表店',chapters:splitText(await readFile(path.join(root,'samples','雾港钟表店.txt'),'utf8'))};
const temp=await mkdtemp(path.join(tmpdir(),'readease-live-agent-'));
const port=4188,base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{
  cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:temp,AI_CONFIG_PATH:configPath},stdio:['ignore','pipe','pipe']
});
let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
async function post(route,body){
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok){await new Promise(resolve=>setTimeout(resolve,150));throw Error(`${route}: ${response.status} ${data.error||'请求失败'} ${stderr.slice(-1800)}`);}
  return data;
}
try{
  await Promise.race([
    new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{if(chunk.toString().includes('ReadEase'))resolve();});child.on('error',reject);child.on('exit',code=>reject(Error(`服务提前退出 ${code}: ${stderr.slice(0,300)}`)));}),
    new Promise((_,reject)=>setTimeout(()=>reject(Error('服务启动超时')),5000))
  ]);
  async function ask(question,currentBook=book){
    let step=await post('/api/assistant/agent/start',{question,bookId:currentBook.id,bookTitle:currentBook.title,chapterCount:currentBook.chapters.length});
    let rounds=0;
    while(step.step==='tool_calls'&&rounds++<7){
      const results=step.calls.map(call=>({call_id:call.call_id,output:executeAgentTool(currentBook,call,question)}));
      step=await post('/api/assistant/agent/continue',{turnId:step.turnId,bookId:currentBook.id,results});
    }
    return step;
  }
  const fogOnly=process.argv.includes('--fog-only'),fogTwo=process.argv.includes('--fog-two-questions'),summaryOnly=process.argv.includes('--summary-only');
  const fog=summaryOnly?null:await ask('第二章的人物为什么改变主意',fogBook);
  const summary=fogTwo||summaryOnly?await ask('这本书主要讲了些什么？',fogBook):null;
  const related=fogOnly||fogTwo||summaryOnly?null:await ask('第二章的车站有什么奇怪之处？');
  const unrelated=fogOnly||fogTwo||summaryOnly?null:await ask('今天比特币的价格是多少？');
  const status=await (await fetch(base+'/api/assistant/status')).json();
  console.log(JSON.stringify({...(fog?{fog:{answer:fog.answer,insufficient:fog.insufficient,trace:fog.trace,evidence:fog.evidence?.map(item=>({chapter:item.chapter,title:item.title}))}}:{}),...(summary?{summary:{answer:summary.answer,insufficient:summary.insufficient,trace:summary.trace,evidence:summary.evidence?.map(item=>({chapter:item.chapter,title:item.title}))}}:{}),...(!fogOnly&&!fogTwo&&!summaryOnly?{related:{answer:related.answer,insufficient:related.insufficient},unrelated:{answer:unrelated.answer,insufficient:unrelated.insufficient}}:{}),requests:status.stats.requests,successes:status.stats.successes,failures:status.stats.failures},null,2));
  if((fog&&(fog.insufficient||!fog.evidence?.length||!fog.answer.includes('沈伯')))||(summary&&(summary.insufficient||new Set(summary.evidence?.map(item=>item.chapter)).size<2))||(!fogOnly&&!fogTwo&&!summaryOnly&&(related.insufficient||!related.evidence?.length||!unrelated.insufficient||unrelated.evidence?.length)))process.exitCode=1;
}finally{
  if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  await rm(temp,{recursive:true,force:true});
}
