import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from '../src/app';
import { prisma } from '../src/common/database/prisma';
import { policyDocument, validatePolicyDecision } from '../src/modules/moderation/policy/contracts';
import { resolvePolicy } from '../src/modules/moderation/policy/service';
import { drainQaSamples } from '../src/modules/moderation/qa/sampling';
import { createQaFixture } from './support/qa-fixture';

const fixtureDocument = {
  overview: 'Compare current independent inspection with the facility evidence.',
  sections: [{ title: 'Source assessment', content: 'Use recorded observations.', examples: ['Synthetic inspection'] }],
  decisionGuidance: [{ action: 'APPROVE', text: 'Confirm supported facility existence.' }],
  fields: [
    { id: 'inspection', label: 'Inspection reviewed', type: 'CHECKBOX', required: true },
    { id: 'notes', label: 'Inspection notes', type: 'LONG_TEXT', required: true, min: 5, max: 160,
      when: { key: 'inspection', equals: true } },
  ],
  tags: [
    { id: 'inspection_supported', label: 'Inspection supports parking', actions: ['APPROVE'],
      required: true, when: { key: 'inspection', equals: true }, excludes: ['conflicting'] },
    { id: 'conflicting', label: 'Conflicting evidence', actions: ['APPROVE','REJECT'] },
  ],
  evidence: [{ id: 'independent', label: 'Current independent evidence', type: 'INDEPENDENT_VERIFICATION',
    actions: ['APPROVE'], minimum: 1 }],
};

test('strict policy validates conditional fields, tags, incompatible choices and documented evidence', () => {
  const policy = policyDocument.parse(fixtureDocument);
  assert.equal(policyDocument.safeParse({ ...fixtureDocument, fields: fixtureDocument.fields.slice().reverse() }).success, false);
  assert.equal(policyDocument.safeParse({ ...fixtureDocument, tags: [fixtureDocument.tags[0], fixtureDocument.tags[0]] }).success, false);
  assert.equal(policyDocument.safeParse({ ...fixtureDocument, evidence: [{ ...fixtureDocument.evidence[0], type: 'USER_SUBMITTED_PHOTO' }] }).success, false);
  const valid = { inspection: true, notes: 'The authorized fixture was reviewed.' };
  assert.equal(Object.keys(validatePolicyDecision(policy, 'APPROVE', valid, ['inspection_supported'], ['owned-evidence'], false)).length, 0);
  assert.ok(validatePolicyDecision(policy, 'APPROVE', valid, ['inspection_supported','conflicting'], ['owned-evidence'], false).tags);
  assert.ok(validatePolicyDecision(policy, 'APPROVE', valid, ['inspection_supported','inspection_supported'], ['owned-evidence'], false).tags);
  assert.ok(validatePolicyDecision(policy, 'REJECT', valid, ['inspection_supported'], [], false).tags);
  assert.ok(validatePolicyDecision(policy, 'APPROVE', valid, [], [], false).evidenceIds);
  assert.ok(validatePolicyDecision(policy, 'APPROVE', { inspection: false, notes: 'Hidden' }, [], [], false).answers);
  assert.ok(validatePolicyDecision(policy, 'APPROVE', { inspection: true, notes: 'bad' }, [], [], false).notes);
});

test('policy lifecycle, tenant boundaries, reservation pinning, clarifications and historical QA', async (t) => {
  const fx = await createQaFixture(prisma);
  const app = buildApp();
  t.after(async () => { await app.close(); await prisma.$disconnect(); });
  async function login(email: string) {
    const result = await app.inject({ method: 'POST', url: '/api/moderator-auth/sign-in/email', payload: { email, password: fx.password } });
    assert.equal(result.statusCode, 200, result.body);
    return result.json().token as string;
  }
  const [admin, moderator, supervisor, auditor, outsider] = await Promise.all(
    [fx.director, fx.moderator, fx.supervisor, fx.auditor, fx.outsider].map(({ email }) => login(email)));
  async function call(who: string, path: string, data?: object, status = 200,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' = data ? 'POST' : 'GET', root = 'moderation') {
    const result = await app.inject({ method, url: '/api/v1/' + root + '/' + path,
      payload: data, headers: { authorization: 'Bearer ' + who } });
    assert.equal(result.statusCode, status, result.body);
    return result.json();
  }
  async function draft(id: string, document = fixtureDocument, sourceVersionId?: string) {
    const draftId = randomUUID();
    const version = await call(admin, 'policies/' + id + '/versions', { draftId, sourceVersionId, changeSummary: 'Add inspection rules' });
    const path = 'policies/' + id + '/versions/' + version.id;
    const edited = await call(admin, path, { document, revision: version.revision, changeSummary: 'Add inspection rules' }, 200, 'PATCH');
    const reviewed = await call(admin, path + '/submit-review', { revision: edited.revision });
    return { reviewed, path };
  }
  async function create(name: string) {
    const result = await call(admin, 'policies', { organizationId: fx.org.id, name, category: 'Parking review' });
    return result.id as string;
  }
  const id = await create('Queue parking policy');
  await call(moderator, 'policies/' + id, undefined, 403);
  await call(outsider, 'policies/' + id, undefined, 403);
  await call(admin, 'policies', { organizationId: fx.otherOrg.id, name: 'Cross tenant', category: 'Test' }, 403);
  const first = await draft(id);
  assert.equal(first.reviewed.number, 1);
  await call(moderator, first.path + '/publish', { revision: first.reviewed.revision }, 403);
  const publish = { revision: first.reviewed.revision };
  const [v1, retry] = await Promise.all([call(admin, first.path + '/publish', publish), call(admin, first.path + '/publish', publish)]);
  assert.equal(v1.id, retry.id);
  assert.match(v1.contentHash, /^[a-f0-9]{64}$/);
  await call(admin, first.path, { document: fixtureDocument, revision: v1.revision, changeSummary: 'Unapproved edit' }, 409, 'PATCH');
  await prisma.policyVersion.update({ where: { id: v1.id }, data: { changeSummary: 'Protected content edit' } });
  assert.equal((await prisma.policyVersion.findUniqueOrThrow({ where: { id: v1.id } })).changeSummary, v1.changeSummary);
  await assert.rejects(prisma.policyVersion.delete({ where: { id: v1.id } }));

  const assignmentPath = 'policies/' + id + '/assignments';
  const assignment = await call(admin, assignmentPath, { queueId: fx.queue.id, versionId: v1.id, expectedAssignmentId: null }, 200, 'PUT');
  assert.equal((await call(moderator, 'policies/effective?queueId=' + fx.queue.id)).rows[0].version.id, v1.id);
  const broad = await create('Organization fallback');
  const d = await draft(broad);
  const broadV = await call(admin, d.path + '/publish', { revision: d.reviewed.revision });
  await call(admin, 'policies/' + broad + '/assignments', { versionId: broadV.id, expectedAssignmentId: null }, 200, 'PUT');
  const lobPolicy = await create('Primary line policy');
  const l = await draft(lobPolicy);
  const lobV = await call(admin, l.path + '/publish', { revision: l.reviewed.revision });
  await call(admin, 'policies/' + lobPolicy + '/assignments', { lobId: fx.line.id, versionId: lobV.id, expectedAssignmentId: null }, 200, 'PUT');
  await prisma.queueLobAccess.create({ data: { queueId: fx.queue.id, lobId: fx.otherLine.id, organizationId: fx.org.id,
    actorId: fx.director.id, actorType: 'MODERATOR' } });
  const missingQueue = randomUUID();
  assert.equal(await resolvePolicy(prisma, fx.org.id, fx.line.id, missingQueue), lobV.id);
  assert.equal(await resolvePolicy(prisma, fx.org.id, fx.otherLine.id, missingQueue), broadV.id);
  assert.equal(await resolvePolicy(prisma, fx.org.id, fx.otherLine.id, fx.queue.id), v1.id);
  await call(admin, 'policies/' + broad + '/assignments', { queueId: fx.queue.id, versionId: broadV.id, expectedAssignmentId: null }, 409, 'PUT');

  await call(admin, 'qa/policies', { organizationId: fx.org.id, queueId: fx.queue.id, expectedVersion: 0, rate: 10000, enabled: true });
  await Promise.all([fx.createCase('PIN-A'), fx.createCase('PIN-B')]);
  const aux = await call(moderator, 'aux/me', undefined, 200, 'GET', 'workforce');
  await call(moderator, 'aux/transition', { state: 'MODERATING', attendanceSessionId: aux.attendanceSessionId, version: aux.version }, 200, 'POST', 'workforce');
  const current = await call(moderator, 'queues/' + fx.queue.id + '/moderate/start', {});
  assert.equal(current.reservation.pinnedPolicy.id, v1.id);
  const response = await call(moderator, 'clarifications', {
    reservationId: current.reservation.id, messageId: randomUUID(), text: 'Is this independent inspection sufficient?',
  });
  await call(outsider, 'clarifications/' + response.id, undefined, 404);
  await call(moderator, 'clarifications/' + response.id + '/respond',
    { messageId: randomUUID(), revision: 0, kind: 'ANSWER', text: 'Unauthorized response' }, 403);
  const answer = { messageId: randomUUID(), revision: 0, kind: 'ANSWER', text: 'Apply the reserved version and cite the inspection.' };
  await call(supervisor, 'clarifications/' + response.id + '/respond', answer);
  await call(supervisor, 'clarifications/' + response.id + '/respond', answer);
  const thread = await call(moderator, 'clarifications/' + response.id);
  assert.equal(thread.messages.length, 2);
  assert.equal(thread.messages[1].actorId, fx.supervisor.id);
  assert.equal(thread.version.id, v1.id);

  const second = await draft(id, { ...fixtureDocument, overview: 'Revised evidence guidance for new work.' }, v1.id);
  const v2 = await call(admin, second.path + '/publish', { revision: second.reviewed.revision });
  assert.equal(v2.number, 2);
  assert.ok((await prisma.policyAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).effectiveTo);
  const comparison = await call(admin, 'policies/' + id + '/versions/compare?before=' + v1.id + '&after=' + v2.id);
  assert.deepEqual(comparison.changes.map(({ key }: { key: string }) => key), ['overview']);
  const held = await call(moderator, 'queues/' + fx.queue.id + '/moderate/current');
  assert.equal(held.reservation.pinnedPolicy.id, v1.id);
  const url = 'reservations/' + held.reservation.id + '/submit';
  const evidenceIds = [held.reservation.case.admission.facility.evidence[0].id];
  const decision = { action: 'APPROVE', reason: 'Approved with synthetic independent inspection.',
    policyVersionId: v1.id, tagIds: ['inspection_supported'], evidenceIds, answers: { inspection: true, notes: 'Evidence reviewed.' } };
  await call(moderator, url, { ...decision, policyVersionId: v2.id }, 409);
  await call(moderator, url, { ...decision, tagIds: [] }, 422);
  await call(moderator, url, { ...decision, evidenceIds: [] }, 422);
  const completed = await call(moderator, url, decision);
  assert.equal(completed.nextReservation.pinnedPolicy.id, v2.id);
  const record = await prisma.moderationDecisionVersion.findUniqueOrThrow({ where: { id: completed.decisionVersionId } });
  assert.equal(record.pinnedPolicyId, v1.id);
  assert.deepEqual(record.policyTags, decision.tagIds);
  assert.ok(record.publicationLabelId);
  assert.equal((await call(moderator, url, decision)).decisionVersionId, record.id);
  await drainQaSamples();
  const claimed = await call(auditor, 'qa/reviews/claim-next', {});
  const historical = await call(auditor, 'qa/reviews/' + claimed.id);
  assert.equal(historical.decision.pinnedPolicy.id, v1.id);
  assert.equal(historical.currentPolicyId, v2.id);
  assert.equal((await call(admin, 'qa/dashboard?policyVersionId=' + v1.id)).sampled, 1);
  await call(admin, first.path + '/archive', { revision: v1.revision });
  assert.equal((await call(auditor, 'qa/reviews/' + claimed.id)).decision.pinnedPolicy.document.overview, fixtureDocument.overview);
  assert.ok(await prisma.moderationAudit.findFirst({ where: { organizationId: fx.org.id,
    target: response.id, action: 'POLICY_CLARIFICATION_ANSWER' } }));
  await prisma.moderator.update({ where: { id: fx.outsider.id }, data: { role: 'MODERATION_ADMIN' } });
  await call(outsider, 'policies/' + id, undefined, 404);
  await call(outsider, assignmentPath, { queueId: fx.queue.id, versionId: v2.id, expectedAssignmentId: assignment.id }, 404, 'PUT');
});
