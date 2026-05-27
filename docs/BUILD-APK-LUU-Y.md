# Lưu ý build APK Android

## Thư mục làm việc (quan trọng)

| Thư mục | Dùng cho |
|---------|----------|
| `E:\v24.5.2026 mobile_v3` (**gốc**, có `package.json`, `capacitor.config.ts`) | `npm run build`, `npx cap sync android`, `npm run android:release` |
| `E:\v24.5.2026 mobile_v3\android` (có `gradlew.bat`) | **Chỉ** `.\gradlew clean assembleRelease` |

Nếu prompt là `PS ...\mobile_v3\android>` mà chạy `npx cap sync android` → lỗi **`android platform has not been added yet`**.  
Nếu đã ở `android` mà `cd android` → lỗi **không tìm thấy `android\android`**.

```powershell
# Luôn bắt đầu từ thư mục GỐC dự án:
cd "E:\v24.5.2026 mobile_v3"
```

## Đồng bộ web → Android (chạy ở thư mục gốc)

```powershell
cd "E:\v24.5.2026 mobile_v3"
npm run build
npx cap sync android
```

Sau `cap sync`, kiểm tra file mới nhất:

`android/app/src/main/assets/public/assets/index-*.js`

Trong bundle **mới** phải **không** có chuỗi `có thể chương quá dài`, và **có** `tự chia nhỏ đoạn`.

## Release APK — phải `clean`

Android Studio / `assembleRelease` có thể dùng cache cũ tại:

`android/app/build/intermediates/assets/release/`

Nếu không clean, APK release vẫn chứa JS cũ dù `src/main/assets` đã mới.

**Khuyến nghị (một lệnh, tự đúng thư mục):**

```powershell
cd "E:\v24.5.2026 mobile_v3"
npm run android:release
```

(script: `build` → `cap sync` → `android\gradlew clean assembleRelease`)

**Thủ công từng bước:**

```powershell
cd "E:\v24.5.2026 mobile_v3"
npm run build
npx cap sync android
cd android
.\gradlew clean assembleRelease
```

Hoặc Android Studio → **Build → Clean Project**, rồi **Build → Generate Signed Bundle / APK**.

## Xác nhận lỗi mới trên máy

Sau khi cài APK mới, nếu DeepSeek trả rỗng, thông báo dạng:

`[DeepSeek] HTTP 200: API trả về rỗng ... model deepseek-v4-flash; app sẽ tự chia nhỏ đoạn và thử lại.`

Nếu vẫn thấy `có thể chương quá dài hoặc bị lọc nội dung` → APK vẫn là bản JS cũ.
