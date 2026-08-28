# 文旅营销素材生成 Demo

## 启动

```bash
npm install
npm run dev
```

前端 `http://localhost:5173`，后端 `http://localhost:8787`。默认 Mock，不依赖网络或模型密钥。

参考图最多 4 张、支持 JPG/PNG/WebP、单张 10MB；上传后保存在 `data/reference-assets/`，Demo 无登录，持有高熵 URL 即可访问。生成历史保存在当前浏览器本机（Demo 使用 localStorage 轻量实现，生产接入 IndexedDB），最多 20 条；清理本机历史不会删除后端参考图。
