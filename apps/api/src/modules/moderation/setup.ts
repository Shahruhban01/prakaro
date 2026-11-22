import {prisma} from '../../common/database/prisma';
import {audit,increment} from './intake';
import {defaultConfig,queueInput} from './config';
export async function initialize(email:string){
 return prisma.$transaction(async tx=>{
 const user=await tx.user.findUniqueOrThrow({where:{email}});
 const existing=await tx.moderationStaff.findFirst({where:{role:'SUPER_ADMIN',active:true}});
 if(existing&&existing.userId!==user.id)throw new Error('Super administrator already exists');
 await tx.moderationStaff.upsert({where:{userId:user.id},create:{userId:user.id,role:'SUPER_ADMIN'},update:{}});
 const templates=[
 ['GENERAL','General parking verification','source','SEARCH'],['AI','AI recommended human review','ai','REVIEW_REQUIRED'],['ACCESS','Restricted access review','access','RESTRICTED'],['REPORT','User reports','source','REPORT'],['REVERIFY','Reverification','source','EXPIRY'],['ESCALATION','Escalations','source','ESCALATION'],['QA','Quality assurance','source','QA']];
 for(const [kind,name,field,value] of templates){if(await tx.moderationQueue.findFirst({where:{kind}}))continue;
 const input=queueInput.parse({kind,name,priority:0,capacity:500,config:{...defaultConfig,rule:{field,value}}});const seq=await increment(tx,'queue-sequence');
 const q=await tx.moderationQueue.create({data:{...input,code:'QUEUE-'+kind+'-'+String(seq).padStart(3,'0'),createdBy:user.id}});await audit(tx,user.id,'QUEUE_CREATED',q.id,input);}
 if(!existing)await audit(tx,user.id,'STAFF_BOOTSTRAPPED',user.id,{role:'SUPER_ADMIN'});
 },{isolationLevel:'Serializable'});
}
if(require.main===module){initialize(process.argv[2]??'').catch(()=>{console.error('Initialization failed. Supply an existing Better Auth account email and migrated database.');process.exitCode=1}).finally(()=>prisma.$disconnect())}

