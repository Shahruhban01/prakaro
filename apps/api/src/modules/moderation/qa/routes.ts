import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../common/database/prisma';
import { ForbiddenError } from '../../../common/errors/app-error';
import type { AnalyticsActor } from '../analytics-scope';
import { teamScope } from '../workforce';
import { assessmentInput, adjudicationInput, correctionInput, policyInput, qaFilters, reason, reviewParam, uuid } from './contracts';
import { approveCorrection, requestCorrection, startCorrection } from './corrections';
import { qaDashboard, qaWorklist, qualityGroups } from './reporting';
import { adjudicate, claimNext, conflict, missing, openDispute, qaScope, readReview, reassign, releaseReview, startReview, submitReview, type Db } from './reviews';
import { mayConfigureQa, sampleDecision, savePolicy } from './sampling';

const version = z.number().int().nonnegative();
const assignment = z.object({ version }).strict();
const assessment = assignment.extend({ assessment: assessmentInput });
const reassignment = assignment.extend({ auditorId: uuid });
const queryDimension = z.enum(['moderatorId', 'queueId', 'lobId', 'organizationId', 'team']).default('moderatorId');

export function registerQa(app: FastifyInstance, staff: (request: FastifyRequest) => Promise<AnalyticsActor>) {
  async function using<T>(req: FastifyRequest, action: (db: Db, actor: AnalyticsActor) => Promise<T>, consistent = false) {
    const actor = await staff(req);
    try {
      if (req.method === 'GET') {
        return await action(prisma, actor);
      }
      return await prisma.$transaction((tx) => action(tx, actor), {
        isolationLevel: consistent ? Prisma.TransactionIsolationLevel.RepeatableRead : Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 25000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code))
        throw conflict('A concurrent QA operation changed this item. Refresh and retry.');
      throw error;
    }
  }
  const id = (req: FastifyRequest) => reviewParam.parse(req.params).id;
  app.get('/qa/dashboard', (req) => using(req, (db, actor) => qaDashboard(db, actor, qaFilters.parse(req.query)), true));
  app.get('/qa/reviews', (req) => using(req, (db, actor) => qaWorklist(db, actor, qaFilters.parse(req.query)), true));
  app.get('/qa/disputes', (req) => using(req, (db, actor) =>
    qaWorklist(db, actor, { ...qaFilters.parse(req.query), view: 'disputed' }), true));
  app.get('/qa/analytics', (req) => using(req, (db, actor) => {
    const { dimension, ...filters } = req.query as Record<string, unknown>;
    return qualityGroups(db, actor, qaFilters.parse(filters), queryDimension.parse(dimension));
  }, true));
  app.get('/qa/reviews/:id', (req) => using(req, (db, actor) => readReview(db, actor, id(req)), true));
  app.get('/qa/options', (req) => using(req, async (db, actor) => {
    const scope = await qaScope(db, actor);
    const select = { id: true, name: true } as const;
    const orderBy = { name: 'asc' as const };
    const [organizations, lobs, queues, moderators, auditors, teams, policies] = await Promise.all([
      db.organization.findMany({ where: { qaSamples: { some: scope } }, select, orderBy, take: 100 }),
      db.lob.findMany({ where: { qaSamples: { some: scope } }, select, orderBy, take: 100 }),
      db.moderationQueue.findMany({ where: { qaSamples: { some: scope } }, select, orderBy, take: 100 }),
      db.moderator.findMany({ where: { qaOriginalReviews: { some: scope } }, select, orderBy, take: 100 }),
      db.moderator.findMany({ where: { qaAssignments: { some: scope } }, select, orderBy, take: 100 }),
      db.workforceTeam.findMany({ where: { AND: [
        teamScope(actor), { links: { some: { moderator: { qaOriginalReviews: { some: scope } } } } },
      ] }, select, orderBy, take: 100 }),
      db.policyVersion.findMany({ where: { decisions: { some: { qaSample: { is: scope } } } },
        select: { id: true, number: true, policy: { select: { name: true } } }, orderBy: { publishedAt: 'desc' }, take: 100 }),
    ]);
    return { organizations, lobs, queues, moderators, auditors, teams,
      policyVersions: policies.map(({ id, number, policy }) => ({ id, name: policy.name + ' v' + number })) };
  }, true));

  app.post('/qa/reviews/claim-next', (req) => using(req, async (db, actor) => {
    z.object({}).strict().parse(req.body ?? {});
    const item = await claimNext(db, actor);
    return { id: item?.id ?? null };
  }));
  app.post('/qa/reviews/:id/start', (req) => using(req, (db, actor) =>
    startReview(db, actor, id(req), assignment.parse(req.body).version)));
  app.post('/qa/reviews/:id/release', (req) => using(req, (db, actor) =>
    releaseReview(db, actor, id(req), assignment.parse(req.body).version)));
  app.post('/qa/reviews/:id/assign', (req) => using(req, async (db, actor) => {
    const input = reassignment.parse(req.body);
    const item = await reassign(db, actor, id(req), input.auditorId, input.version);
    return { id: item.id, version: item.assignmentVersion };
  }));
  app.post('/qa/reviews/:id/submit', (req) => using(req, (db, actor) => {
    const input = assessment.parse(req.body);
    return submitReview(db, actor, id(req), input.version, input.assessment);
  }));
  app.post('/qa/reviews/:id/disputes', (req) => using(req, (db, actor) =>
    openDispute(db, actor, id(req), z.object({ reason }).strict().parse(req.body).reason)));
  app.post('/qa/disputes/:id/adjudicate', (req) => using(req, (db, actor) =>
    adjudicate(db, actor, id(req), adjudicationInput.parse(req.body))));
  app.post('/qa/reviews/:id/corrections', (req) => using(req, (db, actor) =>
    requestCorrection(db, actor, id(req), correctionInput.parse(req.body))));
  app.post('/qa/corrections/:id/start', (req) => using(req, (db, actor) => {
    z.object({}).strict().parse(req.body ?? {});
    return startCorrection(db, actor, id(req));
  }));
  app.post('/qa/corrections/:id/approve', (req) => using(req, (db, actor) => {
    z.object({}).strict().parse(req.body ?? {});
    return approveCorrection(db, actor, id(req));
  }));

  app.get('/qa/policies', (req) => using(req, async (db, actor) => {
    if (!mayConfigureQa(actor)) throw new ForbiddenError();
    const { organizationId } = z.object({ organizationId: uuid.optional() }).strict().parse(req.query);
    if (organizationId && !actor.superAdmin && actor.organizationId !== organizationId) throw new ForbiddenError();
    const tenant = organizationId ?? (actor.superAdmin ? undefined : actor.organizationId ?? '');
    const [policies, organizations, lobs, queues] = await Promise.all([
      db.qaPolicy.findMany({ where: { organizationId: tenant }, orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }], take: 150,
        include: { queue: { select: { name: true } }, lob: { select: { name: true } }, organization: { select: { name: true } } } }),
      db.organization.findMany({ where: { id: actor.superAdmin ? undefined : tenant, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 }),
      db.lob.findMany({ where: { organizationId: tenant, active: true }, select: { id: true, name: true, organizationId: true }, orderBy: { name: 'asc' }, take: 200 }),
      db.moderationQueue.findMany({ where: { organizationId: tenant ?? { not: null } }, select: { id: true, name: true, organizationId: true }, orderBy: { name: 'asc' }, take: 200 }),
    ]);
    return { policies, organizations, lobs, queues };
  }, true));
  app.post('/qa/policies', (req) => using(req, (db, actor) => savePolicy(db, actor, policyInput.parse(req.body))));
  app.post('/qa/samples/manual', (req) => using(req, async (db, actor) => {
    if (!mayConfigureQa(actor)) throw new ForbiddenError();
    const input = z.object({ decisionId: uuid }).strict().parse(req.body);
    const row = await sampleDecision(db, input.decisionId, actor);
    if (!row) throw missing();
    return { id: row.id };
  }));
}
