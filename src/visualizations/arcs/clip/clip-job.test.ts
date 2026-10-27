import { describe, expect, it, vi } from 'vitest';
import { fakeClipMaking as fakeMaking } from '../../../test-utils/clip.ts';
import { ClipJob } from './clip-job.ts';

describe('ClipJob', () => {
  it('is idle until a clip is asked for', () => {
    const job = new ClipJob();
    expect(job.getState()).toEqual({ kind: 'idle' });
    expect(job.isRecording()).toBe(false);
  });

  it('shows a clip’s progress in whole percents, telling who listens', () => {
    const job = new ClipJob();
    const listener = vi.fn();
    job.subscribe(listener);
    const clip = fakeMaking();
    job.start(clip.make, 'john-3-16.webm');
    expect(job.getState()).toEqual({
      kind: 'recording',
      progress: 0,
      preview: clip.making.preview,
    });
    expect(job.isRecording()).toBe(true);
    clip.progress(0.424);
    clip.progress(0.426);
    clip.progress(1.2);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(job.getState()).toEqual(expect.objectContaining({ progress: 1 }));
  });

  it('makes one clip at a time', () => {
    const job = new ClipJob();
    const first = fakeMaking();
    const second = fakeMaking();
    job.start(first.make, 'a.webm');
    job.start(second.make, 'b.webm');
    expect(second.make).not.toHaveBeenCalled();
  });

  it('holds the clip made as a file of the given name and the recording’s type', async () => {
    const job = new ClipJob();
    const clip = fakeMaking();
    job.start(clip.make, 'john-3-16.mp4');
    await clip.finish(new Blob(['video'], { type: 'video/mp4' }));
    const state = job.getState();
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') {
      expect(state.file.name).toBe('john-3-16.mp4');
      expect(state.file.type).toBe('video/mp4');
      expect(state.preview).toBe(clip.making.preview);
    }
    // Progress reported after the end changes nothing.
    clip.progress(0.5);
    expect(job.getState()).toBe(state);
  });

  it('says so when the clip could not be made or recorded', async () => {
    const job = new ClipJob();
    job.start(() => {
      throw new Error('No 2D canvas.');
    }, 'x.webm');
    expect(job.getState()).toEqual({ kind: 'failed' });

    const clip = fakeMaking();
    job.start(clip.make, 'x.webm');
    await clip.fail(new Error('Encoder gone.'));
    expect(job.getState()).toEqual({ kind: 'failed' });
  });

  it('stops at once when cancelled, and ignores the recording’s end', async () => {
    const job = new ClipJob();
    const clip = fakeMaking();
    job.start(clip.make, 'x.webm');
    job.cancel();
    expect(clip.cancel).toHaveBeenCalled();
    expect(job.getState()).toEqual({ kind: 'idle' });
    clip.progress(0.5);
    await clip.finish(new Blob(['late']));
    expect(job.getState()).toEqual({ kind: 'idle' });

    const failing = fakeMaking();
    job.start(failing.make, 'y.webm');
    job.cancel();
    await failing.fail(new Error('Stopped.'));
    expect(job.getState()).toEqual({ kind: 'idle' });
  });

  it('ends as idle when the recording is cancelled from elsewhere', async () => {
    const job = new ClipJob();
    const clip = fakeMaking();
    job.start(clip.make, 'x.webm');
    await clip.finish(null);
    expect(job.getState()).toEqual({ kind: 'idle' });
  });

  it('puts away a clip made, and a failure, when dismissed', async () => {
    const job = new ClipJob();
    const clip = fakeMaking();
    job.start(clip.make, 'x.webm');
    await clip.finish(new Blob(['video']));
    job.dismiss();
    expect(job.getState()).toEqual({ kind: 'idle' });
    job.cancel();
    expect(job.getState()).toEqual({ kind: 'idle' });
  });

  it('stops telling a listener that has unsubscribed', () => {
    const job = new ClipJob();
    const listener = vi.fn();
    job.subscribe(listener)();
    job.start(fakeMaking().make, 'x.webm');
    expect(listener).not.toHaveBeenCalled();
  });
});
