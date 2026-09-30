import { notFound } from 'next/navigation';
import { ChatApp } from '@/components/chat/chat-app';
import { dictionaries, isLocale } from '@/i18n/dictionaries';

export default async function Page({ params }: PageProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <ChatApp locale={lang} dict={dictionaries[lang]} />;
}
