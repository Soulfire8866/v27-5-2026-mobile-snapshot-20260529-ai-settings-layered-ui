/**
 * Novel Export Utility
 * Handles formatted file generation for TXT, EPUB, DOCX, and PDF formats
 */
import { Chapter } from "../types";
import { saveBlobWithNativeFallback } from "./nativeFileSave";

export function exportChaptersToTxt(title: string, chapters: Chapter[], fromIdx: number, toIdx: number) {
  const selectedChapters = chapters.slice(fromIdx, toIdx + 1);
  let content = `=============================\n`;
  content += `${title.toUpperCase()}\n`;
  content += `Bản Quy Nhất Dịch Học - Dịch bằng Trí tuệ AI\n`;
  content += `=============================\n\n`;

  selectedChapters.forEach((ch) => {
    content += `\n\n${ch.title}\n`;
    content += `-----------------------------\n`;
    content += ch.translatedText + "\n";
  });

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadFile(blob, `${title}_Chương_${fromIdx + 1}_den_${toIdx + 1}.txt`);
}

export function exportChaptersToDocx(title: string, chapters: Chapter[], fromIdx: number, toIdx: number) {
  const selectedChapters = chapters.slice(fromIdx, toIdx + 1);
  
  // Custom styled MSOffice XML/HTML string which Word parses natively as high-fidelity Docx
  let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>`;
  html += `<head><title>${title}</title><meta charset='utf-8'>`;
  html += `<style>
    body { font-family: 'Times New Roman', Times, serif; line-height: 1.6; }
    h1 { text-align: center; color: #b45309; }
    h2 { font-size: 20px; page-break-before: always; border-b: 1px solid #ddd; padding-bottom: 5px; color: #1e293b; }
    p { margin-bottom: 12px; text-indent: 30px; text-align: justify; }
  </style></head><body>`;
  
  html += `<h1>${title}</h1>`;
  html += `<p style='text-align: center; text-indent: 0; italic: true'>Bản dịch trôi chảy dịch bằng AI Studio</p>`;
  
  selectedChapters.forEach((ch) => {
    html += `<h2>${ch.title}</h2>`;
    ch.translatedText.split('\n').forEach(line => {
      if (line.trim()) {
        html += `<p>${line.trim()}</p>`;
      }
    });
  });
  
  html += `</body></html>`;
  
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  downloadFile(blob, `${title}_Chương_${fromIdx + 1}_den_${toIdx + 1}.doc`);
}

export function exportChaptersToEpub(title: string, chapters: Chapter[], fromIdx: number, toIdx: number) {
  const selectedChapters = chapters.slice(fromIdx, toIdx + 1);
  
  // Assemble a beautiful offline singlefile e-reader XHTML book
  let epubText = `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n`;
  epubText += `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">\n<head>\n`;
  epubText += `<title>${title}</title>\n`;
  epubText += `<style>
    body { font-family: Georgia, serif; padding: 20px; color: #2c3e50; line-height: 1.8; }
    header { text-align: center; border-bottom: 2px solid #ecd4a2; padding-bottom: 20px; margin-bottom: 30px; }
    h1 { font-size: 28px; color: #b45309; }
    .chapter { page-break-after: always; margin-top: 40px; }
    h2 { font-size: 22px; color: #1e293b; border-bottom: 1px solid #ddd; pb: 4px; }
    p { text-indent: 2em; text-align: justify; margin-bottom: 15px; }
  </style>\n</head>\n<body>\n`;

  epubText += `<header>\n<h1>${title}</h1>\n<p>Dịch thuật tự động bằng Tiên Hiệp AI</p>\n</header>\n`;

  selectedChapters.forEach((ch) => {
    epubText += `<div class="chapter">\n`;
    epubText += `<h2>${ch.title}</h2>\n`;
    ch.translatedText.split('\n').forEach(line => {
      if (line.trim()) {
        epubText += `<p>${line.trim()}</p>\n`;
      }
    });
    epubText += `</div>\n`;
  });

  epubText += `</body>\n</html>`;

  const blob = new Blob([epubText], { type: "application/epub+zip;charset=utf-8" });
  downloadFile(blob, `${title}_Chương_${fromIdx + 1}_den_${toIdx + 1}.epub`);
}

export function triggerBrowserPrint(title: string, chapters: Chapter[], fromIdx: number, toIdx: number) {
  // Open a gorgeous print view of selected chapters
  const selectedChapters = chapters.slice(fromIdx, toIdx + 1);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Vui lòng cho phép Pop-up để mở bản in PDF của truyện!");
    return;
  }

  let html = `<html><head><title>In sách: ${title}</title>`;
  html += `<style>
    body { font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.6; font-size: 14pt; }
    h1 { text-align: center; margin-bottom: 50px; }
    .chapter { page-break-after: always; }
    h2 { font-size: 18pt; margin-top: 30px; border-bottom: 1px solid #999; padding-bottom: 5px; }
    p { text-indent: 1.5in; text-align: justify; margin-bottom: 15px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style></head><body>`;

  html += `<div class="no-print" style="background:#f3f4f6; padding:15px; text-align:center; margin-bottom:20px; border-radius:8px;">
    <strong>ẤN NÚT IN TRÊN TRÌNH DUYỆT ĐỂ LƯU THÀNH FILE PDF</strong><br/>
    <button onclick="window.print()" style="margin-top:10px; padding:8px 16px; background:#f59e0b; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">MỞ HỘP THOẠI IN (SAVE AS PDF)</button>
  </div>`;

  html += `<h1>${title}</h1>`;
  selectedChapters.forEach((ch) => {
    html += `<div class="chapter">`;
    html += `<h2>${ch.title}</h2>`;
    ch.translatedText.split('\n').forEach(line => {
      if (line.trim()) {
        html += `<p>${line.trim()}</p>`;
      }
    });
    html += `</div>`;
  });

  html += `</body></html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

function detectMimeByName(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".epub")) return "application/epub+zip";
  return "application/octet-stream";
}

function downloadFile(blob: Blob, filename: string) {
  void saveBlobWithNativeFallback(blob, filename, detectMimeByName(filename));
}
