# 熱門時段臨時釋出

每 10 分鐘從 Tinybook 前台抓空間 1（三方案）與空間 4 的可預約時段，只列平日 14:30–21:30 內的時段，發布到 GitHub Pages。

- 調整熱門區間：`scripts/fetch.mjs` 上方的 `HOT_START`、`HOT_END`、`WEEKDAYS`
- 調整頁面：`docs/index.html`
- 手動更新：Actions → 更新熱門時段 → Run workflow
