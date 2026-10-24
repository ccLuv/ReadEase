import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {executeAgentTool} from '../app/agent-tools.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bookId='c'.repeat(64),port=4186,base=`http://127.0.0.1:${port}`;
const book={id:bookId,title:'测试故事',chapters:[{title:'第一章',text:'开头介绍了阿舟。'},{title:'第二章',text:'阿舟找到了灯塔。'}]};

test('本地服务使用原 DeepSeek 配置完成工具调用和模型计数',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'readease-agent-'));
  const child=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'tests','mock-agent-fetch.mjs')).href,path.join(root,'server.mjs')],{
    env:{...process.env,PORT:String(port),DATA_DIR:dir,AI_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'test-key',AI_CONFIG_PATH:path.join(dir,'none.json')},stdio:['ignore','pipe','pipe']
  });
  try{
    let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
    let startupTimer;await Promise.race([
      new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{if(chunk.toString().includes('ReadEase'))resolve();});child.on('error',reject);child.on('exit',code=>reject(Error(`服务提前退出 ${code}: ${stderr.slice(0,500)}`)));}),
      new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(Error(`服务启动超时: ${stderr.slice(0,500)}`)),5000);})
    ]).finally(()=>clearTimeout(startupTimer));
    const post=async(url,value)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,200);return r.json();};
    const first=await post('/api/assistant/agent/start',{question:'第二章阿舟找到了什么？',bookId,bookTitle:book.title,chapterCount:2});
    assert.equal(first.step,'tool_calls');
    const results=first.calls.map(call=>({call_id:call.call_id,output:executeAgentTool(book,call)}));
    const final=await post('/api/assistant/agent/continue',{turnId:first.turnId,bookId,results});
    assert.equal(final.mode,'agent');assert.match(final.answer,/灯塔/);assert.equal(final.evidence[0].chapter,1);
    const status=await (await fetch(base+'/api/assistant/status')).json();
    assert.equal(status.stats.requests,2);assert.equal(status.stats.successes,2);assert.equal(status.stats.failures,0);
  }finally{if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}await rm(dir,{recursive:true,force:true});}
});
