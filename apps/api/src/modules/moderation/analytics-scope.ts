import { Prisma } from '@prisma/client';
import { ForbiddenError } from '../../common/errors/app-error';
import { director, employeeScope, leader, lobScope, teamScope } from './workforce';
import type { staff } from './routes';
import type { AnalyticsFilters } from './analytics-calendar';

export type AnalyticsActor = Awaited<ReturnType<typeof staff>>;
export type Database = Prisma.TransactionClient;

export function inList(column: Prisma.Sql, ids: string[]) {
  return ids.length ? Prisma.sql`${column} IN (${Prisma.join(ids)})` : Prisma.sql`1 = 0`;
}

export async function analyticsScope(db: Database, actor: AnalyticsActor, filters: AnalyticsFilters) {
  const all = actor.superAdmin;
  const organizationWide = all || director(actor);
  const selfOnly = !organizationWide && !leader(actor);
  if (!organizationWide && (filters.organizationId && filters.organizationId !== actor.organizationId ||
      filters.dimension === 'organizations')) throw new ForbiddenError();
  if (selfOnly && (filters.teamId || filters.dimension !== 'moderators' ||
      (filters.moderatorId && filters.moderatorId !== actor.userId))) throw new ForbiddenError();

  const [organizations, lobs, teams, people] = await Promise.all([
    db.organization.findMany({
      where: all ? {} : { id: actor.organizationId ?? '' },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
    db.lob.findMany({ where: lobScope(actor), select: { id: true, name: true, organizationId: true }, orderBy: { name: 'asc' } }),
    selfOnly ? [] : db.workforceTeam.findMany({
      where: teamScope(actor), select: { id: true, name: true, organizationId: true,
        links: { where: { moderator: employeeScope(actor) }, select: { moderatorId: true } } },
      orderBy: { name: 'asc' },
    }),
    db.moderator.findMany({
      where: employeeScope(actor), select: {
        id: true, name: true, role: true, status: true, organizationId: true, lobId: true,
        organization: { select: { name: true, active: true } },
        lob: { select: { name: true, active: true } },
      }, orderBy: { name: 'asc' },
    }),
  ]);

  const permittedLobs = lobs.map(({ id }) => id);
  const queueGuard: Prisma.ModerationQueueWhereInput = organizationWide
    ? (all ? {} : { organizationId: actor.organizationId })
    : actor.requiresTeam && !actor.hasTeam ? { id: '' }
      : { organizationId: actor.organizationId, access: { some: { revokedAt: null, lobId: { in: permittedLobs }, lob: { active: true } } } };
  const queues = await db.moderationQueue.findMany({
    where: queueGuard,
    select: { id: true, name: true, organizationId: true, status: true,
      access: { where: { revokedAt: null, lob: { active: true } }, select: { lobId: true } } },
    orderBy: { name: 'asc' },
  });

  function selected<T extends { id: string }>(values: T[], id: string | undefined) {
    if (!id) return undefined;
    const value = values.find((item) => item.id === id);
    if (!value) throw new ForbiddenError('The requested analytics resource is outside your scope.');
    return value;
  }
  const organization = selected(organizations, filters.organizationId);
  const lob = selected(lobs, filters.lobId);
  const team = selected(teams, filters.teamId);
  const queue = selected(queues, filters.queueId);
  const moderator = selected(people, filters.moderatorId);
  const organizationId = organization?.id ?? (all ? undefined : actor.organizationId ?? undefined);
  if ([lob, team, queue, moderator].some((item) => item && organizationId && item.organizationId !== organizationId))
    throw new ForbiddenError('The selected analytics filters do not share a tenant.');
  if (team && moderator && !team.links.some((link) => link.moderatorId === moderator.id)) throw new ForbiddenError();

  const teamMembers = team && new Set(team.links.map(({ moderatorId }) => moderatorId));
  const authorizedPeople = people.filter((person) => !teamMembers || teamMembers.has(person.id));
  const subjectIds = moderator ? [moderator.id] : team || !organizationWide ? authorizedPeople.map(({ id }) => id) : null;
  const roster = authorizedPeople.filter((person) => (!organizationId || person.organizationId === organizationId)
    && (!lob || person.lobId === lob.id) && (!moderator || person.id === moderator.id));
  const selectedQueues = queues.filter((item) => (!organizationId || item.organizationId === organizationId)
    && (!queue || item.id === queue.id)
    && (!lob || item.access.some(({ lobId }) => lobId === lob.id)));
  // Queue backlog is shared. It cannot be attributed to a selected team or employee.
  const backlogAvailable = !selfOnly && !team && !moderator;
  const queueIds = queue ? [queue.id] : organizationWide || selfOnly ? null : queues.map(({ id }) => id);

  return {
    organizationId, subjectIds, queueIds, backlogAvailable, roster, selectedQueues,
    organizations, lobs, teams, queues, selfOnly,
    organization, lob, team, queue, moderator,
  };
}
