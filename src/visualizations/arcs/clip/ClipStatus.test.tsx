import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClipMaking } from '../../../test-utils/clip.ts';
import { ClipJob } from './clip-job.ts';
import { ClipStatus } from './ClipStatus.tsx';

/** A job with a clip on its way, and the status showing it. */
function recording() {
  const job = new ClipJob();
  const clip = fakeClipMaking();
  act(() => {
    job.start(clip.make, 'john-3-16-bible.webm');
  });
  render(<ClipStatus job={job} />);
  return { job, clip };
}

async function ready() {
  const { job, clip } = recording();
  await act(async () => {
    await clip.finish(new Blob(['video'], { type: 'video/webm' }));
  });
  return { job, clip };
}

/** Catches clicks on download links, which happy-dom would otherwise follow. */
function captureDownloads() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  return downloads;
}

function offerShareSheet(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(navigator, 'share');
});

describe('ClipStatus', () => {
  it('shows nothing until a clip is asked for', () => {
    const { container } = render(<ClipStatus job={new ClipJob()} />);
    expect(container.childElementCount).toBe(0);
  });

  it('shows the clip being made, how far it has got, and a way to stop', async () => {
    const { job, clip } = recording();
    const status = screen.getByRole('region', { name: 'Video' });
    expect(screen.getByRole('status').textContent).toBe('Making the video…');
    // The clip plays in the page while it records: a canvas out of the document may not paint.
    expect(status.querySelector('canvas')).toBe(clip.making.preview);
    act(() => {
      clip.progress(0.42);
    });
    const bar = screen.getByRole('progressbar', { name: 'Making the video…' });
    expect(bar.getAttribute('value')).toBe('0.42');
    expect(status.textContent).toContain('42%');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(clip.cancel).toHaveBeenCalled();
    expect(job.getState()).toEqual({ kind: 'idle' });
    expect(screen.queryByRole('region')).toBeNull();
    expect(clip.making.preview.isConnected).toBe(false);
  });

  it('saves the clip made where there is no share sheet', async () => {
    const downloads = captureDownloads();
    await ready();
    expect(screen.getByRole('status').textContent).toBe('Your video is ready.');
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(downloads).toEqual(['john-3-16-bible.webm']);
  });

  it('hands the clip to the share sheet where there is one', async () => {
    const downloads = captureDownloads();
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    offerShareSheet(share);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    const files = share.mock.calls[0]?.[0].files ?? [];
    expect(files.map((file) => [file.name, file.type])).toEqual([
      ['john-3-16-bible.webm', 'video/webm'],
    ]);
    expect(downloads).toEqual([]);
  });

  it('leaves the clip be when the share sheet is closed, and saves it when it fails', async () => {
    const downloads = captureDownloads();
    const share = vi
      .fn<(data: ShareData) => Promise<void>>()
      .mockRejectedValueOnce(new DOMException('Closed', 'AbortError'))
      .mockRejectedValueOnce(new DOMException('No', 'NotAllowedError'));
    offerShareSheet(share);
    await ready();
    const button = screen.getByRole('button', { name: 'Share' });
    await userEvent.click(button);
    expect(downloads).toEqual([]);
    await userEvent.click(button);
    expect(downloads).toEqual(['john-3-16-bible.webm']);
  });

  it('puts the clip away when closed', async () => {
    const { job } = await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(job.getState()).toEqual({ kind: 'idle' });
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('says so when the clip could not be made', async () => {
    const { clip } = recording();
    await act(async () => {
      await clip.fail(new Error('Encoder gone.'));
    });
    expect(screen.getByRole('status').textContent).toBe('The video could not be made.');
    expect(screen.getByRole('region').querySelector('canvas')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region')).toBeNull();
  });
});
