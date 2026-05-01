# AI Builders Digest

每天早上自动抓取 AI 圈大牛的一手消息,生成一个聚合网页,在了解 AI 动态的同时顺便学英语。

🌐 **网站地址**: [kizimi.space](https://kizimi.space)

## 项目缘起

本项目基于 [Zara Zhang](https://github.com/zarazhangrui) 的 [follow-builders](https://github.com/zarazhangrui/follow-builders) 数据源,在此特别感谢 Zara 维护的优质 AI Builders 信息聚合 🙏。

原项目通过邮件每日推送摘要,我希望:

1. 把内容从邮件搬到网页,展示更友好
2. 加入英语学习功能,让每天的 AI 阅读顺便成为英语学习时间
3. 自动隐藏当天没发推文的博主,减少视觉噪音

整个项目从需求拆解、代码编写到部署上线,都是用 [Claude Code](https://www.anthropic.com/claude-code) 一步步辅助完成的。

## 功能特性

- **每日自动更新**: 通过 GitHub Actions 每天早上 9 点 (PT) 抓取最新动态
- **智能过滤**: 自动跳过当天没有内容的博主,只显示有价值的更新
- **每日金句**: 顶部展示当天最精彩的一句话,带原作者出处
- **生词标注**: AI 自动识别推文中值得学习的英语词汇,标注音标、词性、释义、近义词
- **俚语解释**: 解释科技圈常见的非正式表达和行业黑话(如 ship it、dogfooding、last mile 等)
- **中英对照**: 一键切换原文/中文翻译
- **播客深度处理**: 对长播客 transcript 自动生成中文摘要、核心观点、英语学习要点
- **历史归档**: 按日期归档,可以回看任意一天的 digest

## 技术栈

- **数据源**: [follow-builders](https://github.com/zarazhangrui/follow-builders) (Zara 维护的 X / 播客 / 博客聚合)
- **内容增强**: Claude API (翻译、生词标注、摘要生成)
- **网站生成**: Node.js 静态 HTML 生成
- **部署**: GitHub Pages + 自定义域名 (Cloudflare DNS)
- **自动化**: GitHub Actions 每日定时触发

## 工作流程

```
每天 9 AM PT (GitHub Actions)
    ↓
抓取 follow-builders 数据 (推文 / 播客 / 博客)
    ↓
Claude API 增强 (翻译 + 生词 + 俚语 + 摘要)
    ↓
生成静态 HTML (首页 + 归档页)
    ↓
推送到 GitHub Pages → kizimi.space
```

## 开发记录

这个项目是我用 Claude Code 探索 AI 辅助编程的一次实践:

- 从一个跑不通的邮件 cron job 开始排查问题
- 逐步改造成静态网站 + 英语学习工具
- 全程没有手写一行代码,通过和 Claude 对话完成需求澄清、架构设计、代码实现、调试部署

详细的迭代过程和踩过的坑,后续会写一篇博客分享。

## 后续计划

- [✅] 优化生词高亮的视觉效果(文中高亮 + 悬停查词)
- [✅] 每日查看全部信息进度
- [ ] 支持保存到 Obsedian
- [ ] 支持订阅 RSS / Email
- [ ] 增加学习进度追踪(已掌握的词汇)
- [ ] 生成一周 Summary
- [ ] 增加更多内容源

## 致谢

- [Zara Zhang](https://github.com/zarazhangrui) - 提供了 follow-builders 这个优质的数据基础
- [Anthropic](https://www.anthropic.com) - Claude Code 让独立开发者也能快速搭建复杂项目
- 以及所有被聚合的 AI Builders,你们的分享让这个领域充满活力

## License

MIT - 欢迎 fork 和改造成你自己的版本。
