import test from 'node:test';
import assert from 'node:assert/strict';
import { measuredState, prototypeOutlook, onsiteAlert } from '../shared/prototype.js';
import { environmentStates } from '../shared/environment.js';
import { reading } from './fixtures.mjs';
test('sensores ambientales: límites, histéresis y calidad independientes del nivel',()=>{
  let r=reading({humidityPct:85,temperatureC:35,quality:{levelValid:false,climateValid:true}});
  assert.deepEqual(environmentStates(r),{rain:'wet',humidity:'high',temperature:'high'});
  assert.equal(environmentStates({...r,humidityPct:82},{humidity:'high'}).humidity,'high');
  assert.equal(environmentStates({...r,humidityPct:79},{humidity:'high'}).humidity,'normal');
  assert.deepEqual(environmentStates({...r,sensorAgeMs:{climate:11000,rain:4000}}),{rain:'unknown',humidity:'unknown',temperature:'unknown'});
});
test('maqueta: límites inclusivos y estimación separada del estado medido',()=>{
  assert.deepEqual([0,5.99,6,7.99,8,9.99,10,12].map(measuredState),[0,0,1,1,2,2,3,3]);
  assert.equal(measuredState(null),null);
  assert.equal(prototypeOutlook(3,null),null);
  assert.equal(prototypeOutlook(3,0.2).trend,'estable');
  assert.equal(prototypeOutlook(3,-1).trend,'bajando');
  assert.equal(prototypeOutlook(3,-1).approaching,false);
  assert.equal(prototypeOutlook(5,0.5).minutes,2);
  assert.equal(prototypeOutlook(5,0.5).approaching,true);
  assert.equal(measuredState(3),0);
  assert.equal(prototypeOutlook(0,0.4).approaching,false);
});

test('aviso en la página: anticipación, umbrales, recuperación y datos ausentes',()=>{
  assert.equal(onsiteAlert(3,0,0),null);
  assert.equal(onsiteAlert(5,0,0.5).title,'Aviso anticipado: subida del agua');
  assert.equal(onsiteAlert(5,0,-0.5),null);
  for(const [cm,state,severity] of [[6,1,'attention'],[8,2,'warning'],[10,3,'critical']]) {
    const notice=onsiteAlert(cm,state,0);
    assert.equal(notice.severity,severity);
    assert.match(notice.body,new RegExp(`${cm.toFixed(1)} de 12 cm`));
    if(state>=2) assert.match(notice.title,/Peligro/);
  }
  assert.equal(onsiteAlert(4,0,0),null);
  assert.equal(onsiteAlert(null,3,1),null);
  assert.equal(onsiteAlert(3,9,1),null);
});
