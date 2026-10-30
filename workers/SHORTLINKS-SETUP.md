# 活動報名短網址

在現有 f00931-must Cloudflare 帳號建立 Worker，名稱 must-go。Edit code 貼上 activity-shortlinks.js 全文並 Deploy。網址應為 https://must-go.f00931-must.workers.dev 。不需要KV、Firebase、API金鑰或其他綁定。

/health 回傳 service=must-activity-shortlinks。後台重新產生公告時先檢查此服務，成功才用 /a/活動ID 短網址；尚未部署、暫時失敗或非一般ID時保留原報名網址。

短網址只302轉址至原活動報名頁，不儲存學生資料、不變更活動、不建立第三方短網址。原本網址永久保留。若Worker使用其他名稱，須同步修改 admin/js/admin.js 中的短網址主機。
