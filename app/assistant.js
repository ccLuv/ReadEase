const clean=text=>String(text||'').replace(/\s+/g,' ').trim();

const stopWords=new Set(['什么','哪些','怎么','如何','为什么','是否','有何','这个','那个','这里','那里','本书','这本','书中','小说','故事','内容','章节','一章','二章','三章','四章','五章','主要','讲述','讲了','讲的','发生','回答','问题','请问','一下','作者','文中','里面','有关','关于','以及','还有','一个','一些','多少','能否','可以','告诉','请你','谁是','是谁']);
const singleStopWords=new Set('你我他她它谁哪何这那的一了是有在和与及之将把被到从后前里中上下来去时年天月日个本书章篇说问讲能会要得着啊呀呢吧吗又都还就才很更最些其所为于对因果怎什');
const synonymGroups=[['父亲','爸爸','爹'],['母亲','妈妈','娘'],['火车','列车','那辆车','那列车'],['钟表','时钟','钟'],['离开','走了','离去'],['失踪','消失','不见'],['结束','结局','最后'],['信件','书信','信封'],['原因','缘故']];

function chapterNumber(question){
  const match=question.match(/第([一二三四五六七八九十百零〇两\d]+)章/);
  if(!match)return null;
  if(/^\d+$/.test(match[1]))return Number(match[1])-1;
  const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  const value=match[1];
  if(value==='十')return 9;
  if(value.includes('十')){const [left,right]=value.split('十');return (left?digits[left]:1)*10+(right?digits[right]:0)-1;}
  return digits[value]===undefined?null:digits[value]-1;
}

function keywords(question){
  const cleaned=String(question||'').replace(/第[一二三四五六七八九十百零〇两\d]+章/g,' ')
    .replace(/这本书|这部书|整本书|这一章|该章节|本章节|这章节/g,' ')
    .replace(/请问|告诉我|讲了什么|讲的是什么|主要讲述|主要内容|是什么|有哪些|怎么样|为什么|如何|什么|哪些|怎么|是否|有关|关于|里面|文中|书中|内容|问题|回答|全书|今天|明天|昨天|现在|目前|当前|多少|几号|在哪里|在哪儿/g,' ')
    .replace(/[的了吗呢吧啊呀是有在和与及之将把被]/g,' ');
  const latin=cleaned.toLowerCase().match(/[a-z0-9]{2,}/g)||[];
  const groups=cleaned.match(/[\u4e00-\u9fff]+/g)||[];
  const chinese=groups.flatMap(group=>{
    const out=group.length<=8?[group]:[];
    for(let i=0;i<group.length-1;i++)out.push(group.slice(i,i+2));
    if(group.length===1&&!singleStopWords.has(group))out.push(group);
    return out;
  });
  const aliases=synonymGroups.filter(group=>group.some(term=>question.includes(term))).flat();
  return [...new Set([...latin,...chinese,...aliases])].filter(x=>!stopWords.has(x)).slice(0,32);
}

function segments(chapter,chapterIndex){
  const text=String(chapter.text||'');
  const out=[];let buffer='',start=0;
  for(const match of text.matchAll(/[^。！？\n]*[。！？\n]?/g)){
    const block=match[0];if(!block)continue;
    if(buffer&&buffer.length+block.length>360){if(buffer.trim())out.push({chapter:chapterIndex,offset:start,text:buffer});buffer='';}
    if(!buffer)start=match.index;
    if(block.length>360){
      for(let pos=0;pos<block.length;pos+=360){const part=block.slice(pos,pos+360);if(part.trim())out.push({chapter:chapterIndex,offset:match.index+pos,text:part});}
      buffer='';
    }else buffer+=block;
  }
  if(buffer.trim())out.push({chapter:chapterIndex,offset:start,text:buffer});
  return out.length?out:[{chapter:chapterIndex,offset:0,text:clean(text).slice(0,360)}];
}

export function findEvidence(book,question,limit=3){
  let target=chapterNumber(question);
  if(target!==null){const titled=book.chapters.findIndex(chapter=>chapterNumber(chapter.title)===target);if(titled>=0)target=titled;}
  if(target!==null&&(target<0||target>=book.chapters.length))return [];
  const terms=keywords(question);
  const all=book.chapters.flatMap((chapter,index)=>segments(chapter,index).map(item=>({
    ...item,title:chapter.title,score:0
  }))).filter(item=>target===null||item.chapter===target);
  const frequency=new Map(terms.map(term=>[term,all.filter(item=>item.text.toLowerCase().includes(term.toLowerCase())).length]));
  for(const item of all){
    const lower=item.text.toLowerCase();
    let score=0;
    for(const term of terms){const t=term.toLowerCase();let from=0,count=0;while((from=lower.indexOf(t,from))>=0&&count<3){score+=(term.length>2?3:term.length===2?2:1)*(1+Math.log((all.length+1)/(1+frequency.get(term))));from+=t.length;count++;}}
    if(terms.some(term=>item.title.toLowerCase().includes(term.toLowerCase())))score+=2;
    item.score=score;
  }
  const hits=all.filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.chapter-b.chapter).slice(0,limit);
  if(hits.length){
    const selected=hits.slice(0,Math.min(hits.length,Math.max(1,Math.ceil(limit*2/3))));
    for(const hit of [...selected]){
      const index=all.indexOf(hit);
      for(const neighbor of [all[index-1],all[index+1]])if(neighbor&&neighbor.chapter===hit.chapter&&!selected.includes(neighbor)&&selected.length<limit)selected.push(neighbor);
    }
    for(const hit of hits)if(!selected.includes(hit)&&selected.length<limit)selected.push(hit);
    return selected;
  }
  // A chapter can answer a semantic question even when it shares no literal
  // keyword with the question. Send excerpts from across that chapter and let
  // the model say that the evidence is insufficient when appropriate.
  if(target!==null)return sampleAcross(all,limit);
  // Whole-book summary questions draw short passages across the book.
  if(!terms.length&&/这本书|这部书|整本书|全书/.test(question))return sampleAcross(all.filter((item,index)=>index===all.findIndex(x=>x.chapter===item.chapter)),limit);
  return [];
}

function sampleAcross(items,limit){
  if(items.length<=limit)return items;
  return Array.from({length:limit},(_,i)=>items[Math.floor(i*(items.length-1)/Math.max(1,limit-1))]);
}

export function localAnswer(question,evidence){
  if(!evidence.length)return '无法回答：在这本书中没有找到与问题相关的原文依据。';
  if(evidence.every(item=>item.score===0))return '无法回答：离线检索没有找到足够明确的原文依据。请配置模型后重试，或使用更具体的书内关键词。';
  const first=evidence[0];
  return `我先在《${first.title}》中找到 ${evidence.length} 段可核对的相关内容。当前为离线检索模式，请查看下方原文依据并点击跳转核对：\n\n${first.text}`;
}
