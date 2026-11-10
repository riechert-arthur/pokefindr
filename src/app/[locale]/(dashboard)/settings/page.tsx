'use client'

import { useState, useEffect } from 'react'
import { MailIcon, MenuIcon } from "lucide-react"
import { toast } from 'sonner'
import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"
import { LanguageSwitcher } from "@/components/pokefindr/LanguageSwitcher"
import axios from 'axios'
import { useTranslations } from 'next-intl'
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import { APP_NAV_ID } from '@/components/pokefindr/AppRail'
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { ProfileField } from "@/components/pokefindr/ProfileField"
import { ProfilePictureField } from "@/components/pokefindr/ProfilePictureField"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSessionContext } from '@/components/providers/SessionProvider'
import { ClearAssistantHistory } from '@/components/assistant/ClearAssistantHistory'
import { useSubmitErrorMessage } from '@/lib/forms'
import { broadcastAuth } from '@/lib/auth/broadcast'
import { PUBLIC_LOCALES } from '@/i18n/routing'

interface Settings {
  fullName: string
  email:    string
  username:    string
}

function toForm(file: File): FormData {
  const form = new FormData()
  form.append('file', file)
  return form
}

const FIELDS = [
  { field: 'fullName', type: 'text', autoComplete: 'name' },
  { field: 'email', type: 'email', autoComplete: 'email' },
  { field: 'username', type: 'text', autoComplete: 'username' },
] as const

export default function SettingsPage() {
  const submitErrorMessage = useSubmitErrorMessage()
  const t = useTranslations('settings')
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session, setSession } = useSessionContext()

  const [settings, setSettings]     = useState<Settings>({ fullName: '', email: '', username: '' })
  const [loading, setLoading]       = useState(true)
  const [editing, setEditing]       = useState<keyof Settings | null>(null)
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

  /** Saves one field; returns the error to show next to it, if any. */
  async function saveField(field: keyof Settings, value: string): Promise<string | void> {
    if (value === settings[field]) return void setEditing(null)
    try {
      const { data } = await axios.patch<{ emailPending?: boolean }>(
        '/api/user-settings',
        { [field]: value },
        { withCredentials: true }
      )
      if (data.emailPending) {
        // Nothing changes until both addresses have answered.
        setEmailNote(t('email.pending', { current: settings.email, next: value }))
      } else {
        setSettings((s) => ({ ...s, [field]: value }))
        toast.success(t('saved'))
      }
      setEditing(null)
    } catch (err) {
      return submitErrorMessage(err)
    }
  }

  /** Uploads or removes the profile picture; the header updates at once, and other tabs re-read the session. */
  async function changeAvatar(file: File | null): Promise<string | void> {
    try {
      const { data } = file
        ? await axios.post<{ image: string }>('/api/user-settings/avatar', toForm(file), { withCredentials: true })
        : await axios.delete<{ image: null }>('/api/user-settings/avatar', { withCredentials: true })
      setSession((s) => (s ? { ...s, image: data.image } : s))
      broadcastAuth('login')
      toast.success(t(file ? 'avatar.uploaded' : 'avatar.removed'))
    } catch (err) {
      return submitErrorMessage(err)
    }
  }

  return (
    <div className={isSidebarOpen ? 'max-sm:ml-16' : undefined}>
      <header className="absolute inset-x-0 top-0 z-10 flex h-16 border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="mr-2 sm:hidden" aria-label={t("openNav")} aria-controls={APP_NAV_ID} aria-expanded={isSidebarOpen}>
            <MenuIcon aria-hidden className="text-muted-foreground" />
          </Button>
          <div />
          <div className="flex items-center gap-x-8">
            {session ? <UserMenu userName={session.username} imageUrl={session.image} /> : <Skeleton className="size-9 rounded-full" />}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl pt-8 lg:flex lg:gap-x-16 lg:px-8">
        <h1 className="sr-only">{t("title")}</h1>

        {/* SidebarLayout already renders the page's <main>. */}
        <div className="px-4 py-16 sm:px-6 lg:flex-auto lg:px-0 lg:py-20">
          <div className="mx-auto max-w-2xl space-y-16 sm:space-y-20 lg:mx-0 lg:max-w-none">
            <section aria-labelledby="settings-profile">
              <h2 id="settings-profile" className="text-subheading text-foreground">{t("profile.title")}</h2>
              <p className="mt-1 text-body text-muted-foreground">
                {t("profile.body")}
              </p>

              {emailNote && (
                <Alert role="status" className="mt-4">
                  <MailIcon aria-hidden className="size-4" />
                  <AlertDescription className="text-body">{emailNote}</AlertDescription>
                </Alert>
              )}
              {loading ? (
                <div role="status" aria-label={t("loadingProfile")} className="mt-6 divide-y divide-border border-t border-border">
                  {FIELDS.map(({ field }) => (
                    <div key={field} className="py-6 sm:flex">
                      <div className="sm:w-64 sm:flex-none sm:pr-6"><Skeleton className="h-5 w-28" /></div>
                      <Skeleton className="mt-2 h-5 w-48 sm:mt-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <dl className="mt-6 divide-y divide-border border-t border-border">
                  {session && (
                    <ProfilePictureField
                      name={session.username}
                      image={session.image}
                      onUpload={(file) => changeAvatar(file)}
                      onRemove={() => changeAvatar(null)}
                    />
                  )}
                  {FIELDS.map(({ field, type, autoComplete }) => (
                    <ProfileField
                      key={field}
                      label={t(`fields.${field}`)}
                      value={settings[field]}
                      type={type}
                      autoComplete={autoComplete}
                      editing={editing === field}
                      onEdit={() => setEditing(field)}
                      onCancel={() => setEditing(null)}
                      onSave={(value) => saveField(field, value)}
                    />
                  ))}
                </dl>
              )}
            </section>

            <section aria-labelledby="settings-appearance">
              <h2 id="settings-appearance" className="text-subheading text-foreground">{t("appearance.title")}</h2>
              <p className="mt-1 text-body text-muted-foreground">{t("appearance.body")}</p>
              <ThemeToggle className="mt-4" />
            </section>

            {PUBLIC_LOCALES.length > 1 && (
              <section aria-labelledby="settings-language">
                <h2 id="settings-language" className="text-subheading text-foreground">{t("language.title")}</h2>
                <p className="mt-1 text-body text-muted-foreground">{t("language.body")}</p>
                <LanguageSwitcher className="mt-4" />
              </section>
            )}

            <section aria-labelledby="settings-assistant">
              <h2 id="settings-assistant" className="text-subheading text-foreground">{t("assistant.title")}</h2>
              <p className="mt-1 text-body text-muted-foreground">{t("assistant.body")}</p>
              <ClearAssistantHistory className="mt-4" />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
