import type { Metadata } from 'next';
import { Geist, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { dictionaries, directionOf, isLocale, LOCALES } from '@/i18n/dictionaries';

const latin = Geist({ variable: '--font-latin', subsets: ['latin'] });
const arabic = IBM_Plex_Sans_Arabic({
  variable: '--font-arabic',
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
});

/** /en and /ar are pre-rendered; any other first segment is a 404. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const { meta } = dictionaries[lang];
  return {
    title: meta.title,
    description: meta.description,
    alternates: { languages: { en: '/en', ar: '/ar' } },
  };
}

/** Root layout: language and text direction are set on <html> by the server (no RTL flash). */
export default async function RootLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html
      lang={lang}
      dir={directionOf(lang)}
      className={`${latin.variable} ${arabic.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
