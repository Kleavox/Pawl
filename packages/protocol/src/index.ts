import { z } from "zod";

const RESERVED_USERNAMES = new Set([
  "about",
  "account",
  "api",
  "assets",
  "contact",
  "login",
  "pass",
  "paw",
  "pawl",
  "privacy",
  "projects",
  "terms",
]);

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

const tokenSchema = z.string().min(32).max(256);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,20}$/u,
    "Username must be 3-20 lowercase letters, digits, or underscores.",
  )
  .refine(
    (value) => !RESERVED_USERNAMES.has(value),
    "This username is reserved.",
  );

export const accountCredentialSchema = z
  .object({
    salt: z.string().min(16).max(128),
    authVerifier: z.string().min(40).max(128),
    accountPublicKey: z.string().min(40).max(512),
    wrappedPrivateKey: z.string().min(40).max(512),
  })
  .strict();

export const registerRequestSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    keys: accountCredentialSchema,
  })
  .strict();

export const preloginRequestSchema = z.object({ email: emailSchema }).strict();

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    authVerifier: z.string().min(40).max(128),
  })
  .strict();

export const emailActionRequestSchema = z
  .object({ email: emailSchema })
  .strict();
export const tokenActionRequestSchema = z
  .object({ token: tokenSchema })
  .strict();

export const resetCredentialRequestSchema = z
  .object({
    token: tokenSchema,
    keys: accountCredentialSchema,
  })
  .strict();

export const challengeRequestSchema = z
  .object({
    token: z.string().min(1).max(4096),
    scope: z.enum(["basic", "fresh"]),
    returnTo: z.string().max(2048).optional(),
  })
  .strict();

export const accountUpdateRequestSchema = z
  .object({ username: usernameSchema })
  .strict();

export const accountSetupRequestSchema = z
  .object({
    username: usernameSchema,
    keys: accountCredentialSchema.optional(),
  })
  .strict();

export const oauthLinkRequestSchema = z.object({ token: tokenSchema }).strict();
export const accountCredentialRequestSchema = z
  .object({ keys: accountCredentialSchema })
  .strict();
export const accountDeleteRequestSchema = z
  .object({ confirmEmail: emailSchema })
  .strict();

const identitySchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  username: z.string().nullable(),
  role: z.enum(["ADMIN", "USER"]),
});

export const passSessionResponseSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(false) }),
  z.object({
    authenticated: z.literal(true),
    user: identitySchema,
    expiresAt: z.string().optional(),
  }),
]);

export const preloginResponseSchema = z.object({ salt: z.string().nullable() });

export const deviceSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  expiresAt: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  current: z.boolean(),
});

export const deviceSessionsResponseSchema = z.object({
  sessions: z.array(deviceSessionSchema),
});

export type AccountCredential = z.infer<typeof accountCredentialSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PassSessionResponse = z.infer<typeof passSessionResponseSchema>;
export type DeviceSession = z.infer<typeof deviceSessionSchema>;
