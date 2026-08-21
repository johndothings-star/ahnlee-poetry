# Nguyên Anh — Website thơ

Website tĩnh tối giản cho thơ cá nhân. Phiên bản v2 được viết bằng Markdown, build thành HTML thuần và tự động deploy lên GitHub Pages khi push lên nhánh `main`.

## Thêm một bài thơ mới

1. Tạo file `content/poems/ten-bai-tho.md` (tên file sẽ là đường dẫn của bài).
2. Dùng mẫu sau:

```md
---
title: "Tên bài thơ"
date: "2026-08-21"
excerpt: "Một câu giới thiệu ngắn."
featured: true
---
Dòng thơ thứ nhất
Dòng thơ thứ hai

Khổ thơ tiếp theo
```

`featured: true` đưa bài lên Trang chủ. Tìm kiếm, bộ lọc năm và nút chọn ngẫu nhiên tự cập nhật từ các file Markdown; năm được lấy từ trường `date`. Để xem trên máy, chạy `npm run dev`. Trước khi đăng, chạy `npm run build` và `npm test`.

## Deploy

Trong GitHub, mở **Settings → Pages → Build and deployment** và chọn **GitHub Actions**. Sau đó mỗi lần push lên `main`, workflow sẽ build, kiểm tra và xuất bản website.
