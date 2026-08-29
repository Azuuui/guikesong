import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {HomeComposer,type HomeComposerProps} from './HomeComposer';

function renderComposer(overrides:Partial<HomeComposerProps>={}){
  const props:HomeComposerProps={
    attachments:[],
    onAddFiles:vi.fn(),
    onPromptChange:vi.fn(),
    onRemoveAttachment:vi.fn(),
    onSubmit:vi.fn(),
    prompt:'',
    ...overrides,
  };
  return {props,...render(<HomeComposer {...props} />)};
}

describe('HomeComposer',()=>{
  it('输入不足 2 字时禁用生成',()=>{
    const empty=renderComposer();
    expect(screen.getByRole('button',{name:'开始生成'})).toBeDisabled();
    empty.unmount();

    renderComposer({prompt:'黔'});
    expect(screen.getByRole('button',{name:'开始生成'})).toBeDisabled();
  });

  it('Enter 生成，Shift+Enter 换行',()=>{
    const onSubmit=vi.fn();
    renderComposer({onSubmit,prompt:'贵州避暑'});
    const textarea=screen.getByRole('textbox',{name:'一句话创作需求'});

    fireEvent.keyDown(textarea,{key:'Enter',shiftKey:true});
    expect(onSubmit).not.toHaveBeenCalled();

    const event=fireEvent.keyDown(textarea,{key:'Enter'});
    expect(event).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('中文输入法组词时 Enter 不误提交',()=>{
    const onSubmit=vi.fn();
    renderComposer({onSubmit,prompt:'贵州避暑'});

    fireEvent.keyDown(screen.getByRole('textbox',{name:'一句话创作需求'}),{
      key:'Enter',
      isComposing:true,
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('加号传递图片文件并允许移除附件',()=>{
    const onAddFiles=vi.fn();
    const onRemoveAttachment=vi.fn();
    renderComposer({
      attachments:[{
        id:'asset-1',
        name:'黄果树.png',
        previewUrl:'blob:yellow-falls',
        status:'pending',
      }],
      onAddFiles,
      onRemoveAttachment,
      prompt:'贵州避暑',
    });
    const file=new File(['image'],'reference.png',{type:'image/png'});
    const input=screen.getByLabelText('选择参考图片');

    fireEvent.change(input,{target:{files:[file]}});
    expect(onAddFiles).toHaveBeenCalledWith([file]);
    fireEvent.click(screen.getByRole('button',{name:'移除图片 黄果树.png'}));
    expect(onRemoveAttachment).toHaveBeenCalledWith('asset-1');
  });

  it('生成中锁定操作并呈现状态',()=>{
    renderComposer({busy:true,prompt:'贵州避暑'});

    expect(screen.getByRole('button',{name:'添加参考图片'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'开始生成'})).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('正在生成');
  });

  it('错误就地呈现且保留输入和附件',()=>{
    renderComposer({
      attachments:[{
        id:'asset-1',
        name:'黄果树.png',
        previewUrl:'blob:yellow-falls',
        status:'failed',
      }],
      error:'素材生成失败，请稍后重试。',
      prompt:'贵州避暑',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('素材生成失败，请稍后重试。');
    expect(screen.getByRole('textbox',{name:'一句话创作需求'})).toHaveValue('贵州避暑');
    expect(screen.getByText('黄果树.png')).toBeInTheDocument();
  });

  it('视口变窄后重新计算多行输入高度',()=>{
    renderComposer({prompt:'为贵州夏季避暑活动生成一套年轻人喜欢的宣传素材'});
    const textarea=screen.getByRole('textbox',{name:'一句话创作需求'});
    Object.defineProperty(textarea,'scrollHeight',{configurable:true,value:72});

    fireEvent(window,new Event('resize'));

    expect(textarea).toHaveStyle({height:'72px'});
  });
});
