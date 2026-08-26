# Nguyên Anh — Website thơ

Website tĩnh tối giản cho thơ cá nhân. Nội dung được viết bằng Markdown, build thành HTML thuần và tự động deploy lên GitHub Pages khi push lên nhánh `main`. Website không có backend; “Dấu chân của tôi” chỉ dùng `localStorage` trên trình duyệt của người đọc.

## Thêm một bài thơ mới

1. Tạo file `content/poems/ten-bai-tho.md` (tên file sẽ là đường dẫn của bài).
2. Dùng mẫu sau:

```md
---
title: "Tên bài thơ"
date: "2026-08-21"
excerpt: "Một câu giới thiệu ngắn."
featured: true
path: "neo-que"
secondary_path: "neo-thanh-nhan"
themes: ["quê hương", "ký ức", "bình yên"]
---
Dòng thơ thứ nhất
Dòng thơ thứ hai

Khổ thơ tiếp theo
```

`path` là Nẻo chính. Sáu giá trị hợp lệ là `neo-que`, `neo-tinh`, `neo-phieu-du`, `neo-doi`, `neo-thanh-nhan`, `neo-tam`. `secondary_path` là Nẻo phụ và có thể bỏ. `themes` là danh sách chủ đề dùng để tạo liên kết “Bước tiếp”. `featured: true` đưa bài lên Trang chủ.

Tìm kiếm, bộ lọc năm, bài ngẫu nhiên, các trang Nẻo và dòng thời gian đều tự cập nhật từ các file Markdown; không hardcode tổng số bài.

## Thêm ảnh trải nghiệm cho một bài

1. Đặt ảnh gốc vào `src/assets/poems/`, ví dụ `src/assets/poems/ngo-nho.jpg`.
2. Thêm vào frontmatter của bài:

```md
image: "/assets/poems/ngo-nho.jpg"
image_alt: "Ngõ nhỏ quê nhà vào buổi sáng"
image_caption: ""
```

`image_alt` là bắt buộc khi có `image`; `image_caption` có thể bỏ. Nếu bài không khai báo ảnh, bố cục đọc thơ giữ nguyên và không hiện placeholder.

## Các trang hành trình

- `/neo/`: sáu Nẻo và số bài của từng Nẻo.
- `/neo/que/`, `/neo/tinh/`, `/neo/phieu-du/`, `/neo/doi/`, `/neo/thanh-nhan/`, `/neo/tam/`: các bài theo Nẻo chính.
- `/dong-thoi-gian/`: thơ nhóm theo năm cùng nhãn Nẻo.
- `/dau-chan-cua-toi/`: bản đồ đọc riêng trên từng trình duyệt; có thể xóa bất kỳ lúc nào.

Để xem trên máy, chạy `npm run dev`. Trước khi đăng, chạy `npm run build` và `npm test`.

## Deploy

Trong GitHub, mở **Settings → Pages → Build and deployment** và chọn **GitHub Actions**. Sau đó mỗi lần push lên `main`, workflow sẽ build, kiểm tra và xuất bản website.
