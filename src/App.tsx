export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Carnet de barre</h1>
        <span className="text-sm text-muted">socle</span>
      </header>
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">
          Squelette installable. L'écran de séance arrive avec CB-20.
        </p>
        <p className="num mt-2 text-4xl font-bold">
          75 <span className="text-base font-normal text-muted">kg · cible</span>
        </p>
      </section>
    </main>
  )
}
