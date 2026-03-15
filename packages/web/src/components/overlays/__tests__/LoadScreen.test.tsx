import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LoadScreen } from '../LoadScreen.js';
import type { LoadTask } from '../../../loadTasks.js';

function makeTask(label: string, fn: () => Promise<void>): LoadTask {
  return { label, run: fn };
}

describe('LoadScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a status region while tasks are pending', () => {
    // Task that never resolves — stays pending for the duration of the test.
    const task = makeTask('Loading', () => new Promise(() => undefined));
    render(<LoadScreen tasks={[task]} onComplete={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the "LOADing" heading', () => {
    const task = makeTask('Loading', () => new Promise(() => undefined));
    render(<LoadScreen tasks={[task]} onComplete={vi.fn()} />);
    // "LOAD" and "ing" are separate spans but adjacent in the DOM.
    expect(screen.getByText('LOAD')).toBeInTheDocument();
    expect(screen.getByText('ing')).toBeInTheDocument();
  });

  it('renders a progress bar when there are 2+ tasks', () => {
    const pending = () => new Promise<void>(() => undefined);
    const tasks = [makeTask('Task A', pending), makeTask('Task B', pending)];
    render(<LoadScreen tasks={tasks} onComplete={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('does not render a progress bar when there is 1 task', () => {
    const task = makeTask('Task A', () => new Promise(() => undefined));
    render(<LoadScreen tasks={[task]} onComplete={vi.fn()} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('calls onComplete when all tasks resolve', async () => {
    const onComplete = vi.fn();
    const task = makeTask('Done', () => Promise.resolve());

    await act(async () => {
      render(<LoadScreen tasks={[task]} onComplete={onComplete} />);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete while tasks are still pending', () => {
    const onComplete = vi.fn();
    // A task that resolves asynchronously but has not yet.
    let resolve!: () => void;
    const task = makeTask('Pending', () => new Promise<void>((r) => { resolve = r; }));

    render(<LoadScreen tasks={[task]} onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();

    // Clean up the dangling promise so the test does not leak.
    resolve();
  });

  it('calls onComplete even when a task rejects', async () => {
    const onComplete = vi.fn();
    const failingTask = makeTask('Failing', () => Promise.reject(new Error('oops')));

    await act(async () => {
      render(<LoadScreen tasks={[failingTask]} onComplete={onComplete} />);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onComplete immediately when the task list is empty', async () => {
    const onComplete = vi.fn();

    await act(async () => {
      render(<LoadScreen tasks={[]} onComplete={onComplete} />);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('advances the label to the next task as each task completes', async () => {
    let resolveA!: () => void;
    const taskA = makeTask('Loading A', () => new Promise<void>((r) => { resolveA = r; }));
    const taskB = makeTask('Loading B', () => Promise.resolve());

    render(<LoadScreen tasks={[taskA, taskB]} onComplete={vi.fn()} />);

    // Before anything completes, the first task label is shown.
    expect(screen.getByText('Loading A')).toBeInTheDocument();

    // Resolve task A — the component should switch to task B's label.
    await act(async () => { resolveA(); });

    expect(screen.getByText('Loading B')).toBeInTheDocument();
  });
});
