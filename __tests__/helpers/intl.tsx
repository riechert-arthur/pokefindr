/**
 * Testing Library with the app's messages (docs/i18n.md): `render` and
 * `renderHook` wrap the tree in next-intl's provider, English unless a test
 * passes `locale`. Import from here instead of @testing-library/react in any
 * test that renders copy or links.
 */
import type { ReactNode } from "react"
import { createFormatter, createTranslator, NextIntlClientProvider } from "next-intl"
import { makeFormat } from "@/i18n/format"
import * as rtl from "@testing-library/react"
import { MESSAGES } from "@/i18n/all-messages"
import { DEFAULT_LOCALE, type Locale } from "@/i18n/routing"

export * from "@testing-library/react"

export { MESSAGES }

type Options<T> = T & { locale?: Locale }

function provider(locale: Locale = DEFAULT_LOCALE, Outer?: React.JSXElementConstructor<{ children: ReactNode }>) {
  return function IntlWrapper({ children }: { children: ReactNode }) {
    const tree = (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    )
    return Outer ? <Outer>{tree}</Outer> : tree
  }
}

export function render(ui: React.ReactElement, { locale, wrapper, ...options }: Options<rtl.RenderOptions> = {}) {
  return rtl.render(ui, { ...options, wrapper: provider(locale, wrapper) })
}

export function renderHook<Result, Props>(hook: (props: Props) => Result, { locale, wrapper, ...options }: Options<rtl.RenderHookOptions<Props>> = {}) {
  return rtl.renderHook(hook, { ...options, wrapper: provider(locale, wrapper) })
}

/** A message by key, to assert on what the catalog says instead of a copy of it. */
export function message(locale: Locale = DEFAULT_LOCALE) {
  return createTranslator({ locale, messages: MESSAGES[locale] })
}

/** useFormat()'s formatters outside a component, for testing functions that take one. */
export function formatFor(locale: Locale = DEFAULT_LOCALE) {
  return makeFormat(locale, createTranslator({ locale, messages: MESSAGES[locale], namespace: "format" }), createFormatter({ locale }))
}
