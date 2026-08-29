import {ImageSquare, UploadSimple, X} from '@phosphor-icons/react';
import {useEffect, useRef, useState, type ChangeEvent} from 'react';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type PreviewEntry = {
  file: File;
  key: string;
  url: string;
};

export type ReferenceUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export type ReferenceUploaderProps = {
  disabled?: boolean;
  onFilesChange: (files: File[]) => void;
  status?: ReferenceUploadStatus;
  /** 允许选择的最大张数；原创 IP 产品图传 1，图鉴参考图传 4。 */
  maxFiles?: number;
  title?: string;
  description?: string;
  emptyLabel?: string;
  selectLabel?: string;
  selectHint?: string;
};

function fileKey(file: File): string {
  return [file.name, file.size, file.lastModified, file.type].join(':');
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileStatusLabel(status: ReferenceUploadStatus): string {
  if (status === 'uploading') return '正在上传';
  if (status === 'uploaded') return '上传成功';
  if (status === 'failed') return '上传失败';
  return '待上传';
}

export function ReferenceUploader({
  disabled = false,
  onFilesChange,
  status = 'pending',
  maxFiles = 4,
  title = '参考图片，可选',
  description,
  emptyLabel = '还没有选择参考图片',
  selectLabel = '选择参考图片',
  selectHint = '图片会先在本机预览，生成时再上传',
}: ReferenceUploaderProps) {
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const entriesRef = useRef<PreviewEntry[]>([]);

  const helpText = description ?? `最多 ${maxFiles} 张，支持 JPG、PNG、WebP，单张不超过 10MB。`;

  function updateEntries(nextEntries: PreviewEntry[]) {
    entriesRef.current = nextEntries;
    setEntries(nextEntries);
    onFilesChange(nextEntries.map(entry => entry.file));
  }

  useEffect(() => () => {
    entriesRef.current.forEach(entry => URL.revokeObjectURL(entry.url));
    entriesRef.current = [];
  }, []);

  function handleSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    const nextMessages: string[] = [];
    const existingKeys = new Set(entriesRef.current.map(entry => entry.key));
    const acceptedFiles: File[] = [];
    const duplicateNames: string[] = [];
    let overflowCount = 0;

    selectedFiles.forEach(file => {
      if (!ACCEPTED_TYPES.has(file.type)) {
        nextMessages.push(`${file.name}：仅支持 JPG、PNG、WebP 图片。`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        nextMessages.push(`${file.name}：单张图片不能超过 10MB。`);
        return;
      }

      const key = fileKey(file);
      if (existingKeys.has(key)) {
        duplicateNames.push(file.name);
        return;
      }
      if (entriesRef.current.length + acceptedFiles.length >= maxFiles) {
        overflowCount += 1;
        return;
      }

      existingKeys.add(key);
      acceptedFiles.push(file);
    });

    if (duplicateNames.length > 0) {
      nextMessages.push(`已忽略重复文件：${duplicateNames.join('、')}。`);
    }
    if (overflowCount > 0) {
      nextMessages.push(`最多上传 ${maxFiles} 张图片，已忽略 ${overflowCount} 个超出数量的文件。`);
    }

    setMessages(nextMessages);
    if (acceptedFiles.length === 0) return;

    const additions = acceptedFiles.map(file => ({
      file,
      key: fileKey(file),
      url: URL.createObjectURL(file),
    }));
    updateEntries([...entriesRef.current, ...additions]);
  }

  function removeEntry(key: string) {
    const removed = entriesRef.current.find(entry => entry.key === key);
    if (removed) URL.revokeObjectURL(removed.url);
    setMessages([]);
    updateEntries(entriesRef.current.filter(entry => entry.key !== key));
  }

  return (
    <section aria-labelledby="reference-uploader-title" className="reference-uploader">
      <div className="create-form__field-heading">
        <div>
          <h2 id="reference-uploader-title">{title}</h2>
          <p>{helpText}</p>
        </div>
        <span>{entries.length}/{maxFiles}</span>
      </div>

      <label className={`reference-uploader__dropzone${disabled ? ' reference-uploader__dropzone--disabled' : ''}`}>
        <UploadSimple aria-hidden="true" size={24} weight="duotone" />
        <span>
          <strong>{selectLabel}</strong>
          <small>{selectHint}</small>
        </span>
        <input
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          multiple={maxFiles > 1}
          onChange={handleSelection}
          type="file"
        />
      </label>

      {messages.length > 0 ? (
        <ul className="reference-uploader__messages" role="alert">
          {messages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
        </ul>
      ) : null}

      {entries.length > 0 ? (
        <ul aria-label="已选择的图片" className="reference-uploader__previews">
          {entries.map(entry => (
            <li className="reference-preview" key={entry.key}>
              <span className="reference-preview__image">
                <img alt={`${entry.file.name} 本地预览`} src={entry.url} />
              </span>
              <span className="reference-preview__copy">
                <strong title={entry.file.name}>{entry.file.name}</strong>
                <span>{formatFileSize(entry.file.size)} {fileStatusLabel(status)}</span>
              </span>
              <button
                aria-label={`移除图片 ${entry.file.name}`}
                className="reference-preview__remove"
                disabled={disabled}
                onClick={() => removeEntry(entry.key)}
                type="button"
              >
                <X aria-hidden="true" size={18} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="reference-uploader__empty">
          <ImageSquare aria-hidden="true" size={20} />
          <span>{emptyLabel}</span>
        </div>
      )}
    </section>
  );
}
