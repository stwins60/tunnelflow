'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CopyButton({
  text,
  className,
  size = 'icon',
}: {
  text: string
  className?: string
  size?: 'icon' | 'sm' | 'default'
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for non-HTTPS environments
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Button
      variant="ghost"
      size={size as any}
      onClick={copy}
      className={cn('shrink-0', className)}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

/** Displays a code block with an inline copy button. */
export function CopyCode({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-md border bg-muted">
      {label && (
        <div className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      )}
      <div className="flex items-start gap-2 p-3">
        <pre className="flex-1 overflow-x-auto whitespace-pre font-mono text-xs leading-5">{code}</pre>
        <CopyButton text={code} size="icon" />
      </div>
    </div>
  )
}
