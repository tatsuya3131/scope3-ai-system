import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import Script from 'next/script'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Scope3 AI辞書学習システム</title>
        <meta name="description" content="調達データから自動辞書生成・品目分類システム" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      {/* XLSXライブラリを確実に読み込み */}
      <Script 
        src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
        strategy="beforeInteractive"
        onLoad={() => {
          console.log('✅ XLSXライブラリ読み込み完了');
          (window as any).xlsxLoaded = true;
        }}
        onError={() => {
          console.error('❌ XLSXライブラリ読み込み失敗');
        }}
      />
      
      <Component {...pageProps} />
    </>
  )
}
