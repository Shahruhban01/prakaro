import { FastifyInstance, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auth } from '../../config/auth';
import { env } from '../../config/env';
import { prisma } from '../../common/database/prisma';
import { AppError, ForbiddenError, UnauthorizedError } from '../../common/errors/app-error';
import { audit,increment,route } from './intake';
import { configSchema,queueInput,roles,validateAnswers } from './config';
import { currentEvidence,fingerprintReview } from '../intelligence/intelligence.discovery';
import { publishReview } from '../intelligence/intelligence.review';
import { evidenceSchema } from '../intelligence/intelligence.schemas';
import { evaluateRules } from '../intelligence/intelligence.rules';

const fail=(message:string)=>new AppError(409,'MODERATION_CONFLICT',message);
const id=(req:FastifyRequest)=>z.object({id:z.string().uuid()}).parse(req.params).id;
async function session(req:FastifyRequest){
 const result=await auth.api.getSession({headers:fromNodeHeaders(req.headers),query:{disableCookieCache:true}});
 if(!result)throw new UnauthorizedError();return result.user.id;
}
async function staff(req:FastifyRequest){
 const userId=await session(req);
 const profile=await prisma.moderationStaff.findUnique({where:{userId},include:{memberships:{select:{queueId:true}}}});
 if(!profile?.active)throw new ForbiddenError();
 const admin=['SUPER_ADMIN','ADMIN'].includes(profile.role);
 return {userId,role:profile.role,admin,queues:profile.memberships.map(m=>m.queueId)};
}
type Actor=Awaited<ReturnType<typeof staff>>;
const queueScope=(a:Actor)=>a.admin?{}:{queueId:{in:a.queues}};
const scope=(a:Actor)=>a.admin?{}:{tasks:{some:queueScope(a)}};
function permit(a:Actor,...allowed:string[]){if(!a.admin&&!allowed.includes(a.role))throw new ForbiddenError()}
const readPage=(req:FastifyRequest)=>z.object({page:z.coerce.number().int().min(1).max(10000).default(1),status:z.string().max(40).optional(),queue:z.string().uuid().optional(),mine:z.enum(['true','false']).optional()}).strict().parse(req.query);
export async function moderationRoutes(app:FastifyInstance){
 app.addHook('onRequest',async req=>{
 if(req.method!=='GET'&&req.method!=='HEAD'&&(!req.headers.authorization||req.headers.origin)){
 const allowed=new URL(process.env.MODERATION_ORIGIN??env.BETTER_AUTH_URL).origin;
 if(req.headers.origin!==allowed||req.headers['x-prakaro-console']!=='1')throw new ForbiddenError();
 }});
 app.setErrorHandler((error,_req,reply)=>{
 const status=error instanceof z.ZodError?400:error instanceof AppError?error.statusCode:error instanceof Prisma.PrismaClientKnownRequestError&&['P2025','P2002','P2034'].includes(error.code)?409:500;
 reply.code(status).send({error:{message:error instanceof AppError?error.message:status===400?'Invalid moderation input.':status===409?'Record changed or unavailable.':'Moderation operation failed.'}});
 });
 app.get('/session',async req=>staff(req));
 app.get('/queues',async req=>{const a=await staff(req);return prisma.moderationQueue.findMany({where:a.admin?{}:{id:{in:a.queues}},orderBy:{priority:'desc'},take:100})});
 app.post('/queues',async req=>{const a=await staff(req);permit(a);const input=queueInput.parse(req.body);
 return prisma.$transaction(async tx=>{const seq=await increment(tx,'queue-sequence');const q=await tx.moderationQueue.create({data:{...input,code:'QUEUE-'+input.kind+'-'+String(seq).padStart(3,'0'),createdBy:a.userId}});await audit(tx,a.userId,'QUEUE_CREATED',q.id,input);return q;});});
 app.put('/queues/:id',async req=>{const a=await staff(req);permit(a);const data=queueInput.extend({version:z.number().int(),status:z.enum(['ACTIVE','PAUSED','ARCHIVED'])}).parse(req.body);
 return prisma.$transaction(async tx=>{const prev=await tx.moderationQueue.findUniqueOrThrow({where:{id:id(req)}});const q=await tx.moderationQueue.update({where:{id:prev.id,version:data.version},data:{...data,version:{increment:1}}});await audit(tx,a.userId,'QUEUE_UPDATED',q.id,data,prev.config as Prisma.InputJsonValue);return q})});
 app.get('/moderators',async req=>{const a=await staff(req);permit(a);return prisma.moderationStaff.findMany({include:{memberships:true,user:{select:{name:true,email:true}}},take:100})});
 app.post('/moderators',async req=>{const a=await staff(req);permit(a);const b=z.object({email:z.string().email(),role:roles,active:z.boolean(),queues:z.array(z.string().uuid()).max(50)}).strict().parse(req.body);
 return prisma.$transaction(async tx=>{const user=await tx.user.findUniqueOrThrow({where:{email:b.email}});const prior=await tx.moderationStaff.findUnique({where:{userId:user.id}});if(user.id===a.userId||(a.role!=='SUPER_ADMIN'&&([b.role,prior?.role].some(r=>r==='SUPER_ADMIN'||r==='ADMIN'))))throw new ForbiddenError();
 await tx.moderationStaff.upsert({where:{userId:user.id},create:{userId:user.id,role:b.role,active:b.active},update:{role:b.role,active:b.active}});
 await tx.moderationMembership.deleteMany({where:{userId:user.id}});await tx.moderationMembership.createMany({data:[...new Set(b.queues)].map(queueId=>({userId:user.id,queueId}))});await audit(tx,a.userId,'STAFF_UPDATED',user.id,{role:b.role,active:b.active,queues:b.queues});return {ok:true};});});
 app.get('/analytics',async req=>{const a=await staff(req);return prisma.moderationCase.groupBy({by:['status'],where:scope(a),_count:true})});
 app.get('/audit-log',async req=>{const a=await staff(req);permit(a);return prisma.moderationAudit.findMany({take:50,orderBy:{createdAt:'desc'}})});
 app.get('/cases',async req=>{const a=await staff(req);const p=readPage(req);if(p.queue&&!a.admin&&!a.queues.includes(p.queue))throw new ForbiddenError();
 return prisma.moderationCase.findMany({where:{...scope(a),...(p.queue?{tasks:{some:{queueId:p.queue}}}:{}),status:p.status,owner:p.mine==='true'?a.userId:undefined},orderBy:[{priority:'desc'},{createdAt:'asc'},{id:'asc'}],skip:(p.page-1)*50,take:50})});
 app.get('/cases/:id',async req=>{const a=await staff(req);const c=await prisma.moderationCase.findFirstOrThrow({where:{id:id(req),...scope(a)},include:{admission:{include:{facility:{include:{evidence:currentEvidence(new Date()),runs:{take:1,orderBy:{createdAt:'desc'}}}}}},tasks:{where:queueScope(a)},reviews:{take:20,orderBy:{createdAt:'desc'}}}});return c;});
 app.post('/cases/:id/claim',async req=>{const a=await staff(req);permit(a,'MODERATOR','SUPERVISOR','MODERATION_MANAGER');const now=new Date();
 return prisma.$transaction(async tx=>{const result=await tx.moderationCase.updateMany({where:{id:id(req),tasks:{some:{...queueScope(a),queue:{status:'ACTIVE'}}},status:{in:['QUEUED','IN_REVIEW','AWAITING_EVIDENCE','REOPENED']},OR:[{owner:null},{leaseUntil:{lt:now}},{owner:a.userId}]},data:{owner:a.userId,status:'IN_REVIEW',leaseUntil:new Date(+now+1800000),revision:{increment:1}}});if(!result.count)throw fail('Case is unavailable for claiming.');await audit(tx,a.userId,'CASE_CLAIMED',id(req));return {ok:true}})});
 app.post('/cases/:id/evidence',async req=>{const a=await staff(req);permit(a,'MODERATOR','SUPERVISOR');const b=evidenceSchema.omit({id:true}).extend({reference:z.string().min(3).max(500),expiresAt:z.string().datetime()}).strict().parse(req.body);
 return prisma.$transaction(async tx=>{const c=await tx.moderationCase.findFirstOrThrow({where:{id:id(req),...scope(a),owner:a.userId,status:'IN_REVIEW',leaseUntil:{gt:new Date()}}});if(new Date(b.expiresAt)<=new Date()||await tx.parkingEvidenceReference.count({where:{caseId:c.facilityId,...currentEvidence(new Date()).where}})>=12)throw fail('Evidence expired or the active evidence limit was reached.');
 const row=await tx.parkingEvidenceReference.create({data:{...b,caseId:c.facilityId,approvedAt:new Date()}});await audit(tx,a.userId,'EVIDENCE_RECORDED',c.id,{evidenceId:row.id});return row},{isolationLevel:'Serializable'})});
 app.post('/cases/:id/reviews',async req=>{const a=await staff(req);permit(a,'MODERATOR','SUPERVISOR');const b=z.object({taskId:z.string().uuid(),revision:z.number().int(),action:z.enum(['APPROVE','REJECT','REQUEST_MORE_EVIDENCE','ESCALATE','SAVE_DRAFT']),answers:z.record(z.union([z.string().max(1000),z.number(),z.array(z.string()).max(24)])),evidenceIds:z.array(z.string().uuid()).max(12),reason:z.string().trim().min(1).max(500)}).strict().parse(req.body);
 return prisma.$transaction(async tx=>{
 const c=await tx.moderationCase.findFirstOrThrow({where:{id:id(req),...scope(a),revision:b.revision,owner:a.userId,status:'IN_REVIEW',leaseUntil:{gt:new Date()}}});
 const task=await tx.moderationTask.findFirstOrThrow({where:{id:b.taskId,caseId:c.id,...queueScope(a),queue:{status:'ACTIVE'}}});
 const records=await tx.parkingEvidenceReference.findMany({where:{caseId:c.facilityId,...currentEvidence(new Date()).where},orderBy:{id:'asc'}});
 const cited=records.filter(r=>b.evidenceIds.includes(r.id));if(cited.length!==b.evidenceIds.length)throw fail('Select active evidence from this case.');
 if(b.action!=='SAVE_DRAFT'&&!validateAnswers(configSchema.parse(task.form).form,b.answers,b.evidenceIds))throw fail('Review answers are incomplete or invalid.');
 const rule=evaluateRules(cited.map((r,i)=>evidenceSchema.parse({...{source:r.source,finding:r.finding},id:'E'+(i+1)})));
 if((b.action==='APPROVE'&&rule.classification!=='LIKELY_PARKING')||(b.action==='REJECT'&&rule.classification!=='LIKELY_NOT_PARKING'))throw fail('Independent evidence does not support the decision.');
 await tx.moderationSubmission.create({data:{...{taskId:task.id,action:b.action,reason:b.reason,evidenceIds:b.evidenceIds,answers:b.answers},caseId:c.id,reviewerId:a.userId,queueVersion:task.queueVersion,fingerprint:fingerprintReview(records)}});
 const status=b.action==='ESCALATE'?'ESCALATED':b.action==='REQUEST_MORE_EVIDENCE'?'AWAITING_EVIDENCE':b.action==='SAVE_DRAFT'?'IN_REVIEW':'PENDING_QA';
 await tx.moderationCase.update({where:{id:c.id,revision:b.revision},data:{status,revision:{increment:1},...(b.action==='SAVE_DRAFT'?{}:{owner:null,leaseUntil:null})}});await audit(tx,a.userId,b.action,c.id,{status,reason:b.reason},{status:c.status});return {status};
 },{isolationLevel:'Serializable'})});
 app.post('/cases/:id/qa',async req=>{const a=await staff(req);permit(a,'QA_REVIEWER','SUPERVISOR');
 const b=z.object({action:z.enum(['PUBLISH','REOPEN']),revision:z.number().int(),reason:z.string().min(1).max(500)}).strict().parse(req.body);
 return prisma.$transaction(async tx=>{const c=await tx.moderationCase.findFirstOrThrow({where:{id:id(req),...scope(a),revision:b.revision},include:{reviews:{take:1,orderBy:{createdAt:'desc'}},admission:{include:{facility:true}}}});
 const review=c.reviews[0];if(!review||review.reviewerId===a.userId)throw fail('Independent second reviewer required.');
 let status='REOPENED';const activeKey=c.facilityId+':'+c.category;
 if(b.action==='PUBLISH'){if(c.status!=='PENDING_QA'||!['APPROVE','REJECT'].includes(review.action))throw fail('Case is not awaiting publication.');
 const evidence=await tx.parkingEvidenceReference.findMany({where:{caseId:c.facilityId,...currentEvidence(new Date()).where},orderBy:{id:'asc'}});
 if(fingerprintReview(evidence)!==review.fingerprint)throw fail('Evidence changed. Reopen for review.');
 status=review.action==='APPROVE'?'APPROVED':'REJECTED';
 await publishReview(tx,a.userId,c.facilityId,{expectedRevision:c.admission.facility.reviewRevision,decision:status==='APPROVED'?'CONFIRM_PARKING':'CONFIRM_NON_PARKING',evidenceIds:review.evidenceIds,expiresAt:new Date(Date.now()+30*86400000).toISOString(),reason:b.reason});
 }else{if(!['PENDING_QA','ESCALATED','APPROVED','REJECTED'].includes(c.status))throw fail('Case cannot be reopened.');
 if(['APPROVED','REJECTED'].includes(c.status))await publishReview(tx,a.userId,c.facilityId,{expectedRevision:c.admission.facility.reviewRevision,decision:'NEEDS_EVIDENCE',evidenceIds:[],expiresAt:new Date(Date.now()+86400000).toISOString(),reason:b.reason});}
 await tx.moderationCase.update({where:{id:c.id,revision:b.revision},data:{status,activeKey:status==='REOPENED'?activeKey:null,owner:null,leaseUntil:null,revision:{increment:1}}});await audit(tx,a.userId,b.action,c.id,{status,reason:b.reason},{status:c.status});return {status};
 },{isolationLevel:'Serializable'})});
 app.post('/reports',{config:{rateLimit:{max:5,timeWindow:'1 hour'}}},async req=>{const userId=await session(req);const b=z.object({placeId:z.string().regex(/^[A-Za-z0-9_-]{1,191}$/),category:z.enum(['NOT_PARKING','PRIVATE','WRONG_LOCATION','PRICE','HOURS','CLOSED','OTHER'])}).strict().parse(req.body);
 await prisma.$transaction(async tx=>{const f=await tx.parkingIntelligenceCase.findUnique({where:{googlePlaceId:b.placeId},include:{admission:true}});if(!f?.admission||f.googlePlaceId!==b.placeId)throw fail('Facility is not eligible for reporting.');
 const c=await route(tx,f.id,'USER_REPORT_REVIEW','REPORT',{category:b.category},'user-report');if(!c)throw fail('Report queue is unavailable.');await audit(tx,userId,'REPORT_RECEIVED',c.id,{category:b.category});},{isolationLevel:'Serializable'});return {ok:true};});
}

