
'use client'

import { useState, useEffect, Fragment } from 'react'
import { MenuIcon } from "lucide-react"
import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"
import { LanguageSwitcher } from "@/components/pokefindr/LanguageSwitcher"
import axios from 'axios'
import { useTranslations } from 'next-intl'
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import { APP_NAV_ID } from '@/components/pokefindr/AppRail'
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { LoadSpinner } from '@/components/wrappers/LoadSpinner'
import { useSessionContext } from '@/components/providers/SessionProvider'
import { ClearAssistantHistory } from '@/components/assistant/ClearAssistantHistory'
import { handleSubmitError } from '@/lib/forms'
import { PUBLIC_LOCALES } from '@/i18n/routing'

interface Settings {
  fullName: string
  email:    string
  username:    string
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session, isLoading } = useSessionContext()

  const [settings, setSettings]     = useState<Settings>({ fullName: '', email: '', username: '' })
  const [loading, setLoading]       = useState(true)
  const [editing, setEditing]       = useState<keyof Settings | null>(null)
  const [inputValue, setInputValue] = useState('')
  /** What's happening with an email change: sent for approval, or back from one of its links. */
  const [emailNote, setEmailNote] = useState<string | null>(null)

  useEffect(() => {
    // Both email-change links land on /settings?email=link.
    const params = new URLSearchParams(window.location.search)
    if (params.get('email') === 'link' && params.get('error')) {
      setEmailNote(t('email.expired'))
    } else if (params.get('email') === 'link') {
      setEmailNote(t('email.approved'))
    }
  }, [t])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await axios.get<Settings>('/api/user-settings', {
          withCredentials: true,
        })
        setSettings(res.data)
      } catch (err) {
        console.error('Failed to load settings', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function startEdit(field: keyof Settings) {
    setEditing(field)
    setInputValue(settings[field])
  }

  async function saveEdit(field: keyof Settings) {
    try {
      const { data } = await axios.patch<{ emailPending?: boolean }>(
        '/api/user-settings',
        { [field]: inputValue },
        { withCredentials: true }
      )
      if (data.emailPending) {
        // Nothing changes until both addresses have answered.
        setEmailNote(t('email.pending', { current: settings.email, next: inputValue }))
      } else {
        setSettings((s) => ({ ...s, [field]: inputValue }))
      }
      setEditing(null)
    } catch (err) {
      handleSubmitError(err)
    }
  }

  function cancelEdit() {
    setEditing(null)
  }

  if (isLoading) {
    return <LoadSpinner text={t("loadingProfile")} fullScreen={false} />
  }

  return (
    <div className={isSidebarOpen ? 'max-sm:ml-16' : undefined}>
      <header className="absolute inset-x-0 top-0 z-10 flex h-16 border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={toggleSidebar} className="sm:hidden mr-2 p-1 rounded" aria-label={t("openNav")} aria-controls={APP_NAV_ID} aria-expanded={isSidebarOpen}>
            <MenuIcon className="size-6 text-muted-foreground hover:text-primary/80" />
          </button>
          <div />
          <div className="flex items-center gap-x-8">
            {/*<button className="-m-2.5 p-2.5 text-muted-foreground hover:text-foreground">
              <span className="sr-only">View notifications</span>
              <BellIcon className="size-6" />
            </button>*/}
            <UserMenu userName={session?.username || "Pokefindr"} size={40} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl pt-8 lg:flex lg:gap-x-16 lg:px-8">
        <h1 className="sr-only">{t("title")}</h1>

        <main className="px-4 py-16 sm:px-6 lg:flex-auto lg:px-0 lg:py-20">
          <div className="mx-auto max-w-2xl space-y-16 sm:space-y-20 lg:mx-0 lg:max-w-none">
            <section>
              <h2 className="text-base/7 font-semibold text-foreground">{t("profile.title")}</h2>
              <p className="mt-1 text-sm/6 text-muted-foreground">
                {t("profile.body")}
              </p>

              {emailNote && (
                <p role="status" className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  {emailNote}
                </p>
              )}
              {loading ? (
                <LoadSpinner text={t("loading")} fullScreen={false} /> 
              ) : (
                <dl className="mt-6 divide-y divide-border border-t border-border text-sm/6">
                  {(['fullName','email','username'] as const).map((field) => {
                    const label = t(`fields.${field}`)
                    const value = settings[field]

                    return (
                      <div key={field} className="py-6 sm:flex">
                        <dt className="font-medium text-foreground sm:w-64 sm:flex-none sm:pr-6">
                          {label}
                        </dt>
                        <dd className="mt-1 flex justify-between gap-x-6 sm:mt-0 sm:flex-auto">
                          {editing === field ? (
                            <div className="flex w-full gap-x-2">
                              <input
                                type={field === 'email' ? 'email' : 'text'}
                                aria-label={label}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="flex-grow rounded-md border p-2"
                              />
                              <button
                                onClick={() => saveEdit(field)}
                                className="px-3 py-1 text-sm font-semibold text-primary-foreground bg-primary rounded hover:bg-primary/90"
                              >
                                {t("save")}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1 text-sm font-semibold text-muted-foreground rounded hover:text-foreground"
                              >
                                {t("cancel")}
                              </button>
                            </div>
                          ) : (
                            <Fragment>
                              <div className="text-foreground">{value}</div>
                              <button
                                onClick={() => startEdit(field)}
                                className="font-semibold text-primary hover:text-primary/80"
                              >
                                {t("update")}
                              </button>
                            </Fragment>
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </section>

            <section>
              <h2 className="text-base/7 font-semibold text-foreground">{t("appearance.title")}</h2>
              <p className="mt-1 text-sm/6 text-muted-foreground">{t("appearance.body")}</p>
              <ThemeToggle className="mt-4" />
            </section>

            {PUBLIC_LOCALES.length > 1 && (
              <section>
                <h2 className="text-base/7 font-semibold text-foreground">{t("language.title")}</h2>
                <p className="mt-1 text-sm/6 text-muted-foreground">{t("language.body")}</p>
                <LanguageSwitcher className="mt-4" />
              </section>
            )}

            <section>
              <h2 className="text-base/7 font-semibold text-foreground">{t("assistant.title")}</h2>
              <p className="mt-1 text-sm/6 text-muted-foreground">{t("assistant.body")}</p>
              <ClearAssistantHistory className="mt-4" />
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

