import { Inter } from 'next/font/inter'
import Scope3DictionaryPOC from '@/components/Scope3DictionaryPOC'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {
  return (
    <main className={`${inter.className}`}>
      <Scope3DictionaryPOC />
    </main>
  )
}
