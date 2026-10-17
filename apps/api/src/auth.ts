import {
  AuditEntryIdSchema,
  CurrentUserSchema,
  DomainError,
  newId,
  UserIdSchema,
  UserRoleSchema,
  type CurrentUser,
  type UserRole,
} from '@nirvana/contracts';
import { eq, schema, type Database } from '@nirvana/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Config } from './config';
import type { Logger } from './logger';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireRole` once the session is checked; `null` on routes that do not require one. */
    user: CurrentUser | null;
  }
}

/** Dashboard sessions are short (security.md §6): 12 h, refreshed at most once an hour while in use. */
const SESSION_SECONDS = 12 * 60 * 60;
const SESSION_REFRESH_SECONDS = 60 * 60;
/** Attempts per minute and per IP on `/v1/auth/*`, tighter than the API-wide limit. */
const AUTH_RATE_LIMIT_PER_MINUTE = 20;
const MIN_PASSWORD_LENGTH = 12;

class SessionUnauthenticated extends DomainError {
  constructor() {
    super('session_unauthenticated', 'Connexion requise');
  }
}

class RoleForbidden extends DomainError {
  constructor() {
    super('role_forbidden', 'Action réservée à un autre rôle');
  }
}

/**
 * Better Auth on the Drizzle tables of `schema/auth.ts` (data-model.md): email and password, no public sign-up
 * (`createOwner` makes the first account), sessions in the database, cookies `HttpOnly` and `SameSite=Lax`,
 * `Secure` in production. The tables are out of RLS and reached with the application role, which is enough.
 */
// Better Auth infers its API type (with our additional fields) from these options; writing it out would lose them.
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createAuth(config: Config, db: Database, logger: Logger) {
  return betterAuth({
    appName: 'Nirvana',
    baseURL: config.AUTH_BASE_URL,
    basePath: '/v1/auth',
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.WEB_ORIGIN],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: MIN_PASSWORD_LENGTH },
    user: {
      additionalFields: {
        role: { type: 'string', input: false, required: false },
        creatorIds: { type: 'string[]', input: false, required: false },
      },
    },
    session: { expiresIn: SESSION_SECONDS, updateAge: SESSION_REFRESH_SECONDS },
    advanced: {
      useSecureCookies: config.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      // UUID v7 like every other id (ADR 0011), so `human:<userId>` actors validate. Also used for sessions.
      database: { generateId: () => newId(UserIdSchema) },
    },
    // The API-wide limiter (and the tighter one on these routes) already applies; no anonymous telemetry.
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    databaseHooks: {
      session: {
        create: {
          after: async (session, context) => {
            await db.insert(schema.auditLog).values({
              id: newId(AuditEntryIdSchema),
              userId: session.userId,
              action: 'auth.login',
              entity: 'session',
              entityId: session.id,
              ip: session.ipAddress ?? null,
            });
            logger.info({ userId: session.userId, path: context?.path }, 'user signed in');
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The signed-in user of a request, or `null`; the role and creators come from our columns, validated. */
async function currentUser(auth: Auth, request: FastifyRequest): Promise<CurrentUser | null> {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (result === null) return null;
  const parsed = CurrentUserSchema.safeParse({
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
    creatorIds: result.user.creatorIds ?? [],
  });
  // A row that does not validate (unknown role) gets no access rather than a guessed one.
  return parsed.success ? parsed.data : null;
}

const TokenCarrierSchema = z.looseObject({ token: z.unknown() });

/**
 * Better Auth also returns the session token in the JSON body of sign-in (every `token` key is dropped); the cookie is all the
 * dashboard needs, and a token readable by the page's JavaScript is what that cookie flag exists to prevent.
 */
function withoutToken(json: string): string {
  const parsed = TokenCarrierSchema.safeParse(JSON.parse(json));
  if (!parsed.success) return json;
  return JSON.stringify(parsed.data, (key, value: unknown) => (key === 'token' ? undefined : value));
}

export type RequireRole = (...roles: UserRole[]) => preHandlerAsyncHookHandler;

/** Route guard: no session → 401, a session with another role → 403 (security.md §6). */
export function createRequireRole(auth: Auth): RequireRole {
  return (...roles) =>
    async (request) => {
      const user = await currentUser(auth, request);
      if (user === null) throw new SessionUnauthenticated();
      if (!roles.includes(user.role)) throw new RoleForbidden();
      request.user = user;
    };
}

/** Mounts Better Auth's own handler under `/v1/auth/*` and adds `GET /v1/me`. */
export function createAuthRoutes(
  auth: Auth,
  config: Config,
  requireRole: RequireRole,
): FastifyPluginAsyncZod {
  return (app) => {
    app.decorateRequest('user', null);

    app.route({
      method: ['GET', 'POST'],
      url: '/auth/*',
      config: { rateLimit: { max: AUTH_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } },
      handler: async (request, reply) => {
        const body =
          request.body === undefined || request.body === null ? undefined : JSON.stringify(request.body);
        const response = await auth.handler(
          new Request(new URL(request.url, config.AUTH_BASE_URL), {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(body === undefined ? {} : { body }),
          }),
        );
        reply.code(response.status);
        response.headers.forEach((value, key) => {
          if (!['set-cookie', 'content-length', 'content-encoding', 'transfer-encoding'].includes(key)) {
            reply.header(key, value);
          }
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) reply.header('set-cookie', cookies);
        if (response.body === null) return reply.send(null);
        const text = await response.text();
        return reply.send(
          response.headers.get('content-type')?.includes('json') === true ? withoutToken(text) : text,
        );
      },
    });

    app.get(
      '/me',
      {
        preHandler: requireRole(...UserRoleSchema.options),
        schema: { response: { 200: CurrentUserSchema } },
      },
      (request) => {
        if (request.user === null) throw new SessionUnauthenticated();
        return request.user;
      },
    );
    return Promise.resolve();
  };
}

export interface NewOwner {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}

/**
 * Creates an `owner` account (there is no public sign-up): the user, its password account, the role, and the
 * audit line, in that order. Refuses an email that already exists.
 */
export async function createOwner(auth: Auth, db: Database, owner: NewOwner): Promise<{ userId: string }> {
  if (owner.password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError(
      'password_invalid',
      `Mot de passe trop court (${String(MIN_PASSWORD_LENGTH)} minimum)`,
    );
  }
  const context = await auth.$context;
  const email = owner.email.toLowerCase();
  if ((await context.internalAdapter.findUserByEmail(email)) !== null) {
    throw new DomainError('user_conflict', 'Un compte existe déjà avec cet email');
  }
  const user = await context.internalAdapter.createUser(
    { email, name: owner.name, emailVerified: true },
    { method: 'admin' },
  );
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await context.password.hash(owner.password),
  });
  await db.update(schema.user).set({ role: 'owner' }).where(eq(schema.user.id, user.id));
  await db.insert(schema.auditLog).values({
    id: newId(AuditEntryIdSchema),
    userId: null,
    action: 'user.role_changed',
    entity: 'user',
    entityId: user.id,
    details: { role: 'owner', via: 'owner:create' },
  });
  return { userId: user.id };
}
