import type { ReactNode } from 'react';
import SidebarNav from '@/components/SidebarNav';

// Shared shell for informational pages (Terms, Privacy, FAQ, Support):
// same sidebar nav and page column as the app, with a serif-free
// content layout and per-page title/description passed as props.
export default function InfoPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6 md:pl-64">
      <SidebarNav />
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          {title}
        </h1>
        <p className="mt-2 text-sm text-gray-400">{description}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-gray-300 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-cyan-400 [&_a]:underline">
          {children}
        </div>
      </div>
    </main>
  );
}
