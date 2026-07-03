# GitHub 附件上傳說明

本系統不使用 Firebase Storage，附件會透過 GitHub Token 上傳到此 repo：

- owner：f00931must-hash
- repo：must-activity-system
- path：uploads/activity-attachments/

## 使用方式

1. 到 GitHub 建立 Fine-grained token 或 classic token。
2. 權限至少需要 Contents: Read and Write。
3. 到系統後台 → 系統設定 → GitHub 附件上傳設定。
4. 貼上 token 後按「儲存 Token」。
5. 回到活動管理，上傳圖片、PDF、Word、PPT。

Token 只存在目前這台電腦的瀏覽器 localStorage，不會寫進 Firestore。
