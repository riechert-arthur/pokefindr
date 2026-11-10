import { createTranslator } from "next-intl"
import type { Messages } from "@/i18n/messages"
import en from "@/i18n/generated/en.json"
import { authSchemas } from "@/lib/schemas"

// The auth schemas in English, for the API routes; their errors are translated
// later (#185). Kept out of src/lib/schemas.ts, which the forms import, so the
// English catalog isn't in the forms' bundles.
const english = authSchemas(createTranslator({ locale: "en", messages: en as Messages, namespace: "auth.validation" }))

export const { usernameField, loginSchema, forgotPasswordSchema, resetPasswordSchema, registrationSchema, callbackSchema } = english
