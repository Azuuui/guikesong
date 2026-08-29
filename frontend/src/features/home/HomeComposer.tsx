import {ArrowUp,CircleNotch,Plus,X} from '@phosphor-icons/react';
import {useEffect,useRef,type ChangeEvent,type KeyboardEvent} from 'react';
import '../../styles/home-composer.css';

export type HomeAttachmentStatus='pending'|'uploading'|'uploaded'|'failed';

export type HomeAttachment={
  id:string;
  name:string;
  previewUrl:string;
  status:HomeAttachmentStatus;
};

export type HomeComposerProps={
  prompt:string;
  /** 输入框灰字提示：由当前选中模板的输入建议提供。 */
  placeholder:string;
  attachments:readonly HomeAttachment[];
  busy?:boolean;
  error?:string;
  onPromptChange:(value:string)=>void;
  onAddFiles:(files:File[])=>void;
  onRemoveAttachment:(id:string)=>void;
  onSubmit:()=>void;
};

const STATUS_LABELS:Record<HomeAttachmentStatus,string>={
  pending:'待上传',
  uploading:'正在上传',
  uploaded:'已上传',
  failed:'上传失败',
};

export function HomeComposer({
  prompt,
  placeholder,
  attachments,
  busy=false,
  error,
  onPromptChange,
  onAddFiles,
  onRemoveAttachment,
  onSubmit,
}:HomeComposerProps){
  const textareaRef=useRef<HTMLTextAreaElement>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);
  const canSubmit=!busy&&prompt.trim().length>=2;

  useEffect(()=>{
    const textarea=textareaRef.current;
    if(!textarea) return;
    const syncHeight=()=>{
      textarea.style.height='auto';
      textarea.style.height=`${Math.min(168,Math.max(24,textarea.scrollHeight))}px`;
    };
    syncHeight();
    window.addEventListener('resize',syncHeight);
    return ()=>window.removeEventListener('resize',syncHeight);
  },[prompt]);

  function submitFromKeyboard(event:KeyboardEvent<HTMLTextAreaElement>){
    if(event.key!=='Enter'||event.shiftKey||event.nativeEvent.isComposing) return;
    event.preventDefault();
    if(canSubmit) onSubmit();
  }

  function handleFiles(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.currentTarget.files??[]);
    event.currentTarget.value='';
    if(files.length>0) onAddFiles(files);
  }

  return (
    <section className="home-composer" aria-label="一句话创作">
      <div className="home-composer__surface">
        <div className="home-composer__content">
          <textarea
            aria-label="一句话创作需求"
            className="home-composer__textarea"
            disabled={busy}
            maxLength={500}
            onChange={event=>onPromptChange(event.currentTarget.value)}
            onKeyDown={submitFromKeyboard}
            placeholder={placeholder}
            ref={textareaRef}
            rows={1}
            value={prompt}
          />

          {attachments.length>0?(
            <ul aria-label="已添加的参考图片" className="home-composer__attachments">
              {attachments.map(attachment=>(
                <li className={`home-composer__attachment home-composer__attachment--${attachment.status}`} key={attachment.id}>
                  <img alt="" src={attachment.previewUrl} />
                  <span className="home-composer__attachment-copy">
                    <strong title={attachment.name}>{attachment.name}</strong>
                    <small>{STATUS_LABELS[attachment.status]}</small>
                  </span>
                  <button
                    aria-label={`移除图片 ${attachment.name}`}
                    className="home-composer__attachment-remove"
                    disabled={busy}
                    onClick={()=>onRemoveAttachment(attachment.id)}
                    type="button"
                  >
                    <X aria-hidden="true" size={14} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          ):null}
        </div>

        <div className="home-composer__actions">
          <button
            aria-label="添加参考图片"
            className="home-composer__icon-button home-composer__icon-button--add"
            disabled={busy}
            onClick={()=>fileInputRef.current?.click()}
            title="添加参考图片"
            type="button"
          >
            <Plus aria-hidden="true" size={20} weight="bold" />
          </button>
          <button
            aria-label="开始生成"
            className="home-composer__icon-button home-composer__icon-button--submit"
            disabled={!canSubmit}
            onClick={onSubmit}
            title="开始生成"
            type="button"
          >
            {busy
              ?<CircleNotch aria-hidden="true" className="button__spinner" size={20} weight="bold" />
              :<ArrowUp aria-hidden="true" size={20} weight="bold" />}
          </button>
        </div>

        <input
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择参考图片"
          className="home-composer__file-input"
          disabled={busy}
          multiple
          onChange={handleFiles}
          ref={fileInputRef}
          type="file"
        />
      </div>

      <div className="home-composer__feedback">
        {busy?<p aria-live="polite" role="status">正在生成</p>:null}
        {error?<p role="alert">{error}</p>:null}
      </div>
    </section>
  );
}
