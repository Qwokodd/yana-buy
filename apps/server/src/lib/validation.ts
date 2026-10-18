import { z } from "zod";
import { privateFileExists } from "./private-files";
import { normalizePhone } from "@yanabuy/shared";

export const phone = z
  .string({ required_error: "Enter your phone number" })
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number — Liberian (e.g. 0770 000 000) or US (e.g. 215 555 0123)" });
      return z.NEVER;
    }
    return normalized;
  });

export const password = z
  .string({ required_error: "Enter a password" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

export const fullName = z
  .string({ required_error: "Enter your name" })
  .trim()
  .min(2, "Enter your full name")
  .max(80, "That name is too long");

/** Optional text: empty string becomes null. */
export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .nullish()
    .transform((v) => (v ? v : null));

export const email = z
  .string({ required_error: "Enter your email address" })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .max(120, "That email is too long")
  .email("Enter a valid email address");

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email address");

/** Image URLs must be ones our own upload endpoint produced (or https). */
export const imageUrl = z
  .string()
  .url("Upload the image again")
  .refine((u) => /^https?:\/\//.test(u), "Upload the image again");

/** Required text with a friendly message. */
export const requiredText = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `Enter the ${label.toLowerCase()}` })
    .trim()
    .min(1, `Enter the ${label.toLowerCase()}`)
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} is too long`);

/** A private upload key (ID photo, selfie) that really exists on the server. */
export const privateKey = (label: string) =>
  z
    .string({ required_error: `Upload ${label}` })
    .min(1, `Upload ${label}`)
    .refine((k) => privateFileExists(k), `Upload ${label} again`);
