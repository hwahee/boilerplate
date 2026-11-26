/**
 * Upload demo — the smallest use of the file API: pick a file, it is
 * uploaded, and it comes back as an address to load it from (the CDN when
 * the server has one). A feature with images does the same and keeps the
 * returned `StoredFile.url` wherever the image belongs.
 *
 * The list is local state on purpose: the server has no "my files" list, so
 * what this tab uploaded is known only here and is gone on reload (the files
 * themselves stay).
 */
import { isInlineImage, type StoredFile } from '@shared/domain/file';
import { FileDown, Trash2 } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';

import { ApiRequestError } from '../api/http';
import { useCaller, useDeleteFile, useUploadFile } from '../api/queries';
import { useI18n } from '../i18n/locale-context';
import { TESTID } from '../testing/testids';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';

function formatBytes(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'narrow',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/** The limit the server reported with a 413, if that is what `error` is. */
function maxBytesOf(error: unknown): number | undefined {
  if (!(error instanceof ApiRequestError) || error.code !== 'PAYLOAD_TOO_LARGE') return undefined;
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('maxBytes' in details)) return undefined;
  return typeof details.maxBytes === 'number' ? details.maxBytes : undefined;
}

export function UploadDemo() {
  const { t, locale } = useI18n();
  const inputId = useId();
  // An upload outlives the visit, so only members upload — the server
  // enforces this; the UI just doesn't offer what would be refused.
  const caller = useCaller();
  const canWrite = caller === 'member' || caller === 'anyone';
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();
  const [files, setFiles] = useState<StoredFile[]>([]);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    deleteFile.reset();
    uploadFile.mutate(file, {
      onSuccess: (stored) => setFiles((current) => [stored, ...current]),
      // Cleared so picking the same file again is a change again.
      onSettled: () => (input.value = ''),
    });
  };

  const remove = (id: string) => {
    uploadFile.reset();
    deleteFile.mutate(id, {
      onSuccess: () => setFiles((current) => current.filter((file) => file.id !== id)),
    });
  };

  const maxBytes = maxBytesOf(uploadFile.error);
  const errorMessage = uploadFile.isError
    ? maxBytes === undefined
      ? t('files.uploadFailed')
      : t('files.tooLarge', { max: formatBytes(maxBytes, locale) })
    : deleteFile.isError
      ? t('files.deleteFailed')
      : undefined;

  return (
    <section
      className="uploads"
      aria-labelledby="uploads-heading"
      data-testid={TESTID.uploads.section}
    >
      <h2 id="uploads-heading">{t('files.title')}</h2>
      <p className="muted">{t('files.description')}</p>

      {caller === 'guest' && (
        <Alert tone="info" testId={TESTID.uploads.guestHint}>
          {t('files.guestHint')}
        </Alert>
      )}

      {canWrite && (
        <div className="field">
          <label className="field__label" htmlFor={inputId}>
            {t('files.pickLabel')}
          </label>
          <div className="uploads__picker">
            <input
              id={inputId}
              className="field__input"
              type="file"
              onChange={pick}
              disabled={uploadFile.isPending}
              data-testid={TESTID.uploads.input}
            />
            {uploadFile.isPending && (
              <span
                className="uploads__status"
                role="status"
                data-testid={TESTID.uploads.uploading}
              >
                <Spinner size="sm" />
                {t('files.uploading')}
              </span>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <Alert tone="error" testId={TESTID.uploads.error}>
          {errorMessage}
        </Alert>
      )}

      {files.length > 0 && (
        <ul className="uploads__list" data-testid={TESTID.uploads.list}>
          {files.map((file) => (
            <li key={file.id} className="uploads__item" data-testid={TESTID.uploads.item(file.id)}>
              {isInlineImage(file.contentType) ? (
                <img className="uploads__thumb" src={file.url} alt="" loading="lazy" />
              ) : (
                <span className="uploads__thumb uploads__thumb--file" aria-hidden>
                  <FileDown size="1.25em" />
                </span>
              )}
              <div className="uploads__meta">
                <a
                  className="uploads__name"
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={TESTID.uploads.itemLink(file.id)}
                >
                  {file.name}
                </a>
                <span className="muted">
                  {file.contentType} · {formatBytes(file.size, locale)}
                </span>
              </div>
              <Button
                variant="ghost"
                aria-label={t('files.deleteFile', { name: file.name })}
                loading={deleteFile.isPending && deleteFile.variables === file.id}
                onClick={() => remove(file.id)}
                testId={TESTID.uploads.itemDelete(file.id)}
              >
                <Trash2 aria-hidden size="1em" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
