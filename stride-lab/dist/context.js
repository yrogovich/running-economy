export function captureRunContext({speed,heartRate,surface}) {
 const optionalNumber=(raw,min,max,label)=>{
  if(raw===null || raw===undefined || String(raw).trim()==='')return null;
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} must be between ${min} and ${max}, or left blank.`);
  return value;
 };
 return Object.freeze({speedKmh:optionalNumber(speed,3,30,'Running speed (km/h)'),averageHeartRateBpm:optionalNumber(heartRate,30,240,'Average heart rate (bpm)'),surface});
}
