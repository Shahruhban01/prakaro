import type { Prisma } from '@prisma/client';
import type { AnalyticsActor } from '../analytics-scope';
import { teamScope } from '../workforce';
import { percent, type QaFilters } from './contracts';
import { isAuditor, reviewFilter, selfRole, worklistSelect, type Db } from './reviews';
import { eligiblePopulation } from './sampling';

const pageSize = 20;
export async function qaWorklist(db: Db, actor: AnalyticsActor, query: QaFilters) {
  const { reviews } = await reviewFilter(db, actor, query);
  const dir = query.order === 'oldest' ? 'asc' : 'desc';
  const [total, rows] = await Promise.all([
    db.qaSample.count({ where: reviews }),
    db.qaSample.findMany({ where: reviews, select: worklistSelect,
      skip: (query.page - 1) * pageSize, take: pageSize, orderBy: [{ sampledAt: dir }, { id: dir }] }),
  ]);
  return { rows, total, page: query.page, pageSize };
}

export async function qaDashboard(db: Db, actor: AnalyticsActor, query: QaFilters) {
  const { base, reviews } = await reviewFilter(db, actor, query);
  const now = new Date();
  const count = (where: Prisma.QaSampleWhereInput) => db.qaSample.count({ where: { AND: [reviews, where] } });
  const visibleCoverage = !selfRole(actor) && !isAuditor(actor) && !query.auditorId;
  const [eligible, eligibleProcessed, sampled, manual, pending, working, complete, disputes, correctionsPending,
    correctionsCompleted, outcomes, errors, severities, disputeTotals, timing] = await Promise.all([
    visibleCoverage ? eligiblePopulation(db, actor, query) : null,
    visibleCoverage ? db.qaSample.count({ where: { AND: [base, { draw: { not: null } }] } }) : null,
    visibleCoverage ? db.qaSample.count({ where: { AND: [base, { draw: { not: null }, selection: 'SELECTED' }] } }) : null,
    count({ selection: 'MANUAL' }),
    count({ OR: [{ status: 'PENDING' }, { status: { in: ['ASSIGNED','IN_REVIEW'] }, leaseUntil: { lte: now } }] }),
    count({ status: { in: ['ASSIGNED','IN_REVIEW'] }, leaseUntil: { gt: now } }),
    count({ status: { in: ['COMPLETED','CLOSED'] } }),
    count({ dispute: { is: { status: { in: ['OPEN','UNDER_REVIEW'] } } } }),
    count({ assessment: { is: { finalOutcome: 'FAIL' } }, correction: { is: { approvedAt: null } } }),
    count({ correction: { is: { approvedAt: { not: null } } } }),
    db.qaAssessment.groupBy({ by: ['finalOutcome'], where: { sample: reviews, finalOutcome: { not: null } }, _count: { _all: true } }),
    db.qaAssessment.groupBy({ by: ['category'], where: { sample: reviews, finalOutcome: 'FAIL', category: { not: null } }, _count: { _all: true } }),
    db.qaAssessment.groupBy({ by: ['severity'], where: { sample: reviews, finalOutcome: 'FAIL', severity: { not: null } }, _count: { _all: true } }),
    db.qaDispute.groupBy({ by: ['status'], where: { sample: reviews, resolvedAt: { not: null } }, _count: { _all: true } }),
    db.qaAssessment.aggregate({ where: { sample: reviews }, _avg: { handlingSeconds: true } }),
  ]);
  const passes = outcomes.find(({ finalOutcome }) => finalOutcome === 'PASS')?._count._all ?? 0;
  const failures = outcomes.find(({ finalOutcome }) => finalOutcome === 'FAIL')?._count._all ?? 0;
  const evaluated = passes + failures;
  const adjudicated = disputeTotals.reduce((total, row) => total + row._count._all, 0);
  return {
    generatedAt: now, eligible, eligibleProcessed, sampled, manual, pending, working, complete, disputes,
    correctionsPending, correctionsCompleted, evaluated, passes, failures, accuracy: percent(passes, evaluated),
    coverage: sampled === null || eligible === null ? null : percent(sampled, eligible),
    correctionRate: percent(correctionsCompleted, evaluated),
    overturnRate: percent(disputeTotals.find(({ status }) => status === 'OVERTURNED')?._count._all ?? 0, adjudicated),
    qaHandlingSeconds: timing._avg.handlingSeconds,
    errors: errors.map((row) => ({ name: row.category, count: row._count._all })),
    severities: severities.map((row) => ({ name: row.severity, count: row._count._all })),
  };
}

export async function qualityGroups(db: Db, actor: AnalyticsActor, query: QaFilters,
  dimension: 'moderatorId' | 'organizationId' | 'lobId' | 'queueId' | 'team') {
  const { reviews } = await reviewFilter(db, actor, query);
  const field = dimension === 'team' ? 'moderatorId' : dimension;
  const grouped = (outcome: 'PASS' | 'FAIL') => db.qaSample.groupBy({
    by: [field], where: { AND: [reviews, { assessment: { is: { finalOutcome: outcome } } }] }, _count: { _all: true },
  });
  const [pass, fail] = await Promise.all([grouped('PASS'), grouped('FAIL')]);
  const values = new Map<string, { passes: number; failures: number }>();
  function collect(rows: typeof pass, outcome: 'passes' | 'failures') {
    for (const row of rows) {
      const id = row[field];
      if (!id) continue;
      const value = values.get(id) ?? { passes: 0, failures: 0 };
      value[outcome] = row._count._all;
      values.set(id, value);
    }
  }
  collect(pass, 'passes'); collect(fail, 'failures');
  const ids = [...values.keys()];
  const select = { id: true, name: true } as const;
  let names: { id: string; name: string }[];
  if (dimension === 'team') {
    const teams = await db.workforceTeam.findMany({ where: {
      AND: [teamScope(actor), { links: { some: { moderatorId: { in: ids } } } }],
    }, select: { ...select, links: { select: { moderatorId: true } } } });
    names = teams;
    for (const team of teams) {
      const totals = { passes: 0, failures: 0 };
      for (const { moderatorId } of team.links) {
        const result = values.get(moderatorId);
        if (result) { totals.passes += result.passes; totals.failures += result.failures; }
      }
      values.set(team.id, totals);
    }
  } else {
    const where = { id: { in: ids } };
    names = dimension === 'moderatorId' ? await db.moderator.findMany({ where, select })
      : dimension === 'organizationId' ? await db.organization.findMany({ where, select })
      : dimension === 'lobId' ? await db.lob.findMany({ where, select }) : await db.moderationQueue.findMany({ where, select });
  }
  const rows = names.flatMap((name) => {
    const item = values.get(name.id);
    if (!item) return [];
    const evaluated = item.passes + item.failures;
    return [{ ...name, ...item, evaluated, accuracy: percent(item.passes, evaluated) }];
  }).sort((a, b) => b.evaluated - a.evaluated || a.name.localeCompare(b.name));
  return { rows: rows.slice((query.page - 1) * pageSize, query.page * pageSize), total: rows.length, page: query.page, pageSize };
}
