# ere-keystate

Era-Electron 实时按键插件，由 Werenor 发布到本仓库 GitHub Releases。

游戏根目录 ere.launcher.json：
```json
{"plugins":[{"id":"ere-keystate","source":"github","repository":"Werenor/ere-keystate","fallback":true}]}
```

启动器从 Release 下载 ZIP，核对插件身份与文件摘要，只对临时引擎副本应用。兼容性按代码位置匹配，不按引擎版本号或整个 ASAR 哈希拦截。位置缺失或重复时不修改引擎，游戏降级运行。

接口：enableKeyState({keys:["KeyA","KeyD"]})、getKeyState()、disableKeyState()。捕获由游戏场景启用，退出时释放；失焦清空按键并停止原生轮询。不安装服务或全局键盘钩子。

运行 build.ps1 构建 Release ZIP。仅支持 Windows；GPL-2.0。补丁锚点源自 Era-Electron（https://gitgud.io/umaera/engine/era-electron），其权利与许可保持不变。

`fallback` 默认为 false：缺失插件时仅允许下载或取消，加载失败停止启动。只有游戏实现了兼容输入，才声明 true；启动器提示下载、兼容运行或取消。插件缓存按平台/仓库/ID区分。
