
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import axios from 'axios'

interface AvatarProps {
  size: number
  userName: string
  imageUrl?: string
  className?: string
}

export default function Avatar({
  size,
  userName,
  imageUrl,
  className,
}: AvatarProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    function handleClickOutside(ev: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    try {
      // No body; request options go in the third argument.
      await axios.post('/api/auth/logout', undefined, { withCredentials: true })
      new BroadcastChannel("auth").postMessage("logout")
      router.refresh()
      router.push('/login')
    } catch (err) {
      console.error('Logout failed', err)
    }
  }

  return (
    <span
      ref={containerRef}
      className={`relative inline-block hover:cursor-pointer ${className ?? ''}`}
    >
      <button onClick={() => setOpen(o => !o)}>
        {imageUrl ? (
          <img
            alt="User avatar"
            src={imageUrl}
            style={{ width: size, height: size }}
            className="rounded-full object-cover"
          />
        ) : (
          <div
            // primary-foreground on brand is checked at 4.5:1 in both themes (__tests__/design/tokens.test.ts).
            style={{ width: size, height: size }}
            className="rounded-full flex items-center justify-center bg-brand text-primary-foreground font-semibold uppercase text-lg"
          >
            {userName.charAt(0)}
          </div>
        )}
      </button>


      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-35 bg-card border rounded-lg shadow-lg z-50">
          <Link
            href="/settings"
            className="block px-4 py-2 text-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-foreground hover:bg-muted"
          >
            Log out
          </button>
        </div>
      )}
    </span>
  )
}

