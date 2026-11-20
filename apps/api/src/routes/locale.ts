import { DEFAULT_LOCALE, LOCALES } from '@gi/shared'
import { z } from 'zod'

export const localeParam = z.enum(LOCALES).default(DEFAULT_LOCALE)
