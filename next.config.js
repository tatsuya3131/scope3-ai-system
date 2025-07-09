/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: false, // SWCミニファイアを無効化（SheetJSの問題回避）
  experimental: {
    serverComponentsExternalPackages: ['xlsx']
  },
  // Vercel本番環境での設定
  env: {
    CUSTOM_KEY: 'my-value',
  }
}

module.exports = nextConfig
