import {openDB,type DBSchema,type IDBPDatabase} from 'idb';
import {HistorySaveError,type HistoryRecord} from './historyTypes';

const DATABASE_NAME='travel-marketing-history';
const DATABASE_VERSION=1;
const STORE_NAME='records';
const CREATED_AT_INDEX='by-created-at';
const RECORD_LIMIT=20;

interface HistoryDatabase extends DBSchema{
  records:{
    key:string;
    value:HistoryRecord;
    indexes:{'by-created-at':string};
  };
}

async function openHistoryDatabase():Promise<IDBPDatabase<HistoryDatabase>>{
  return openDB<HistoryDatabase>(DATABASE_NAME,DATABASE_VERSION,{
    upgrade(database){
      const store=database.createObjectStore(STORE_NAME,{keyPath:'id'});
      store.createIndex(CREATED_AT_INDEX,'createdAt');
    },
  });
}

function newestFirst(left:HistoryRecord,right:HistoryRecord):number{
  return right.createdAt.localeCompare(left.createdAt)||right.id.localeCompare(left.id);
}

function oldestFirst(left:HistoryRecord,right:HistoryRecord):number{
  return left.createdAt.localeCompare(right.createdAt)||left.id.localeCompare(right.id);
}

function isQuotaExceeded(error:unknown):boolean{
  return typeof error==='object'&&error!==null&&'name' in error&&error.name==='QuotaExceededError';
}

async function withDatabase<T>(operation:(database:IDBPDatabase<HistoryDatabase>)=>Promise<T>):Promise<T>{
  const database=await openHistoryDatabase();
  try{
    return await operation(database);
  }finally{
    database.close();
  }
}

async function listRecords():Promise<HistoryRecord[]>{
  return withDatabase(async database=>{
    const records=await database.getAllFromIndex(STORE_NAME,CREATED_AT_INDEX);
    return records.sort(newestFirst);
  });
}

async function getRecord(id:string):Promise<HistoryRecord|undefined>{
  return withDatabase(database=>database.get(STORE_NAME,id));
}

async function writeRecordAndTrim(record:HistoryRecord,limit:number):Promise<void>{
  await withDatabase(async database=>{
    const transaction=database.transaction(STORE_NAME,'readwrite');
    try{
      await transaction.store.put(record);
      const records=(await transaction.store.getAll()).sort(newestFirst);
      await Promise.all(records.slice(limit).map(({id})=>transaction.store.delete(id)));
      await transaction.done;
    }catch(error){
      try{
        transaction.abort();
      }catch{
        // The browser may already have aborted a failed quota transaction.
      }
      await transaction.done.catch(()=>undefined);
      throw error;
    }
  });
}

async function deleteOldestRecord():Promise<void>{
  await withDatabase(async database=>{
    const transaction=database.transaction(STORE_NAME,'readwrite');
    const oldest=(await transaction.store.getAll()).sort(oldestFirst)[0];
    if(oldest){
      await transaction.store.delete(oldest.id);
    }
    await transaction.done;
  });
}

async function putRecordAndTrim(record:HistoryRecord,limit:number):Promise<void>{
  try{
    await writeRecordAndTrim(record,limit);
    return;
  }catch(error){
    if(!isQuotaExceeded(error)){
      throw new HistorySaveError('无法保存本机历史记录。',{cause:error});
    }
  }

  try{
    await deleteOldestRecord();
    await writeRecordAndTrim(record,limit);
  }catch(error){
    throw new HistorySaveError('本机存储空间不足，无法保存历史记录。',{cause:error});
  }
}

async function deleteRecord(id:string):Promise<void>{
  await withDatabase(async database=>{
    const transaction=database.transaction(STORE_NAME,'readwrite');
    await transaction.store.delete(id);
    await transaction.done;
  });
}

async function clearRecords():Promise<void>{
  await withDatabase(async database=>{
    const transaction=database.transaction(STORE_NAME,'readwrite');
    await transaction.store.clear();
    await transaction.done;
  });
}

export const historyRepository={
  list:():Promise<HistoryRecord[]>=>listRecords(),
  get:(id:string):Promise<HistoryRecord|undefined>=>getRecord(id),
  put:(record:HistoryRecord):Promise<void>=>putRecordAndTrim(record,RECORD_LIMIT),
  delete:(id:string):Promise<void>=>deleteRecord(id),
  clear:():Promise<void>=>clearRecords(),
};
