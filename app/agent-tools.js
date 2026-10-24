import {findEvidence} from './assistant.js';

const sourceId=(chapter,offset)=>`C${chapter}_${offset}`;
const passage=(book,chapter,offset,text)=>({id:sourceId(chapter,offset),chapter,offset,title:String(book.chapters[chapter]?.title||`第 ${chapter+1} 章`).slice(0,150),text:text.slice(0,1200)});
const chapterMention=/第[一二三四五六七八九十百零〇两\d]+章/;

// The book lives in this browser's IndexedDB. Tool execution stays local;
// only the returned excerpts go through the model gateway.
export function executeAgentTool(book,call,originalQuestion=''){
  if(!book||!Array.isArray(book.chapters)||!call||typeof call!=='object')throw Error('书籍工具不可用');
  const a=call.args||{};
  if(call.name==='list_chapters'){
    if(!Number.isInteger(a.start)||a.start<0||!Number.isInteger(a.limit)||a.limit<1||a.limit>40)throw Error('目录参数无效');
    return {count:book.chapters.length,chapters:book.chapters.slice(a.start,a.start+a.limit).map((chapter,i)=>({index:a.start+i,title:String(chapter.title||`第 ${a.start+i+1} 章`).slice(0,150)}))};
  }
  if(call.name==='search_book'){
    if(typeof a.query!=='string'||!a.query.trim()||a.query.length>200||!Number.isInteger(a.limit)||a.limit<1||a.limit>8)throw Error('搜索参数无效');
    const requestedChapter=originalQuestion.match(chapterMention)?.[0];
    const focused=Boolean(requestedChapter&&!chapterMention.test(a.query)&&!a.query.includes('全书'));
    const query=focused?`${requestedChapter} ${a.query}`:a.query;
    let hits=findEvidence(book,query,a.limit),scope=focused?'chapter_keyword':'keyword';
    // The model may shorten a chapter-specific question to an abstract phrase
    // absent from the text. Give it that chapter's excerpts as context.
    if(!hits.length&&requestedChapter){
      hits=findEvidence(book,originalQuestion,a.limit);if(hits.length)scope='question_chapter';
    }
    return {scope,sources:hits.filter(item=>item.text?.trim()).map(item=>passage(book,item.chapter,item.offset,item.text))};
  }
  if(call.name==='read_passage'){
    if(!Number.isInteger(a.chapter)||a.chapter<0||a.chapter>=book.chapters.length||!Number.isInteger(a.offset)||a.offset<0)throw Error('原文位置无效');
    const text=String(book.chapters[a.chapter].text||'');
    if(!text.trim())return {sources:[]};
    const center=Math.min(a.offset,text.length),start=Math.max(0,center-400),end=Math.min(text.length,center+760);
    return {sources:[passage(book,a.chapter,start,text.slice(start,end))]};
  }
  throw Error('不支持的书籍工具');
}
