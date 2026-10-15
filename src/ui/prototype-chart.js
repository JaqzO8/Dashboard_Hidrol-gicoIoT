let chart,signature,revision=0;
export async function renderPrototypeChart(rows,live) {
  const element=document.getElementById('prototypeChart'); if(!element) return;
  const last=rows.at(-1), key=`${last?.entryId}:${live}`;
  if(signature===key) return; signature=key; const rev=++revision;
  const {echarts}=await import('./charts.js'); if(rev!==revision) return;
  chart ||= echarts.init(element);
  const measured=rows.slice(-120).map(r=>[r.date.getTime(),r.quality.levelValid&&r.sensorAgeMs.level<=3000&&r.level!==null?r.level*100:null]);
  const projection=live&&Number.isFinite(last?.speed)&&Number.isFinite(last?.level)?[[last.date.getTime(),last.level*100],[last.date.getTime()+180000,Math.max(0,last.level*100+last.speed*3)]]:[];
  chart.setOption({animation:false,legend:{data:['Medido (cm)','Estimación (cm)']},grid:{top:55,left:45,right:20,bottom:45},
    tooltip:{trigger:'axis'},xAxis:{type:'time',axisLabel:{formatter:value=>new Date(value).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'America/Lima'})}},
    yAxis:{type:'value',name:'cm · maqueta',min:0,max:value=>Math.max(12,Math.ceil(value.max))},
    series:[{name:'Medido (cm)',type:'line',data:measured,showSymbol:false,connectNulls:false,lineStyle:{color:'#0284c7',width:3},itemStyle:{color:'#0284c7'},markLine:{silent:true,symbol:'none',data:[{yAxis:6,name:'Atención',label:{formatter:'6 cm'}},{yAxis:8,name:'Alto',label:{formatter:'8 cm'}},{yAxis:10,name:'Crítico',label:{formatter:'10 cm'}},{yAxis:12,name:'Capacidad',label:{formatter:'12 cm'}}]}},
    {name:'Estimación (cm)',type:'line',data:projection,lineStyle:{color:'#d97706',type:'dashed',width:2},itemStyle:{color:'#d97706'},showSymbol:true}]},true);
}
if(typeof window!=='undefined') window.addEventListener('resize',()=>chart?.resize());
