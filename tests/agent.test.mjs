import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AgentController} from '../agent-controller.mjs';
import {executeAgentTool} from '../app/agent-tools.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitText} from '../app/parsers.js';

const bookId='b'.repeat(64);
const book={id:bookId,title:'测试故事',chapters:[
  {title:'第一章 起点',text:'小遥在港口认识了阿舟。两人约定一起寻找灯塔。'},
  {title:'第二章 灯塔',text:'阿舟在第二章找到灯塔。小遥发现灯塔内保存着回家的航线。'}
]};
const call=(id,name,args)=>({type:'function_call',call_id:id,name,arguments:JSON.stringify(args)});
const message=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const start=controller=>controller.start({question:'第二章阿舟找到了什么？',bookId,bookTitle:book.title,chapterCount:book.chapters.length});

test('Agent 查目录、搜索、读取原文后输出可跳转引用',async()=>{
  const requests=[],replies=[
    {status:'completed',output:[call('call-1','list_chapters',{start:0,limit:10})]},
    {status:'completed',output:[call('call-2','search_book',{query:'第二章阿舟找到灯塔',limit:3})]},
    {status:'completed',output:[call('call-3','read_passage',{chapter:1,offset:0})]},
    message({answer:'阿舟找到了灯塔。',citations:['C1_0'],insufficient:false})
  ];
  const controller=new AgentController(async request=>{requests.push(request);return replies.shift();});
  let result=await start(controller);
  for(let i=0;i<3;i++){
    assert.equal(result.step,'tool_calls');
    const outputs=result.calls.map(c=>({call_id:c.call_id,output:executeAgentTool(book,c)}));
    result=await controller.continue({turnId:result.turnId,bookId,results:outputs});
  }
  assert.equal(result.mode,'agent');
  assert.match(result.answer,/灯塔/);
  assert.equal(result.evidence[0].chapter,1);
  assert.equal(result.evidence[0].offset,0);
  assert.equal(result.trace.length,3);
  assert.equal(requests[0].tool_choice,'required');
  assert.equal(requests[1].tool_choice,'auto');
  assert.ok(requests[1].input.some(item=>item.type==='function_call_output'&&item.call_id==='call-1'));
});

test('第四轮继续查阅后仍会获得一次最终回答机会',async()=>{
  const requests=[],replies=[
    {status:'completed',output:[call('a','list_chapters',{start:0,limit:2})]},
    {status:'completed',output:[call('b','search_book',{query:'第二章 灯塔',limit:3})]},
    {status:'completed',output:[call('c','read_passage',{chapter:1,offset:0})]},
    {status:'completed',output:[call('d','read_passage',{chapter:0,offset:0})]},
    message({answer:'阿舟在第二章找到灯塔。',citations:['C1_0'],insufficient:false})
  ];
  const controller=new AgentController(async request=>{requests.push(request);return replies.shift();});
  let result=await start(controller);
  for(let i=0;i<4;i++)result=await controller.continue({turnId:result.turnId,bookId,results:result.calls.map(c=>({call_id:c.call_id,output:executeAgentTool(book,c)}))});
  assert.equal(requests.length,5);
  assert.equal(requests[4].tool_choice,'auto');
  assert.equal(result.insufficient,false);
  assert.match(result.answer,/灯塔/);
});

test('七轮查阅后仍保留第八次模型请求用于回答',async()=>{
  const requests=[];
  const replies=[
    {status:'completed',output:[call('round-1','list_chapters',{start:0,limit:2})]},
    ...Array.from({length:6},(_,i)=>({status:'completed',output:[call(`round-${i+2}`,'read_passage',{chapter:1,offset:0})]})),
    message({answer:'第二章写阿舟找到了灯塔。',citations:['C1_0'],insufficient:false})
  ];
  const controller=new AgentController(async request=>{requests.push(request);return replies.shift();});
  let result=await start(controller);
  for(let i=0;i<7;i++){
    assert.equal(result.step,'tool_calls');
    result=await controller.continue({turnId:result.turnId,bookId,results:result.calls.map(c=>({call_id:c.call_id,output:executeAgentTool(book,c)}))});
  }
  assert.equal(requests.length,8);
  assert.equal(requests[7].tool_choice,'none');
  assert.equal(result.trace.length,7);
  assert.equal(result.insufficient,false);
});

test('模型在说明文字后附 JSON 代码块时仍提取受校验的答案',async()=>{
  const response={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'我核对了章节。\n```json\n'+JSON.stringify({answer:'阿舟找到了灯塔。',citations:['C1_0'],insufficient:false})+'\n```'}]}]};
  const controller=new AgentController(async ({input})=>input.length===1
    ?{status:'completed',output:[call('search-fenced','search_book',{query:'灯塔',limit:3})]}
    :response);
  const first=await start(controller);
  const result=await controller.continue({turnId:first.turnId,bookId,results:[{call_id:'search-fenced',output:executeAgentTool(book,first.calls[0])}]});
  assert.equal(result.insufficient,false);
  assert.match(result.answer,/灯塔/);
  assert.equal(result.evidence[0].chapter,1);
});

test('模型未按 JSON 输出时仅整理一次并继续校验原文引用',async()=>{
  const requests=[];
  const replies=[
    {status:'completed',output:[call('search-repair','search_book',{query:'灯塔',limit:3})]},
    {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'阿舟找到了灯塔。'}]}]},
    message({answer:'阿舟找到了灯塔。',citations:['C1_0'],insufficient:false})
  ];
  const controller=new AgentController(async request=>{requests.push(request);return replies.shift();});
  const first=await start(controller);
  const result=await controller.continue({turnId:first.turnId,bookId,results:[{call_id:'search-repair',output:executeAgentTool(book,first.calls[0])}]});
  assert.equal(requests.length,3);
  assert.equal(requests[2].tool_choice,'none');
  assert.equal(result.insufficient,false);
  assert.equal(result.evidence[0].chapter,1);
});

test('书外问题经过搜索后拒答，且不能附带无效依据',async()=>{
  const controller=new AgentController(async ({input})=>input.length===1
    ?{status:'completed',output:[call('search-1','search_book',{query:'今天股票价格',limit:3})]}
    :message({answer:'无法回答',citations:[],insufficient:true}));
  const first=await controller.start({question:'今天的股票价格是多少？',bookId,bookTitle:book.title,chapterCount:2});
  const output=executeAgentTool(book,first.calls[0]);
  assert.equal(output.sources.length,0);
  const result=await controller.continue({turnId:first.turnId,bookId,results:[{call_id:'search-1',output}]});
  assert.equal(result.insufficient,true);
  assert.equal(result.evidence.length,0);
  assert.match(result.answer,/无法回答/);
});

test('模型引用未检索到的片段时强制拒答',async()=>{
  const controller=new AgentController(async ({input})=>input.length===1
    ?{status:'completed',output:[call('search-2','search_book',{query:'阿舟 灯塔',limit:3})]}
    :message({answer:'凭空写出的答案',citations:['C99_0'],insufficient:false}));
  const first=await start(controller);
  const result=await controller.continue({turnId:first.turnId,bookId,results:[{call_id:'search-2',output:executeAgentTool(book,first.calls[0])}]});
  assert.equal(result.insufficient,true);
  assert.doesNotMatch(result.answer,/凭空/);
});

test('工具结果编号和原文位置必须有效',async()=>{
  const controller=new AgentController(async()=>({status:'completed',output:[call('search-3','search_book',{query:'阿舟',limit:3})]}));
  const first=await start(controller);
  await assert.rejects(()=>controller.continue({turnId:first.turnId,bookId,results:[{call_id:'wrong',output:{sources:[]}}]}),/缺少工具结果/);
  await assert.rejects(()=>controller.continue({turnId:first.turnId,bookId,results:[{call_id:'search-3',output:{sources:[{id:'C9_0',chapter:9,offset:0,title:'伪造',text:'伪造内容'}]}}]}),/工具原文结果无效/);
});

test('抽象提问关键词未命中时仍返回问题指定章节的原文',async()=>{
  const sample=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../samples/雾港钟表店.txt');
  const fog={chapters:splitText(await readFile(sample,'utf8'))};
  const call={name:'search_book',args:{query:'改变主意',limit:5}};
  assert.ok(executeAgentTool(fog,call).sources.some(source=>source.chapter!==2));
  const result=executeAgentTool(fog,call,'第二章的人物为什么改变主意');
  assert.equal(result.scope,'chapter_keyword');
  assert.ok(result.sources.some(source=>source.text.includes('沈伯一直以为他离开了雾港')));
  assert.ok(result.sources.every(source=>source.chapter===2));
});
