/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Redact sensitive query params from logs
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'bcryptjs', 'nodemailer', 'js-yaml'],
  },
}

module.exports = nextConfig
