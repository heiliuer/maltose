# maltose

> 一个轻量的模拟服务器，支持livereload功能

## 安装

```
npm i maltose --save
```

## 使用

```javascript
var Maltose = require('maltose');
var maltose = new Maltose({
  port: 35729, // 端口，被占用的话会自动使用一个空闲的端口
  server: {
    baseDir: '', // 根目录
    index: '' // 预览页面url
  }
});
maltose.serve();

// livereload刷新浏览器
maltose.reload([pageUrl]);
```
