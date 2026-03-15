import React, { useEffect, useRef, useState } from 'react';
import type { LoadTask } from '../../loadTasks.js';

interface LoadScreenProps {
  tasks: LoadTask[];
  onComplete: () => void;
}

/**
 * Shown unconditionally on cold start before the StartScreen renders.
 *
 * Fires all tasks concurrently via Promise.allSettled so a single failing
 * asset (e.g. missing SVG) does not block gameplay. Progress is tracked
 * per-task: when there are 2+ tasks a deterministic progress bar is shown;
 * with only 1 task a spinner is shown instead (a bar jumping 0→100 in one
 * step is misleading).
 *
 * onComplete is captured in a ref so callers do not need a stable callback
 * identity and the effect only runs once.
 */
export function LoadScreen({ tasks, onComplete }: LoadScreenProps) {
  const [completedCount, setCompletedCount] = useState(0);
  const [currentLabel, setCurrentLabel] = useState(tasks[0]?.label ?? '');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const total = tasks.length;
  const showProgressBar = total >= 2;

  useEffect(() => {
    if (total === 0) {
      onCompleteRef.current();
      return;
    }

    let cancelled = false;
    let completed = 0;

    const promises = tasks.map((task) =>
      task.run().then(
        () => {
          completed += 1;
          setCompletedCount(completed);
          // Show the label of the next pending task, or keep the last one.
          const nextTask = tasks[completed];
          if (nextTask) setCurrentLabel(nextTask.label);
        },
        (err: unknown) => {
          completed += 1;
          setCompletedCount(completed);
          console.error(`[LoadScreen] Task "${task.label}" failed:`, err);
          const nextTask = tasks[completed];
          if (nextTask) setCurrentLabel(nextTask.label);
        },
      ),
    );

    void Promise.allSettled(promises).then(() => {
      if (!cancelled) onCompleteRef.current();
    });
    // One-shot: re-running on tasks prop change would restart loading, which is never
    // desired. This screen is mounted once and unmounted when loading completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true; };
  }, []);

  const progressValue = total > 0 ? completedCount / total : 0;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-black"
      role="status"
      aria-label="Loading game assets"
    >
      {/* Visual pun: "LOAD" in logo cyan + "ing" in muted gray */}
      <div className="font-mono font-bold tracking-widest text-4xl mb-8 select-none">
        <span className="text-cyan-400">LOAD</span>
        <span className="text-gray-500">ing</span>
      </div>

      {showProgressBar ? (
        <div className="w-64">
          <progress
            className="w-full h-2 [&::-webkit-progress-bar]:rounded [&::-webkit-progress-bar]:bg-gray-800 [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-cyan-500"
            value={progressValue}
            max={1}
            aria-label={currentLabel}
          />
          <div className="text-gray-500 text-xs font-mono tracking-widest text-center mt-2">
            {currentLabel}
          </div>
        </div>
      ) : (
        <div
          className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"
          aria-label={currentLabel}
        />
      )}
    </div>
  );
}
