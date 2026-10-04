export default function UnderConstruction({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-24 text-center">
      <h1 className="pp-title text-lg">{title.toUpperCase()}</h1>
      <p className="text-xl" style={{ color: "var(--pp-fg-dim)" }}>
        Under construction.
      </p>
    </div>
  );
}
