import http from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
const root=path.dirname(fileURLToPath(import.meta.url)), scrypt=promisify(scryptCallback);
const port=Number(process.env.PORT||4173), host=process.env.HOST||'127.0.0.1';
const data=process.env.DATA_DIR||path.join(root,'data');
await mkdir(data,{recursive:true});
const db=new DatabaseSync(path.join(data,'readease.sqlite'));
db.exec(await readFile(path.join(root,'schema.sql'),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const buckets=new Map();
let fileAiConfig={};
const aiConfigPath=process.env.AI_CONFIG_PATH||path.join(root,'config','ai-config.json');
try{fileAiConfig=JSON.parse((await readFile(aiConfigPath,'utf8')).replace(/^\uFEFF/,''));}catch(error){if(error.code!=='ENOENT')console.warn('无法读取 AI 配置文件，将忽略其中配置。');}
const aiProvider=String(process.env.AI_PROVIDER||fileAiConfig.provider||'openai').toLowerCase();
const aiConfig=aiProvider==='deepseek'
  ? {key:process.env.DEEPSEEK_API_KEY||fileAiConfig.apiKey||'',model:process.env.AI_MODEL||process.env.DEEPSEEK_MODEL||fileAiConfig.model||'deepseek-v4-pro',url:'https://api.deepseek.com/responses'}
  : {key:process.env.OPENAI_API_KEY||fileAiConfig.apiKey||'',model:process.env.AI_MODEL||process.env.OPENAI_MODEL||fileAiConfig.model||'gpt-4.1-mini',url:'https://api.openai.com/v1/responses'};
const aiStats={requests:0,successes:0,failures:0,lastAt:null,lastResult:'尚未调用'};
const aiAuditPath=path.join(data,'assistant-audit.json');
try{Object.assign(aiStats,JSON.parse(await readFile(aiAuditPath,'utf8')))}catch(error){if(error.code!=='ENOENT')console.warn('无法读取 AI 调用记录，将重新开始计数。');}
async function saveAiStats(){await writeFile(aiAuditPath,JSON.stringify(aiStats),'utf8');}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.epub':'application/epub+zip','.pdf':'application/pdf'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>512*1024)throw Object.assign(new Error('请求内容过大'),{status:413});chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw Object.assign(new Error('JSON 格式错误'),{status:400});}}
function user(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('readease_session='))?.slice(17);if(!token)return null;return db.prepare('SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(sha(token),Date.now());}
function session(res,id){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(token),id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`readease_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);}
function fail(status,message){throw Object.assign(new Error(message),{status});}
function assistantSources(value){
  if(!Array.isArray(value)||value.length>12)fail(400,'原文依据数量无效');
  return value.map((source,index)=>{
    if(!source||typeof source!=='object')fail(400,'原文依据格式无效');
    const title=String(source.title||'').trim(),text=String(source.text||'').trim();
    if(!title||title.length>150||!text||text.length>1200||!Number.isSafeInteger(source.chapter)||source.chapter<0||!Number.isSafeInteger(source.offset)||source.offset<0)fail(400,'原文依据内容无效');
    return {label:`S${index+1}`,title,text,chapter:source.chapter,offset:source.offset};
  });
}
async function modelAnswer(question,sources){
  const evidence=sources.map(s=>`[${s.label}] 《${s.title}》\n${s.text}`).join('\n\n');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  aiStats.requests++;aiStats.lastAt=Date.now();aiStats.lastResult='正在调用模型';await saveAiStats();
  try{
    const response=await fetch(aiConfig.url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':`Bearer ${aiConfig.key}`},body:JSON.stringify({model:aiConfig.model,instructions:'你是当前书籍的阅读助手。只根据给出的编号原文 [S1] 等回答，不补充书外事实。读者可能正在阅读别的章节。问题可能使用代词、简称、同义说法或跨章节概括，不要求与原文字面一致。可以综合多段原文作有依据的概括和直接推断。回答只覆盖问题所问，优先用一两句话给出具体结论，不延伸无关后续或猜测象征意义；在结论后标注实际使用的依据编号，例如 [S2]。只有问题与这本书无关，或所给原文确实缺少作答所必需的信息时才拒答；不要仅因没有逐字匹配或没有单段直接写出结论而拒答。请只输出合法 JSON：{"answer":"中文答案和真实依据编号","insufficient":false}。确实无法回答时输出：{"answer":"无法回答：这本书没有提供相关依据。","insufficient":true}。不得输出 Markdown 或 JSON 以外的内容。',input:`读者问题：${question}\n\n原文依据：\n${evidence}`,max_output_tokens:600,reasoning:{effort:'none'},text:{format:{type:'json_object'}}})});
    if(!response.ok){console.error('AI service error',response.status);aiStats.failures++;aiStats.lastResult=`请求失败（HTTP ${response.status}）`;await saveAiStats();fail(502,`模型服务请求失败（HTTP ${response.status}）`);}
    const payload=await response.json();
    const raw=String(payload.output_text||payload.output?.filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(part=>part.type==='output_text').map(part=>part.text).join('')||'').trim();
    let answer='';try{const structured=JSON.parse(raw);answer=typeof structured.answer==='string'?structured.answer.trim():'';}catch{answer=raw;}
    if(!answer){aiStats.failures++;aiStats.lastResult='模型未返回文字回答';await saveAiStats();fail(502,'模型服务未返回可用回答');}
    aiStats.successes++;aiStats.lastResult='调用成功';await saveAiStats();
    return answer.slice(0,1000);
  }catch(error){if(error.name==='AbortError'){aiStats.failures++;aiStats.lastResult='请求超时';await saveAiStats();fail(504,'模型服务响应超时');}if(aiStats.lastResult==='正在调用模型'){aiStats.failures++;aiStats.lastResult='请求异常';await saveAiStats();}throw error;}finally{clearTimeout(timer);}
}
function validState(s){if(!s||typeof s!=='object'||!Number.isSafeInteger(s.chapter)||s.chapter<0||!Number.isSafeInteger(s.offset)||s.offset<0||typeof s.progress!=='number'||s.progress<0||s.progress>1||!Array.isArray(s.bookmarks)||!Array.isArray(s.notes)||s.bookmarks.length>1000||s.notes.length>1000)return false;return [...s.bookmarks,...s.notes].every(x=>x&&typeof x.id==='string'&&x.id.length<=100&&Number.isSafeInteger(x.chapter)&&x.chapter>=0&&Number.isSafeInteger(x.offset)&&x.offset>=0&&(!x.text||typeof x.text==='string'&&x.text.length<=10000)&&(!x.quote||typeof x.quote==='string'&&x.quote.length<=2000));}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try{
    const url=new URL(req.url,'http://localhost');
    if(!['GET','HEAD','POST','PUT','DELETE'].includes(req.method))return json(res,405,{error:'不支持此方法'});
    if(url.pathname.startsWith('/api/')){
      if(['POST','PUT','DELETE'].includes(req.method)){
        if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)fail(403,'请求来源不匹配');
        if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'请使用 JSON 请求');
      }
      const me=user(req);
      if(url.pathname==='/api/health')return json(res,200,{ok:true,version:'1.0.0'});
      if(url.pathname==='/api/catalog'&&req.method==='GET')return json(res,200,JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8')));
      if(url.pathname==='/api/me'&&req.method==='GET')return json(res,200,{user:me||null});
      if(url.pathname==='/api/assistant/status'&&req.method==='GET')return json(res,200,{configured:Boolean(aiConfig.key),provider:aiProvider,model:aiConfig.model,stats:aiStats});
      if(url.pathname==='/api/assistant/answer'&&req.method==='POST'){
        const p=await body(req),question=String(p.question||'').trim();
        if(!question||question.length>300)fail(400,'问题需要是 1–300 个字符');
        const sources=assistantSources(p.sources);
        if(!sources.length)fail(400,'请先提供原文依据');
        if(!aiConfig.key)return json(res,200,{mode:'local',answer:null,provider:aiProvider,model:aiConfig.model});
        return json(res,200,{mode:'ai',provider:aiProvider,model:aiConfig.model,answer:await modelAnswer(question,sources)});
      }
      if(['/api/register','/api/login'].includes(url.pathname)&&req.method==='POST'){
        const key=req.socket.remoteAddress,b=buckets.get(key)||{at:Date.now(),n:0};if(Date.now()-b.at>60000){b.at=Date.now();b.n=0;}b.n++;buckets.set(key,b);if(b.n>15)fail(429,'尝试过于频繁，请稍后再试');
        const p=await body(req),email=String(p.email||'').trim().toLowerCase(),password=String(p.password||'');
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<8||password.length>128)fail(400,'请输入有效邮箱和 8–128 位密码');
        if(url.pathname==='/api/register'){
          if(db.prepare('SELECT id FROM users WHERE email=?').get(email))fail(409,'此邮箱已注册');
          const name=String(p.name||'读者').trim().slice(0,40)||'读者',salt=randomBytes(16).toString('hex'),hash=(await scrypt(password,salt,64)).toString('hex'),id=randomUUID();
          try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,email,name,salt,hash,Date.now());}catch(e){if(e.message.includes('UNIQUE'))fail(409,'此邮箱已注册');throw e;}
          session(res,id);return json(res,201,{user:{id,email,name}});
        }
        const u=db.prepare('SELECT * FROM users WHERE email=?').get(email),actual=await scrypt(password,u?.salt||'missing-account-salt',64);
        if(!u||!timingSafeEqual(actual,Buffer.from(u.hash,'hex')))fail(401,'邮箱或密码不正确');session(res,u.id);return json(res,200,{user:{id:u.id,email:u.email,name:u.name}});
      }
      if(url.pathname==='/api/logout'&&req.method==='POST'){
        const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('readease_session='))?.slice(17);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));res.setHeader('Set-Cookie','readease_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});
      }
      if(!me)fail(401,'请先登录');
      if(url.pathname==='/api/me'&&req.method==='PUT'){const p=await body(req),name=String(p.name||'').trim();if(!name||name.length>40)fail(400,'昵称需要 1–40 个字符');db.prepare('UPDATE users SET name=? WHERE id=?').run(name,me.id);return json(res,200,{user:{...me,name}});}
      if(url.pathname==='/api/sync'&&req.method==='GET')return json(res,200,{items:db.prepare('SELECT book_id,revision,payload,updated_at FROM reading_state WHERE user_id=?').all(me.id).map(x=>({bookId:x.book_id,revision:x.revision,state:JSON.parse(x.payload),updatedAt:x.updated_at}))});
      if(url.pathname.startsWith('/api/sync/')&&req.method==='PUT'){
        const bookId=url.pathname.slice(10);if(!/^[a-f0-9]{64}$/.test(bookId))fail(400,'无效书籍标识');const p=await body(req);if(!Number.isSafeInteger(p.revision)||p.revision<0||!validState(p.state))fail(400,'阅读数据不符合约束');
        // Compare-and-swap inside a transaction: stale clients must resolve conflicts explicitly.
        db.exec('BEGIN IMMEDIATE');try{const old=db.prepare('SELECT revision,payload FROM reading_state WHERE user_id=? AND book_id=?').get(me.id,bookId);if((old?.revision||0)!==p.revision){db.exec('ROLLBACK');return json(res,409,{error:'此书在另一设备上有更新',revision:old?.revision||0,state:old?JSON.parse(old.payload):null});}const revision=p.revision+1;db.prepare('INSERT INTO reading_state VALUES(?,?,?,?,?) ON CONFLICT(user_id,book_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(me.id,bookId,revision,JSON.stringify(p.state),Date.now());db.exec('COMMIT');return json(res,200,{revision});}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}
      }
      return json(res,404,{error:'接口不存在'});
    }
    let rel=decodeURIComponent(url.pathname);if(rel==='/')rel='/index.html';const sample=rel.startsWith('/samples/'),base=path.join(root,sample?'samples':'app');if(sample)rel=rel.slice(8);const full=path.resolve(base,'.'+rel);if(!full.startsWith(base+path.sep))fail(403,'无效路径');
    let bytes;try{bytes=await readFile(full);}catch{return json(res,404,{error:'文件不存在'});}res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){json(res,e.status||500,{error:e.status?e.message:'服务暂时不可用'});if(!e.status)console.error(e);}
});
server.listen(port,host,()=>console.log(`ReadEase http://${host}:${port}`));
const cleanup=setInterval(()=>{db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());for(const [k,b]of buckets)if(Date.now()-b.at>60000)buckets.delete(k);},60000);cleanup.unref();
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0)}));
