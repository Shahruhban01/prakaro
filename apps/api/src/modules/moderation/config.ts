import { z } from 'zod';
export const roles = z.enum(['SUPER_ADMIN','ADMIN','MODERATION_ADMIN','MODERATION_MANAGER','SUPERVISOR','QA_REVIEWER','MODERATOR','VIEWER']);
export const fields = z.enum(['category','reportCategory','source','status','access','pricing','evidence','ai','demand','priority','region','classification']);
type Clause = { field: z.infer<typeof fields>; value: string } | { op: 'AND'|'OR'; children: Clause[] };
function clause(depth:number): z.ZodType<Clause> {
  const leaf = z.object({ field:fields, value:z.string().min(1).max(80) }).strict();
  return depth === 0 ? leaf : z.union([leaf,z.object({ op:z.enum(['AND','OR']), children:z.array(clause(depth-1)).min(1).max(5) }).strict()]);
}
export const ruleSchema = clause(3);
export function matches(rule:Clause, facts:Record<string,string|number>):boolean {
  if ('field' in rule) return rule.field==='demand'||rule.field==='priority' ? Number(facts[rule.field])>=Number(rule.value) : facts[rule.field]===rule.value;
  return rule.op==='AND' ? rule.children.every(r=>matches(r,facts)) : rule.children.some(r=>matches(r,facts));
}
export const question = z.object({ key:z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label:z.string().min(1).max(120), type:z.enum(['SELECT','MULTI','BOOLEAN','TEXT','NUMBER','DATE','EVIDENCE','REASON','NOTES']), required:z.boolean(), options:z.array(z.string().min(1).max(80)).max(24).default([]), when:z.object({key:z.string(),equals:z.string()}).strict().optional() }).strict();
export const configSchema=z.object({
 reviewPolicy:z.string().max(5000).optional(), rule:ruleSchema, columns:z.array(z.enum(['code','category','priority','status','owner','createdAt','trigger'])).min(1).max(7),
 form:z.array(question).max(24), slaHours:z.number().int().min(1).max(8760), qaPercent:z.number().int().min(0).max(100)
}).strict().superRefine(({form},ctx)=>{const seen=new Set<string>(); for(const q of form){if(seen.has(q.key)||(q.when&&!seen.has(q.when.key))||(['SELECT','MULTI'].includes(q.type)&&!q.options.length))ctx.addIssue({code:'custom',message:'Invalid question, choices or dependency'});seen.add(q.key)}});
export const queueInput=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(500).default(''),kind:z.enum(['GENERAL','AI','ACCESS','REPORT','REVERIFY','ESCALATION','QA']),priority:z.number().int().min(0).max(100),capacity:z.number().int().min(1).max(10000),config:configSchema}).strict();
export function validateAnswers(form:z.infer<typeof question>[], answers:Record<string,unknown>, evidenceIds:string[]){
 const permitted=new Set<string>(); for(const q of form){if(q.when&&answers[q.when.key]!==q.when.equals)continue; permitted.add(q.key);
 const a=answers[q.key]; if(a===undefined||a===''){if(q.required)return false;continue}
 switch(q.type){case 'NUMBER':if(typeof a!=='number'||!Number.isFinite(a))return false;break;
 case 'DATE':if(!z.string().date().safeParse(a).success)return false;break;
 case 'MULTI':if(!Array.isArray(a)||!a.length||a.some(v=>!q.options.includes(v)))return false;break;
 case 'EVIDENCE':if(typeof a!=='string'||!evidenceIds.includes(a))return false;break;
 case 'BOOLEAN':if(!['YES','NO','UNKNOWN'].includes(String(a)))return false;break;
 case 'SELECT':if(!q.options.includes(String(a)))return false;break;
 case 'REASON':if(typeof a!=='string'||a.length>1000||(q.options.length&&!q.options.includes(a)))return false;break;
 default:if(typeof a!=='string'||a.length>1000)return false;
 }}return Object.keys(answers).every(k=>permitted.has(k));
}
export const defaultConfig={rule:{field:'source',value:'SEARCH'},columns:['code','category','status','priority','owner'],form:[],slaHours:48,qaPercent:100};

