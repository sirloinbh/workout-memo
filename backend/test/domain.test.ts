import {test} from 'node:test';
import assert from 'node:assert/strict';
import {date,goalSchema,workoutSchema,volume} from '../src/domain.js';
test('reject impossible calendar dates and reversed goal periods',()=>{assert.equal(date.safeParse('2026-02-30').success,false);assert.equal(date.safeParse('2024-02-29').success,true);assert.equal(goalSchema.safeParse({exercise:'Squat',target_weight:100,target_reps:10,start_date:'2026-10-14',deadline:'2026-10-13'}).success,false);});
test('reject empty sessions and invalid sets',()=>{const base={date:'2026-10-14',title:'하체',sets:[]};assert.equal(workoutSchema.safeParse(base).success,false);assert.equal(workoutSchema.safeParse({...base,sets:[{exercise:'Squat',weight:-1,reps:10}]}).success,false);assert.equal(workoutSchema.safeParse({...base,sets:[{exercise:'Squat',weight:100,reps:0}]}).success,false);});
test('volume uses total load including base weight',()=>assert.equal(volume([{weight:120,reps:10},{weight:100,reps:8}]),2000));
