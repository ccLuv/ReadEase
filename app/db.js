let database;
export async function db(){if(database)return database;database=await new Promise((resolve,reject)=>{const r=indexedDB.open('readease-v1',1);r.onupgradeneeded=()=>{for(const name of ['books','states','settings'])r.result.createObjectStore(name,{keyPath:'key'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});return database;}
async function op(store,mode,fn){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(store,mode),r=fn(t.objectStore(store));t.oncomplete=()=>resolve(r?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('保存失败'));});}
export const all=store=>op(store,'readonly',s=>s.getAll());
export const get=(store,key)=>op(store,'readonly',s=>s.get(key));
export const put=(store,value)=>op(store,'readwrite',s=>s.put(value));
export const remove=(store,key)=>op(store,'readwrite',s=>s.delete(key));
