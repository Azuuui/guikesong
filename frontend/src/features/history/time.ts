const DAY_IN_MILLISECONDS=24*60*60*1000;

type DateTimeParts={
  year:number;
  month:number;
  day:number;
  hour:string;
  minute:string;
};

function getDateTimeParts(date:Date,timeZone:string):DateTimeParts{
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23',
  }).formatToParts(date);
  const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value??'';
  return {
    year:Number(value('year')),
    month:Number(value('month')),
    day:Number(value('day')),
    hour:value('hour'),
    minute:value('minute'),
  };
}

function calendarDay(parts:DateTimeParts):number{
  return Date.UTC(parts.year,parts.month-1,parts.day)/DAY_IN_MILLISECONDS;
}

function pad(value:number):string{
  return String(value).padStart(2,'0');
}

export function formatHistoryTime(
  createdAt:string,
  now=new Date(),
  timeZone='Asia/Tokyo',
):string{
  const saved=getDateTimeParts(new Date(createdAt),timeZone);
  const current=getDateTimeParts(now,timeZone);
  const dayDifference=calendarDay(current)-calendarDay(saved);
  const time=`${saved.hour}:${saved.minute}`;

  if(dayDifference===0){
    return `今天 ${time}`;
  }
  if(dayDifference===1){
    return `昨天 ${time}`;
  }
  if(saved.year===current.year){
    return `${pad(saved.month)}月${pad(saved.day)}日 ${time}`;
  }
  return `${saved.year}年${pad(saved.month)}月${pad(saved.day)}日 ${time}`;
}
