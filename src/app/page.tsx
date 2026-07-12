export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center px-6">
        <h1 className="text-2xl font-semibold text-gray-800 mb-3">
          Conneverse — MVP
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Backend is up. Frontend UI is being rebuilt.
        </p>
        <p className="text-xs text-gray-400">
          Try:{" "}
          <code className="px-2 py-1 bg-gray-100 rounded">
            POST /api/search
          </code>
        </p>
      </div>
    </main>
  );
}