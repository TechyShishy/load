import React from 'react';
import type { FallbackProps } from 'react-error-boundary';

/**
 * Hard (outer) fallback — shown when an error escapes the inner boundary
 * (e.g. thrown from useGame or App itself). Recovery requires a full reload.
 */
export function HardErrorFallback({ error }: FallbackProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
      <div className="border border-red-500 bg-gray-950 rounded-lg p-8 max-w-md w-full text-center shadow-2xl">
        <h1 className="text-red-400 text-3xl font-bold font-mono mb-2 tracking-widest">
          FATAL ERROR
        </h1>
        <p className="text-gray-400 text-sm mb-4">
          An unrecoverable error occurred. Please reload.
        </p>
        {error instanceof Error && (
          <pre className="text-xs font-mono text-red-300 bg-gray-900 rounded p-3 mb-6 text-left overflow-auto max-h-32 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded font-mono transition-colors"
        >
          RELOAD
        </button>
      </div>
    </div>
  );
}

/**
 * Soft (inner) fallback — shown when a rendering error occurs inside App's
 * layout. Auto-dismissed when resetKeys change (i.e. on the next phase
 * transition). The player can also manually dismiss via the button.
 */
export function SoftErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-40">
      <div className="border border-orange-500 bg-gray-950 rounded-lg p-8 max-w-md w-full text-center shadow-2xl">
        <h1 className="text-orange-400 text-3xl font-bold font-mono mb-2 tracking-widest">
          RENDER ERROR
        </h1>
        <p className="text-gray-400 text-sm mb-4">
          A display error occurred. Advance the game to auto-recover, or dismiss
          and try again.
        </p>
        {error instanceof Error && (
          <pre className="text-xs font-mono text-orange-300 bg-gray-900 rounded p-3 mb-6 text-left overflow-auto max-h-32 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <button
          onClick={resetErrorBoundary}
          className="px-5 py-2 bg-orange-700 hover:bg-orange-600 text-white font-bold rounded font-mono transition-colors"
        >
          DISMISS
        </button>
      </div>
    </div>
  );
}
