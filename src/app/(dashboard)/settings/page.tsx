
'use client'

import { useState, useEffect, Fragment } from 'react'
import axios from 'axios'
import { Bars3Icon } from '@heroicons/react/20/solid'
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import Avatar from '@/components/ui/Avatar'
import { LoadSpinner } from '@/components/wrappers/LoadSpinner'
import { useSessionContext } from '@/components/providers/SessionProvider'

interface Settings {
  fullName: string
  email:    string
  username:    string
}

export default function SettingsPage() {
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session, isLoading } = useSessionContext()

  const [settings, setSettings]     = useState<Settings>({ fullName: '', email: '', username: '' })
  const [loading, setLoading]       = useState(true)
  const [editing, setEditing]       = useState<keyof Settings | null>(null)
  const [inputValue, setInputValue] = useState('')

  

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
      await axios.patch(
        '/api/user-settings',
        { [field]: inputValue },
        { withCredentials: true }
      )
      setSettings((s) => ({ ...s, [field]: inputValue }))
      setEditing(null)
    } catch (err) {
      console.error('Failed to save', err)
    }
  }

  function cancelEdit() {
    setEditing(null)
  }

  if (isLoading) {
    return <LoadSpinner text="Loading profile.." />
  }

  return (
    <div className={`${isSidebarOpen ? 'ml-16' : ''} md:ml-16`}>
      <header className="absolute inset-x-0 top-0 z-10 flex h-16 border-b border-gray-900/10">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={toggleSidebar} className="md:hidden mr-2 p-1 rounded" aria-label="Toggle menu">
            <Bars3Icon className="w-6 h-6 text-gray-600 hover:text-blue-600" />
          </button>
          <div />
          <div className="flex items-center gap-x-8">
            {/*<button className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500">
              <span className="sr-only">View notifications</span>
              <BellIcon className="h-6 w-6" />
            </button>*/}
            <Avatar userName={session?.username || "Pokefindr"} size={40} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl pt-8 lg:flex lg:gap-x-16 lg:px-8">
        <h1 className="sr-only">General Settings</h1>

        <main className="px-4 py-16 sm:px-6 lg:flex-auto lg:px-0 lg:py-20">
          <div className="mx-auto max-w-2xl space-y-16 sm:space-y-20 lg:mx-0 lg:max-w-none">
            <section>
              <h2 className="text-base/7 font-semibold text-gray-900">Profile</h2>
              <p className="mt-1 text-sm/6 text-gray-500">
                This information will be displayed publicly so be careful what you share.
              </p>

              {loading ? (
                <LoadSpinner text="Loading settings..." /> 
              ) : (
                <dl className="mt-6 divide-y divide-gray-100 border-t border-gray-200 text-sm/6">
                  {(['fullName','email','username'] as const).map((field) => {
                    const label = field === 'fullName'
                      ? 'Full name'
                      : field === 'email'
                      ? 'Email address'
                      : 'Username'
                    const value = settings[field]

                    return (
                      <div key={field} className="py-6 sm:flex">
                        <dt className="font-medium text-gray-900 sm:w-64 sm:flex-none sm:pr-6">
                          {label}
                        </dt>
                        <dd className="mt-1 flex justify-between gap-x-6 sm:mt-0 sm:flex-auto">
                          {editing === field ? (
                            <div className="flex w-full gap-x-2">
                              <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="flex-grow rounded-md border p-2"
                              />
                              <button
                                onClick={() => saveEdit(field)}
                                className="px-3 py-1 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-indigo-500"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1 text-sm font-semibold text-gray-600 rounded hover:text-gray-800"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <Fragment>
                              <div className="text-gray-900">{value}</div>
                              <button
                                onClick={() => startEdit(field)}
                                className="font-semibold text-blue-600 hover:text-blue-500"
                              >
                                Update
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
          </div>
        </main>
      </div>
    </div>
  )
}

