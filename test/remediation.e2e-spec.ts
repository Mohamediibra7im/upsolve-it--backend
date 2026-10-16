import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { TrainingsModule } from '../src/modules/trainings/trainings.module';
import { TrainingSessionsService } from '../src/modules/trainings/training-sessions.service';
import { UserStatsService } from '../src/modules/user-stats/user-stats.service';
import { RoadmapModule } from '../src/modules/roadmap/roadmap.module';
import { RoadmapProgressService } from '../src/modules/roadmap/roadmap-progress.service';
import { RoadmapAdminService } from '../src/modules/roadmap/roadmap-admin.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { APP_GUARD } from '@nestjs/core';
import { RateLimiterGuard } from '../src/common/guards/rate-limiter.guard';
import { configureHttpApplication } from '../src/common/http/configure-http';
import { ConfigService } from '@nestjs/config';
import * as codeforces from '../src/common/utils/codeforces-api';
import { FriendsModule } from '../src/modules/friends/friends.module';
import {
  inspectReferences,
  normalizeReferences,
} from '../src/common/database/reference-repair';

jest.setTimeout(120_000);

describe('backend regression contracts (disposable replica set)', () => {
  let mongo: MongoMemoryReplSet;
  let app: INestApplication;
  let db: Connection;
  let user: any;
  let token: string;
  let hash: string;
  let ip = 0;
  const model = (name: string) => db.model(name);
  const uid = () => String(user._id);
  const post = (path: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(`/api/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', `192.0.2.${++ip}`)
      .send(body);
  const problem = {
    problemId: '4_A',
    contestId: 4,
    index: 'A',
    name: 'Watermelon',
    rating: 800,
    tags: [],
    url: 'https://codeforces.com/problemset/problem/4/A',
  };
  const training = () => ({
    startTime: Date.now() - 60_000,
    endTime: Date.now(),
    problems: [{ ...problem }],
  });
  async function levelFixture(extra: object = {}) {
    const level = await model('RoadmapLevel').create({
      title: 'Level',
      orderIndex: 0,
      isPublished: true,
      ...extra,
    });
    const topic = await model('RoadmapTopic').create({
      levelId: level._id,
      title: 'Topic',
      orderIndex: 0,
      requiredLearningPct: 0,
      requiredProblemPct: 100,
    });
    const resource = await model('RoadmapResource').create({
      topicId: topic._id,
      title: 'Article',
      language: 'English',
      type: 'Article',
      url: 'https://example.com',
      orderIndex: 0,
      weight: 100,
      xpReward: 10,
    });
    const prob = await model('RoadmapProblem').create({
      topicId: topic._id,
      name: 'Problem',
      url: problem.url,
      cfProblemId: '4_A',
      orderIndex: 0,
      xpReward: 40,
    });
    return { level, topic, resource, prob };
  }
  async function resetProof() {
    const started = await post('auth/initiate-reset', {
      handle: user.codeforcesHandle,
    }).expect(201);
    expect(started.body.code).toMatch(/^[a-f0-9]{32}$/);
    expect(
      (await model('PasswordResetChallenge').findOne())?.toObject(),
    ).toMatchObject({ userId: user._id, authVersion: 0, consumedAt: null });
    jest
      .spyOn(codeforces, 'fetchCodeforcesUserInfo')
      .mockResolvedValue([
        { handle: user.codeforcesHandle, firstName: started.body.code },
      ] as any);
    const proof = await post('auth/verify-reset-profile', {
      verificationToken: started.body.verificationToken,
    });
    expect({ status: proof.status, error: proof.body.message }).toEqual({
      status: 201,
      error: undefined,
    });
    return { started: started.body, resetToken: proof.body.resetToken };
  }

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ dbName: 'upsolve_test' }],
    });
    const uri = mongo.getUri('upsolve_test');
    if (
      !/^mongodb:\/\/127\.0\.0\.1:/.test(uri) ||
      !uri.includes('/upsolve_test')
    )
      throw new Error('Refusing non-disposable test database');
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          isGlobal: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'test-access-secret-at-least-32-characters',
              JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters',
              MONGODB_URI: uri,
              MONGODB_URI_DEV: uri,
              MONGODB_URI_PROD: uri,
            }),
          ],
        }),
        MongooseModule.forRoot(uri),
        AuthModule,
        TrainingsModule,
        RoadmapModule,
        FriendsModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: RateLimiterGuard }],
    }).compile();
    app = module.createNestApplication();
    configureHttpApplication(app, app.get(ConfigService));
    app.useLogger(false);
    db = app.get(getConnectionToken());
    await Promise.all(Object.values(db.models).map((m) => m.init()));
    await app.init();
    hash = await bcrypt.hash('OriginalP@ss1', 10);
  });
  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    for (const collection of Object.values(db.collections))
      await collection.deleteMany({});
    user = await model('User').create({
      codeforcesHandle: 'tourist',
      password: hash,
      avatar: 'https://example.com/a.png',
      rating: 1500,
    });
    token = await app
      .get(JwtService)
      .signAsync({ userId: uid(), type: 'access', authVersion: 0 });
  });

  it('issues unique profile challenges instead of trusting public submissions', async () => {
    const a = await post('auth/initiate-reset', { handle: 'TOURIST' }).expect(
      201,
    );
    const b = await post('auth/initiate-reset', { handle: 'tourist' }).expect(
      201,
    );
    expect(a.body.code).toMatch(/^[a-f0-9]{32}$/);
    expect(b.body.code).not.toBe(a.body.code);
    expect(new Date(a.body.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 590_000,
    );
    const old = await app
      .get(JwtService)
      .signAsync(
        { userId: uid(), type: 'verify' },
        { secret: 'test-refresh-secret-at-least-32-characters' },
      );
    await post('auth/verify-submission', { verificationToken: old }).expect(
      410,
    );
  });

  it('rejects a profile code from a different challenge', async () => {
    const a = await post('auth/initiate-reset', { handle: 'tourist' }).expect(
      201,
    );
    const b = await post('auth/initiate-reset', { handle: 'tourist' }).expect(
      201,
    );
    jest
      .spyOn(codeforces, 'fetchCodeforcesUserInfo')
      .mockResolvedValue([
        { handle: 'tourist', firstName: b.body.code },
      ] as any);
    await post('auth/verify-reset-profile', {
      verificationToken: a.body.verificationToken,
    }).expect(400);
    expect((await model('User').findById(user._id))?.isVerified).toBe(false);
    expect(await model('XpTransaction').countDocuments()).toBe(0);
  });

  it('consumes a recovery proof once and invalidates previously issued sessions', async () => {
    const { resetToken } = await resetProof();
    const responses = await Promise.all([
      post('auth/reset-password', {
        resetToken,
        newPassword: 'ReplacementP@ss2',
      }),
      post('auth/reset-password', {
        resetToken,
        newPassword: 'ReplacementP@ss2',
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    const saved = await model('User').findById(user._id);
    expect(await bcrypt.compare('ReplacementP@ss2', saved!.password)).toBe(
      true,
    );
    expect(
      await app.get(AuthService).getUserFromAuthHeader(`Bearer ${token}`),
    ).toBeNull();
    await post('auth/reset-pin', {
      resetToken,
      newPassword: 'ReplacementP@ss2',
    }).expect(404);
  });

  it('rejects expired database challenges and legacy reset tokens', async () => {
    const { started, resetToken } = await resetProof();
    await db
      .collection('password_reset_challenges')
      .updateMany(
        {},
        { $set: { expiresAt: new Date(0), resetExpiresAt: new Date(0) } },
      );
    await post('auth/verify-reset-profile', {
      verificationToken: started.verificationToken,
    }).expect(400);
    await post('auth/reset-password', {
      resetToken,
      newPassword: 'ReplacementP@ss2',
    }).expect(400);
    const old = await app
      .get(JwtService)
      .signAsync(
        { userId: uid(), type: 'reset' },
        { secret: 'test-refresh-secret-at-least-32-characters' },
      );
    await post('auth/reset-password', {
      resetToken: old,
      newPassword: 'ReplacementP@ss2',
    }).expect(400);
  });

  it('supports current-password changes on the password endpoint and rejects ambiguous input', async () => {
    await post('auth/reset-password', {
      oldPassword: 'OriginalP@ss1',
      newPassword: 'ReplacementP@ss2',
      resetToken: 'ambiguous',
    }).expect(400);
    await post('auth/reset-password', {
      oldPassword: 'OriginalP@ss1',
      newPassword: 'ReplacementP@ss2',
    }).expect(201);
    expect(
      await app.get(AuthService).getUserFromAuthHeader(`Bearer ${token}`),
    ).toBeNull();
  });

  it('blocks locked sessions and refresh, including after an unlock', async () => {
    const login = await app
      .get(AuthService)
      .login('tourist', 'OriginalP@ss1', `lock-${++ip}`);
    await app.get(AdminService).lockUser(uid(), uid());
    expect(
      await app.get(AuthService).getUserFromAuthHeader(`Bearer ${login.token}`),
    ).toBeNull();
    await expect(
      app
        .get(AuthService)
        .refresh(login.refreshToken, `locked-${++ip}`, 'test'),
    ).rejects.toThrow();
    await app.get(AdminService).unlockUser(uid(), uid());
    expect(
      await app.get(AuthService).getUserFromAuthHeader(`Bearer ${login.token}`),
    ).toBeNull();
  });

  it('rotates refresh tokens once under concurrent requests without revoking the winner', async () => {
    const auth = app.get(AuthService);
    const login = await auth.login(
      'tourist',
      'OriginalP@ss1',
      `rotate-${++ip}`,
    );
    const results = await Promise.allSettled([
      auth.refresh(login.refreshToken, `r1-${++ip}`, 'test'),
      auth.refresh(login.refreshToken, `r2-${++ip}`, 'test'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<any>;
    expect(
      (await auth.refresh(winner.value.refreshToken, `r3-${++ip}`, 'test'))
        .token,
    ).toBeTruthy();
  });

  it('keeps version-zero legacy sessions usable until explicitly revoked', async () => {
    const legacy = await app.get(JwtService).signAsync({ userId: uid() });
    expect(
      String(
        (await app.get(AuthService).getUserFromAuthHeader(`Bearer ${legacy}`))
          ?._id,
      ),
    ).toBe(uid());
  });

  it('does not revive a legacy session when an account locked before this release is unlocked', async () => {
    await model('User').collection.updateOne(
      { _id: user._id },
      { $set: { locked: true }, $unset: { authVersion: '' } },
    );
    const legacy = await app.get(JwtService).signAsync({ userId: uid() });
    await app.get(AdminService).unlockUser(uid(), uid());
    expect(
      await app.get(AuthService).getUserFromAuthHeader(`Bearer ${legacy}`),
    ).toBeNull();
  });

  it('cannot revoke a fresh login by replaying a token invalidated by a password change', async () => {
    const auth = app.get(AuthService);
    const old = await auth.login('tourist', 'OriginalP@ss1', `old-${++ip}`);
    await auth.resetPassword(uid(), {
      oldPassword: 'OriginalP@ss1',
      newPassword: 'ReplacementP@ss2',
    });
    await model('RefreshToken').updateMany(
      { userId: user._id, revoked: true },
      { $set: { revokedAt: new Date(Date.now() - 61_000) } },
    );
    const fresh = await auth.login(
      'tourist',
      'ReplacementP@ss2',
      `new-${++ip}`,
    );
    await expect(
      auth.refresh(old.refreshToken, `replay-${++ip}`, 'test'),
    ).rejects.toThrow();
    expect(
      (await auth.refresh(fresh.refreshToken, `fresh-${++ip}`, 'test')).token,
    ).toBeTruthy();
  });

  it('preserves synced solved subdocuments when ending without updates', async () => {
    const created = await post('training-sessions', training()).expect(201);
    const id = created.body.sessionId;
    await post(`training-sessions/${id}/sync`, {
      problemUpdates: { '4_A': { isSolved: true, solvedAt: Date.now() } },
    }).expect(201);
    const ended = await post(`training-sessions/${id}/end`).expect(201);
    expect(ended.body.session.solvedCount).toBe(1);
    expect(ended.body.session.problems[0].isSolved).toBe(true);
    expect(await model('UpsolvedProblem').countDocuments()).toBe(0);
  });

  it('saves legacy training payloads with server-derived performance', async () => {
    const saved = await post('trainings', {
      ...training(),
      performance: 99999,
      solvedCount: 99,
    }).expect(201);
    expect(saved.body.training.performance).toBe(1500);
    expect(saved.body.training.solvedCount).toBe(0);
    await post('trainings', training()).expect(201);
  });

  it('accepts cached clients sending derived sync fields while calculating them on the server', async () => {
    const created = await post('training-sessions', training()).expect(201);
    const result = await post(
      `training-sessions/${created.body.sessionId}/end`,
      {
        problemUpdates: {
          '4_A': {
            isSolved: true,
            solvedAt: Date.now(),
            expectedTimeSeconds: 1,
            speedStatus: 'slow',
          },
        },
      },
    ).expect(201);
    expect(result.body.session.problems[0].expectedTimeSeconds).toBe(600);
    expect(result.body.session.problems[0].speedStatus).toBe('fast');
  });

  it('finishes duplicate queue entries and repeated/concurrent ends exactly once', async () => {
    const existing = await model('UpsolvedProblem').create({
      ...problem,
      user: user._id,
      solvedTime: 12345,
    });
    const created = await post('training-sessions', training()).expect(201);
    const url = `training-sessions/${created.body.sessionId}/end`;
    const responses = await Promise.all([post(url), post(url)]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(
      (await model('UpsolvedProblem').find().lean()).map((p) => ({
        user: String(p.user),
        contestId: p.contestId,
        index: p.index,
      })),
    ).toEqual([{ user: uid(), contestId: 4, index: 'A' }]);
    expect(
      (await model('UpsolvedProblem').findById(existing._id))!.solvedTime,
    ).toBe(12345);
    const again = await post(url, { endTime: 1 }).expect(201);
    expect(again.body.session.endTime).toBe(responses[0].body.session.endTime);
  });

  it('rolls completion and queue writes back when statistics cannot be saved', async () => {
    const created = await post('training-sessions', training()).expect(201);
    jest
      .spyOn(app.get(UserStatsService), 'recordTrainingCompleted')
      .mockRejectedValue(new Error('database unavailable'));
    await expect(
      app
        .get(TrainingSessionsService)
        .endSession(uid(), created.body.sessionId, {}),
    ).rejects.toThrow('database unavailable');
    expect(
      (await model('Training').findById(created.body.sessionId))!.status,
    ).toBe('active');
    expect(await model('UpsolvedProblem').countDocuments()).toBe(0);
  });

  it.each([
    { isPublished: false },
    { visibility: 'specific_users', allowedUserIds: [] },
  ])('denies progress writes for inaccessible levels %j', async (flags) => {
    const { topic, resource, prob } = await levelFixture(flags);
    await post(`roadmap/resources/${resource._id}/progress`, {
      completed: true,
    }).expect(404);
    await post(`roadmap/problems/${prob._id}/toggle`, { solved: true }).expect(
      404,
    );
    await post(`roadmap/topics/${topic._id}/sync`, {}).expect(404);
    await post(`roadmap/topics/${topic._id}/complete-learning`).expect(404);
    await post(`roadmap/topics/${topic._id}/reset-learning`).expect(404);
    expect(await model('XpTransaction').countDocuments()).toBe(0);
  });

  it('keeps an empty private allowlist private after revocation', async () => {
    const { level } = await levelFixture({
      visibility: 'specific_users',
      allowedUserIds: [user._id],
    });
    await app
      .get(RoadmapAdminService)
      .revokeLevelAccess(String(level._id), [uid()]);
    expect((await model('RoadmapLevel').findById(level._id))!.visibility).toBe(
      'specific_users',
    );
    await request(app.getHttpServer())
      .get(`/api/roadmap/levels/${level._id}`)
      .expect(404);
  });

  it('persists completion threshold edits', async () => {
    const { resource } = await levelFixture();
    await app.get(RoadmapAdminService).updateResource(String(resource._id), {
      videoCompletionThresholdPct: 95,
    });
    expect(
      (await model('RoadmapResource').findById(resource._id))!
        .videoCompletionThresholdPct,
    ).toBe(95);
  });

  it('rejects invalid progress types and languages before changing XP', async () => {
    const { resource, prob, topic } = await levelFixture();
    await post(`roadmap/resources/${resource._id}/progress`, {
      completed: 'false',
    }).expect(400);
    await post(`roadmap/resources/${resource._id}/progress`, {
      watchPct: 101,
    }).expect(400);
    await post(`roadmap/problems/${prob._id}/toggle`, {
      solved: true,
      language: 'Other',
    }).expect(400);
    await post(
      `roadmap/topics/${topic._id}/complete-learning?language=Other`,
    ).expect(400);
    expect(await model('XpTransaction').countDocuments()).toBe(0);
  });

  it('awards once under concurrent completions and revokes the original ledger amount', async () => {
    const { resource, topic } = await levelFixture();
    const progress = app.get(RoadmapProgressService);
    await Promise.all([
      progress.recordResourceProgress(uid(), String(resource._id), {
        completed: true,
      }),
      progress.recordResourceProgress(uid(), String(resource._id), {
        completed: true,
      }),
    ]);
    expect((await model('UserXp').findOne({ userId: user._id }))!.totalXp).toBe(
      10,
    );
    expect(await model('XpTransaction').countDocuments()).toBe(1);
    await model('RoadmapResource').updateOne(
      { _id: resource._id },
      { $set: { xpReward: 1000 } },
    );
    const reset = await progress.resetTopicLearningProgress(
      uid(),
      String(topic._id),
    );
    expect(reset.xpRevoked).toBe(10);
    expect((await model('UserXp').findOne({ userId: user._id }))!.totalXp).toBe(
      0,
    );
  });

  it('does not lose concurrent XP deductions from different topics', async () => {
    const a = await levelFixture();
    const b = await levelFixture();
    await model('RoadmapResource').updateOne(
      { _id: b.resource._id },
      { $set: { xpReward: 20 } },
    );
    const progress = app.get(RoadmapProgressService);
    await progress.recordResourceProgress(uid(), String(a.resource._id), {
      completed: true,
    });
    await progress.recordResourceProgress(uid(), String(b.resource._id), {
      completed: true,
    });
    await model('UserXp').updateOne(
      { userId: user._id },
      { $inc: { totalXp: 70 } },
    );
    await Promise.all([
      progress.resetTopicLearningProgress(uid(), String(a.topic._id)),
      progress.resetTopicLearningProgress(uid(), String(b.topic._id)),
    ]);
    expect((await model('UserXp').findOne({ userId: user._id }))!.totalXp).toBe(
      70,
    );
  });

  it('rolls back progress flags and ledger if the XP balance write fails', async () => {
    const { resource } = await levelFixture();
    jest.spyOn(model('UserXp'), 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('balance write failed');
    });
    await expect(
      app
        .get(RoadmapProgressService)
        .recordResourceProgress(uid(), String(resource._id), {
          completed: true,
        }),
    ).rejects.toThrow();
    expect(await model('XpTransaction').countDocuments()).toBe(0);
    expect(await model('UserResourceProgress').countDocuments()).toBe(0);
  });

  it('revokes topic and level bonuses when completion is undone', async () => {
    const { resource, prob, topic, level } = await levelFixture();
    const progress = app.get(RoadmapProgressService);
    await progress.recordResourceProgress(uid(), String(resource._id), {
      completed: true,
    });
    await progress.toggleProblemSolved(uid(), String(prob._id), true);
    expect((await model('UserXp').findOne({ userId: user._id }))!.totalXp).toBe(
      650,
    );
    const undone = await progress.toggleProblemSolved(
      uid(),
      String(prob._id),
      false,
    );
    expect(undone.xpDelta).toBe(-640);
    expect((await model('UserXp').findOne({ userId: user._id }))!.totalXp).toBe(
      10,
    );
    expect(
      (await model('UserTopicProgress').findOne({ topicId: topic._id }))!
        .topicBonusAwarded,
    ).toBe(false);
    expect(
      (await model('UserLevelProgress').findOne({ levelId: level._id }))!
        .levelBonusAwarded,
    ).toBe(false);
  });

  it('queues unsolved legacy saves atomically with their training history', async () => {
    await post('trainings', training()).expect(201);
    expect(
      await model('UpsolvedProblem').countDocuments({ user: user._id }),
    ).toBe(1);
  });

  it('reports legacy string references without modifying historical records', async () => {
    await model('Training').collection.insertOne({
      user: uid(),
      ...training(),
      performance: 1500,
    } as any);
    const report = await inspectReferences(db);
    expect(report).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: model('Training').collection.name,
          field: 'user',
          convertible: 1,
        }),
      ]),
    );
    expect(
      await model('Training').collection.countDocuments({ user: uid() } as any),
    ).toBe(1);
  });

  it('normalizes valid historical references so the owner can still read the training', async () => {
    await model('Training').collection.insertOne({
      user: uid(),
      ...training(),
      performance: 1500,
    } as any);
    await normalizeReferences(db);
    const response = await request(app.getHttpServer())
      .get('/api/trainings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(
      await model('Training').collection.countDocuments({ user: user._id }),
    ).toBe(1);
    await normalizeReferences(db);
    expect(await model('Training').countDocuments()).toBe(1);
  });

  it('refuses historical reference conversion when it would collide with an existing unique record', async () => {
    await model('UpsolvedProblem').collection.insertMany([
      { ...problem, user: uid() },
      { ...problem, user: user._id },
    ] as any);
    await expect(normalizeReferences(db)).rejects.toThrow(/collision/i);
    expect(await model('UpsolvedProblem').countDocuments()).toBe(2);
  });

  it('leaves historical records unchanged if the pre-migration backup cannot be saved', async () => {
    await model('Training').collection.insertOne({
      user: uid(),
      ...training(),
      performance: 1500,
    } as any);
    await expect(
      (normalizeReferences as any)(db, () => {
        throw new Error('backup failed');
      }),
    ).rejects.toThrow('backup failed');
    expect(
      await model('Training').collection.countDocuments({ user: uid() } as any),
    ).toBe(1);
  });

  it('filters rankings at UTC calendar boundaries and uses the same competition rank for ties', async () => {
    const { level, resource } = await levelFixture();
    const other = await model('User').create({
      codeforcesHandle: 'other',
      password: hash,
      avatar: 'https://example.com/b.png',
    });
    const now = new Date();
    const monday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    await model('XpTransaction').create([
      {
        userId: user._id,
        amount: 10,
        sourceType: 'resource',
        sourceId: resource._id,
        reason: 'current',
        createdAt: monday,
      },
      {
        userId: other._id,
        amount: 10,
        sourceType: 'resource',
        sourceId: resource._id,
        reason: 'current',
        createdAt: monday,
      },
      {
        userId: user._id,
        amount: 100,
        sourceType: 'verification',
        sourceId: user._id,
        reason: 'old',
        createdAt: new Date(monday.getTime() - 1),
      },
    ]);
    await model('UserXp').create([
      { userId: user._id, totalXp: 110 },
      { userId: other._id, totalXp: 10 },
    ]);
    const result = await app
      .get(RoadmapProgressService)
      .getLeaderboard(
        { period: 'weekly', level: String(level._id), limit: '1', page: '2' },
        uid(),
      );
    expect(result.total).toBe(2);
    expect(result.top3.map((x: any) => [x.totalXp, x.rank])).toEqual([
      [10, 1],
      [10, 1],
    ]);
    expect(result.leaderboard[0].rank).toBe(1);
    expect(result.myRank).toBe(1);
    const global = await app
      .get(RoadmapProgressService)
      .getLeaderboard({}, uid());
    expect(global.top3[0].totalXp).toBe(110);
  });

  it('filters monthly scores and progress counts at the first UTC day', async () => {
    const { level, topic, resource, prob } = await levelFixture();
    const now = new Date();
    const first = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const prior = new Date(first.getTime() - 1);
    await model('XpTransaction').create([
      {
        userId: user._id,
        amount: 10,
        sourceType: 'resource',
        sourceId: resource._id,
        reason: 'month',
        createdAt: first,
      },
      {
        userId: user._id,
        amount: 100,
        sourceType: 'problem',
        sourceId: prob._id,
        reason: 'prior',
        createdAt: prior,
      },
      {
        userId: user._id,
        amount: 50,
        sourceType: 'verification',
        sourceId: user._id,
        reason: 'global',
        createdAt: first,
      },
    ]);
    await model('UserXp').create({ userId: user._id, totalXp: 160 });
    await model('UserTopicProgress').create({
      userId: user._id,
      topicId: topic._id,
      isTopicComplete: true,
      completedAt: first,
    });
    await model('UserProblemProgress').create({
      userId: user._id,
      problemId: prob._id,
      isSolved: true,
      solvedAt: prior,
    });
    const progress = app.get(RoadmapProgressService);
    const month = await progress.getLeaderboard({ period: 'monthly' }, uid());
    expect(month.top3[0]).toMatchObject({
      totalXp: 60,
      topicsDone: 1,
      problemsSolved: 0,
    });
    const scoped = await progress.getLeaderboard(
      { period: 'monthly', level: String(level._id) },
      uid(),
    );
    expect(scoped.top3[0].totalXp).toBe(10);
    const all = await progress.getLeaderboard(
      { level: String(level._id) },
      uid(),
    );
    expect(all.top3[0].totalXp).toBe(110);
  });

  it.each([
    { limit: '0' },
    { limit: '201' },
    { page: '-1' },
    { period: 'yearly' },
  ])('rejects invalid leaderboard query %j', async (query) => {
    await request(app.getHttpServer())
      .get('/api/roadmap/leaderboard')
      .query(query)
      .expect(400);
  });

  it.each([
    ['friends/requests', 10],
    ['trainings', 20],
    ['training-sessions', 20],
    ['upsolve', 30],
  ])('limits the real %s handler', async (path, quota) => {
    const clientIp = `198.51.100.${++ip}`;
    let response: any;
    for (let i = 0; i <= Number(quota); i++)
      response = await request(app.getHttpServer())
        .post(`/api/${path}`)
        .set('X-Forwarded-For', clientIp)
        .send({});
    expect(response.status).toBe(429);
  });
});
