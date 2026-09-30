import { NextStepSchema } from '@healtrip/shared';

// Placeholder — the chat UI is built in the frontend step.
// Importing from @healtrip/shared here verifies the workspace contract wiring.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">HealTrip Patient Decision Assistant</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Scaffold ready. Supported next steps: {NextStepSchema.options.join(', ')}
      </p>
    </main>
  );
}
