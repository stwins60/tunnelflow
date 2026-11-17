/**
 * Guard against SSRF via user-supplied webhook URLs: only https and known hosts.
 */
export function assertWebhookUrl(raw: string, allowedHosts: string[], pathPrefix: string): void {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Invalid webhook URL')
  }
  if (u.protocol !== 'https:' || !allowedHosts.includes(u.hostname) || !u.pathname.startsWith(pathPrefix)) {
    throw new Error(`Webhook URL must be https://${allowedHosts[0]}${pathPrefix}...`)
  }
}
