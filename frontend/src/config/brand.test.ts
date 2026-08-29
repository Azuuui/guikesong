import {describe,expect,it} from 'vitest';
import {BRAND} from './brand';

describe('BRAND',()=>{
  it('使用已确认名称和项目内 SVG',()=>{
    expect(BRAND).toMatchObject({
      nameZh:'黔景智作',
      nameEn:'QianScape AI',
      shortName:'QSAI',
    });
    expect(BRAND.logoUrl).toMatch(/^\/(?:frontend\/)?src\/assets\/brand\/.+\.svg\?no-inline$/);
    expect(BRAND.logoUrl).not.toMatch(/Users|xwechat|file:\/\//);
  });
});
