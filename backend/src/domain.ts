import {z} from 'zod';
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {const d=new Date(v+'T00:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===v;},'올바른 날짜를 입력하세요');
export const workoutSchema=z.object({date,title:z.string().trim().min(1).max(120),notes:z.string().max(4000).default(''),sets:z.array(z.object({exercise:z.string().trim().min(1).max(120),machine_id:z.number().int().positive().nullable().default(null),weight:z.number().min(0).max(99999),reps:z.number().int().min(1).max(1000)})).min(1).max(200)});
export const machineSchema=z.object({brand_id:z.number().int().positive(),name:z.string().trim().min(1).max(120),base_weight:z.number().min(0).max(99999).nullable(),notes:z.string().max(2000).default('')});
export const goalSchema=z.object({exercise:z.string().trim().min(1).max(120),target_weight:z.number().min(0).max(99999),target_reps:z.number().int().min(1).max(1000),start_date:date,deadline:date}).refine(v=>v.deadline>=v.start_date,'목표 종료일을 확인하세요');
// Weight always means the total moved load, including a machine's base weight.
export const volume=(sets:{weight:number;reps:number}[])=>sets.reduce((sum,s)=>sum+s.weight*s.reps,0);
