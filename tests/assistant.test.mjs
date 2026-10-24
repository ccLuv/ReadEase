import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findEvidence,localAnswer} from '../app/assistant.js';

const book={chapters:[
  {title:'第一章 星河',text:'夜航员在港口等待。星河尽头有一座安静的灯塔，灯塔每晚为归航的人点亮。'},
  {title:'第二章 雨季',text:'雨季到来后，港口的钟声仍然准时响起。'}
]};

test('本地检索返回相关章节、原文与可跳转偏移',()=>{
  const evidence=findEvidence(book,'星河尽头有什么？');
  assert.equal(evidence[0].chapter,0);
  assert.equal(evidence[0].offset,0);
  assert.match(evidence[0].text,/灯塔/);
  assert.match(localAnswer('星河尽头有什么？',evidence),/第一章 星河/);
});

test('第二章问题检索第二章，与当前阅读位置无关',()=>{
  const evidence=findEvidence(book,'第二章雨季到来后发生了什么？',3);
  assert.equal(evidence[0].chapter,1);
  assert.match(evidence[0].text,/钟声/);
});

test('不写章节号也能从全书找到第二章内容',()=>{
  const evidence=findEvidence(book,'钟声何时响起？',3);
  assert.equal(evidence[0].chapter,1);
});

test('第二章的概括问题使用第二章原文',()=>{
  const evidence=findEvidence(book,'第二章主要讲了什么？',3);
  assert.ok(evidence.length>0);
  assert.ok(evidence.every(item=>item.chapter===1));
});

test('含序章的书按章节标题定位第二章',()=>{
  const withPreface={chapters:[{title:'序章',text:'故事的开端。'},...book.chapters]};
  const evidence=findEvidence(withPreface,'第二章雨季发生了什么？',3);
  assert.ok(evidence.length>0);
  assert.ok(evidence.every(item=>item.chapter===2));
});

test('书外问题没有原文依据',()=>{
  assert.deepEqual(findEvidence(book,'今天的股票价格是多少？'),[]);
  assert.match(localAnswer('今天的股票价格是多少？',[]),/无法回答/);
});

test('单字人物名也能找到书内原文',()=>{
  const story={chapters:[{title:'第二章 引路人',text:'遥是这列火车的引路人，她每隔七年带乘客穿过星河。'}]};
  const evidence=findEvidence(story,'遥是谁？',12);
  assert.equal(evidence[0].chapter,0);
  assert.match(evidence[0].text,/引路人/);
});

test('亲属称呼的不同说法仍能定位相关段落',()=>{
  const story={chapters:[{title:'第五章 灯塔',text:'父亲许远进入检修井阻止闸门误开，后来井口坍塌，他被困了三年。'}]};
  const evidence=findEvidence(story,'爸爸为什么失踪三年？',12);
  assert.match(evidence[0].text,/父亲许远/);
});

test('真实示例书的人物问题命中，书外问题仍被拒绝',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {splitText}=await import('../app/parsers.js');
  const chapters=splitText(await readFile(new URL('../samples/星河邮差.txt',import.meta.url),'utf8'));
  assert.ok(findEvidence({chapters},'遥是谁？',12).some(item=>item.text.includes('引路人')));
  assert.deepEqual(findEvidence({chapters},'今天的股票价格是多少？',12),[]);
});

test('全书概括检索覆盖多个章节而非只取一个关键词命中',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {splitText}=await import('../app/parsers.js');
  const chapters=splitText(await readFile(new URL('../samples/雾港钟表店.txt',import.meta.url),'utf8'));
  const evidence=findEvidence({chapters},'这本书主要讲了些什么？',8);
  assert.ok(new Set(evidence.map(item=>item.chapter)).size>=5);
  assert.ok(evidence.some(item=>item.title.startsWith('第五章')));
  assert.ok(evidence.every(item=>item.text.trim().length>=40));
});
